import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { LocatorStrategy as PrismaLocatorStrategy } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { generateRunnableSpec } from './generate-runnable-spec';
import { flattenComponentSteps, applyDataRow, applyVariables, substituteVariables } from '../tests/step-flattener';
import { classifyHealth } from '../tests/health-classification';
import type { RecordedStep } from '../recording/step-parser';
import type { ExecutionJobData } from './execution.service';
import type { HealEventPayload } from './runtime/types';
import { createHyperbrowserSession, stopHyperbrowserSession } from './runtime/hyperbrowser-client';

const EXEC_ROOT = join(process.cwd(), 'tmp', 'execution');

interface StepResult {
  passed: boolean;
  durationMs: number;
  errorMessage?: string;
  tracePath?: string;
  videoPath?: string;
  screenshotPath?: string;
}

const ANSI_PATTERN = new RegExp(String.fromCharCode(27) + String.raw`\[[0-9;]*[a-zA-Z]`, 'g');

/** Strips ANSI color codes from Playwright's CLI output and trims it to the most useful
 *  slice (the failure block) so a run's errorMessage is actually diagnosable in the UI,
 *  instead of just "exited with code 1". */
function summarizePlaywrightOutput(output: string): string {
  const clean = output
    .replace(ANSI_PATTERN, '')
    .split('\n')
    .filter((line) => !line.includes('__TESTORA_EVENT__'))
    .join('\n')
    .trim();
  if (!clean) return 'Playwright exited with a non-zero code and produced no output.';
  const failureIndex = clean.search(/\d+\)\s|Error:|TimeoutError|No tests found/);
  const relevant = failureIndex >= 0 ? clean.slice(failureIndex) : clean;
  return relevant.length > 2000 ? relevant.slice(0, 2000) + '\n… (truncated)' : relevant;
}

function findFile(dir: string, name: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const nested = findFile(full, name);
      if (nested) return nested;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

function findFileBySuffix(dir: string, suffix: string): string | null {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const nested = findFileBySuffix(full, suffix);
      if (nested) return nested;
    } else if (entry.endsWith(suffix)) {
      return full;
    }
  }
  return null;
}

interface StepEvent {
  index: number;
  action: string;
  status: string;
  message?: string;
}

const EVENT_MARKER = '__TESTORA_EVENT__';

/** The generated spec (see generate-runnable-spec.ts's emitStep/emitEvent) logs one
 *  __TESTORA_EVENT__<json> line per step transition. stdout arrives in arbitrary chunks —
 *  not line-aligned — so this buffers a trailing partial line across calls, and returns
 *  parsed events (rather than firing a callback per line) so the caller can persist them
 *  one at a time, in order — a batch of un-awaited concurrent inserts from one chunk was
 *  silently dropping some events under load. */
class StepEventScanner {
  private buffer = '';

  feed(chunk: string): StepEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    const events: StepEvent[] = [];
    for (const line of lines) {
      const idx = line.indexOf(EVENT_MARKER);
      if (idx === -1) continue;
      try {
        events.push(JSON.parse(line.slice(idx + EVENT_MARKER.length)) as StepEvent);
      } catch {
        // malformed/partial marker line — ignore, this is best-effort progress reporting
      }
    }
    return events;
  }
}

interface TestWithEnvironment {
  id: string;
  name: string;
  targetUrl: string | null;
  steps: unknown;
  retries: number;
  viewportWidth: number | null;
  viewportHeight: number | null;
  userAgent: string | null;
  apiMethod: string | null;
  apiEndpoint: string | null;
  apiHeaders: unknown;
  apiBody: unknown;
  environment: { variables: Array<{ key: string; value: string }> } | null;
}

@Processor('execution')
export class ExecutionProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<ExecutionJobData>): Promise<void> {
    const run = await this.prisma.run.findUniqueOrThrow({
      where: { id: job.data.runId },
      include: { test: { include: { environment: { include: { variables: true } } } } },
    });
    await this.prisma.run.update({ where: { id: run.id }, data: { status: 'RUNNING' } });

    const envVars: Record<string, string> | null = run.test.environment
      ? Object.fromEntries(run.test.environment.variables.map((v) => [v.key, v.value]))
      : null;

    let finalStatus: 'PASSED' | 'FAILED' = 'PASSED';
    try {
      const results: StepResult[] = [];
      // Functional + API: validate the backend API AND the frontend flow together — both
      // must pass for the combined run to be considered passing.
      if (run.test.type === 'WEB' || run.test.type === 'WEB_API') {
        results.push(
          await this.executeWebTest(run.id, run.test, run.browser, run.headed, run.dataRow as Record<string, unknown> | null, envVars),
        );
      }
      if (run.test.type === 'API' || run.test.type === 'WEB_API') {
        results.push(await this.executeApiTest(run.test, run.dataRow as Record<string, unknown> | null, envVars));
      }

      const passed = results.every((r) => r.passed);
      finalStatus = passed ? 'PASSED' : 'FAILED';
      const durationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
      const errorMessage = results.find((r) => !r.passed)?.errorMessage ?? null;
      const tracePath = results.find((r) => r.tracePath)?.tracePath;
      const videoPath = results.find((r) => r.videoPath)?.videoPath;
      const screenshotPath = results.find((r) => r.screenshotPath)?.screenshotPath;

      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: finalStatus, finishedAt: new Date(), durationMs, errorMessage, tracePath, videoPath, screenshotPath },
      });

      await this.diffAgainstVisualBaseline(run.id, run.test.visualBaselinePath, screenshotPath);
    } catch (err) {
      finalStatus = 'FAILED';
      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: err instanceof Error ? err.message : String(err) },
      });
    }

    await this.maybeAutoQuarantine(run.test.id, run.test.quarantined);

    if (run.suiteRunId) {
      await this.maybeFinalizeSuiteRun(run.suiteRunId);
    } else if (finalStatus === 'FAILED') {
      const project = await this.prisma.project.findUnique({ where: { id: run.test.projectId }, select: { webhookUrl: true } });
      if (project?.webhookUrl) {
        await this.notifications.post(project.webhookUrl, `❌ Test "${run.test.name}" failed. View it in Testora.`);
      }
    }
  }

  /** The run that first pushes a test's last-10-run history into FLAKY (mixed pass/fail,
   *  see classifyHealth) auto-quarantines it. Never re-quarantines a test the user has
   *  manually un-quarantined — this only flips false -> true, so it can't fight a user who
   *  consciously decided to keep a flaky test running. */
  private async maybeAutoQuarantine(testId: string, alreadyQuarantined: boolean): Promise<void> {
    if (alreadyQuarantined) return;
    const recent = await this.prisma.run.findMany({
      where: { testId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { status: true },
    });
    const statuses = recent.map((r) => r.status).filter((s): s is 'PASSED' | 'FAILED' => s === 'PASSED' || s === 'FAILED');
    if (classifyHealth(statuses) === 'FLAKY') {
      await this.prisma.test.update({ where: { id: testId }, data: { quarantined: true, quarantinedAt: new Date() } });
    }
  }

  /** Visual regression: compares this run's own screenshot against the test's stored
   *  baseline (set via TestsService.setVisualBaseline) with pixelmatch. Purely informational
   *  — it records a diff percentage/image, it never changes the run's PASSED/FAILED status.
   *  A dimension mismatch (baseline predates a viewport change, etc.) is treated as "not
   *  comparable" rather than an error. Wrapped so a diffing bug can never break run
   *  finalization, which has already happened by the time this runs. */
  private async diffAgainstVisualBaseline(runId: string, baselinePath: string | null, screenshotPath: string | undefined): Promise<void> {
    if (!baselinePath || !screenshotPath) return;
    if (!existsSync(baselinePath) || !existsSync(screenshotPath)) return;
    try {
      const baseline = PNG.sync.read(readFileSync(baselinePath));
      const actual = PNG.sync.read(readFileSync(screenshotPath));
      if (baseline.width !== actual.width || baseline.height !== actual.height) return;

      const diff = new PNG({ width: baseline.width, height: baseline.height });
      const diffPixels = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, { threshold: 0.1 });
      const visualDiffPercent = (diffPixels / (baseline.width * baseline.height)) * 100;

      const diffPath = join(EXEC_ROOT, runId, 'output', 'diff.png');
      writeFileSync(diffPath, PNG.sync.write(diff));

      await this.prisma.run.update({ where: { id: runId }, data: { visualDiffPercent, visualDiffPath: diffPath } });
    } catch (err) {
      console.error(`Visual diff failed for run ${runId}:`, err);
    }
  }

  /** A Suite fans each of its tests into one-or-more Runs under one SuiteRun (see
   *  SuitesService.runSuite). Once every one of those Runs has finished, roll the
   *  SuiteRun's own status up — otherwise it would sit at RUNNING forever. */
  private async maybeFinalizeSuiteRun(suiteRunId: string): Promise<void> {
    const runs = await this.prisma.run.findMany({ where: { suiteRunId } });
    if (runs.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING')) return;
    // SKIPPED (quarantined) tests don't count against the suite — that's the whole point of
    // quarantining a flaky test rather than deleting it from the suite.
    const allPassed = runs.every((r) => r.status === 'PASSED' || r.status === 'SKIPPED');
    await this.prisma.suiteRun.update({
      where: { id: suiteRunId },
      data: { status: allPassed ? 'PASSED' : 'FAILED', finishedAt: new Date() },
    });

    if (!allPassed) {
      const suiteRun = await this.prisma.suiteRun.findUnique({
        where: { id: suiteRunId },
        include: { suite: { include: { project: { select: { webhookUrl: true } } } } },
      });
      if (suiteRun?.suite.project.webhookUrl) {
        await this.notifications.post(
          suiteRun.suite.project.webhookUrl,
          `❌ Suite "${suiteRun.suite.name}" failed. View it in Testora.`,
        );
      }
    }
  }

  private async executeApiTest(
    test: { apiMethod: string | null; apiEndpoint: string | null; apiHeaders: unknown; apiBody: unknown },
    dataRow: Record<string, unknown> | null,
    envVars: Record<string, string> | null,
  ): Promise<StepResult> {
    const started = Date.now();
    if (!test.apiEndpoint || !test.apiMethod) throw new Error('API test is missing method/endpoint');

    // Data-driven substitution ({{column}}) and Environment Variables ({{env.KEY}}) both
    // apply to the endpoint URL, e.g. /users/{{userId}} against {{env.BASE_URL}}.
    let endpoint = test.apiEndpoint;
    if (dataRow) endpoint = applyDataRow([{ action: 'goto', value: endpoint }], dataRow)[0]!.value!;
    endpoint = substituteVariables(endpoint, envVars);

    const rawHeaders = (test.apiHeaders as Record<string, string>) ?? {};
    const headers = Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k, substituteVariables(v, envVars)]));

    let body: unknown = test.apiBody;
    if (envVars && typeof body === 'string') body = substituteVariables(body, envVars);
    else if (envVars && body && typeof body === 'object') {
      body = JSON.parse(substituteVariables(JSON.stringify(body), envVars));
    }

    const res = await fetch(endpoint, {
      method: test.apiMethod,
      headers,
      body: test.apiMethod !== 'GET' && body ? JSON.stringify(body) : undefined,
    });
    const durationMs = Date.now() - started;
    const passed = res.status < 400;
    return { passed, durationMs, errorMessage: passed ? undefined : `HTTP ${res.status} ${res.statusText}` };
  }

  private async executeWebTest(
    runId: string,
    test: TestWithEnvironment,
    browser: string,
    headed: boolean,
    dataRow: Record<string, unknown> | null,
    envVars: Record<string, string> | null,
  ): Promise<StepResult> {
    if (!test.targetUrl) throw new Error('Web test is missing a target URL');

    const locators = await this.prisma.locator.findMany({ where: { testId: test.id } });
    // Locator keys ("step-N") are materialized against the FLATTENED step list (see
    // materializeLocators callers) so they line up with the indices generateRunnableSpec
    // sees here. Do NOT prepend a synthetic goto to this array — generateRunnableSpec
    // emits the initial navigation itself, outside the indexed loop, so it can't shift
    // every subsequent locator key off by one (see the comment there for how badly that
    // used to fail: steps silently skipped, no error, self-healing never even invoked).
    let steps = await flattenComponentSteps(this.prisma, (test.steps as RecordedStep[]) ?? []);
    steps = applyDataRow(steps, dataRow);
    steps = applyVariables(steps, envVars);
    // applyVariables only touches step.value/step.selector — the test's own targetUrl
    // (used below for the initial navigation when steps[0] isn't itself a goto) is a
    // separate field and needs the same {{env.KEY}} substitution, or a test built to
    // navigate to {{env.baseUrl}} would literally goto that unresolved literal string.
    const targetUrl = substituteVariables(test.targetUrl, envVars);

    const runDir = join(EXEC_ROOT, runId);
    mkdirSync(runDir, { recursive: true });
    const specPath = join(runDir, 'spec.spec.ts');
    const healEventsPath = join(runDir, 'heal-events.json');
    const outputDir = join(runDir, 'output');

    const spec = generateRunnableSpec(
      test.name,
      steps,
      locators.map((l) => ({ key: l.key, strategy: l.strategy, value: l.value, roleName: l.roleName })),
      healEventsPath,
      { viewportWidth: test.viewportWidth, viewportHeight: test.viewportHeight, userAgent: test.userAgent },
      targetUrl,
    );
    writeFileSync(specPath, spec, 'utf-8');

    const started = Date.now();
    const { exitCode, output } = await this.spawnPlaywright(specPath, browser, outputDir, test.retries, headed, (event) =>
      this.prisma.runStepEvent
        .create({ data: { runId, index: event.index, action: event.action, status: event.status, message: event.message } })
        .then(() => undefined)
        .catch((err) => console.error(`Failed to persist step event for run ${runId}:`, err)),
    );
    const durationMs = Date.now() - started;

    const tracePath = findFile(outputDir, 'trace.zip');
    const videoPath = findFile(outputDir, 'video.webm');
    const screenshotPath = findFileBySuffix(outputDir, '.png');

    await this.persistHealEvents(runId, test.id, healEventsPath);
    rmSync(specPath, { force: true });

    return {
      passed: exitCode === 0,
      durationMs,
      errorMessage: exitCode === 0 ? undefined : summarizePlaywrightOutput(output),
      tracePath: tracePath ?? undefined,
      videoPath: videoPath ?? undefined,
      screenshotPath: screenshotPath ?? undefined,
    };
  }

  private async spawnPlaywright(
    specPath: string,
    browser: string,
    outputDir: string,
    retries: number,
    headed: boolean,
    onEvent: (event: StepEvent) => Promise<void>,
  ): Promise<{ exitCode: number; output: string }> {
    // Every run goes through Hyperbrowser (stealth + captcha solving) when configured,
    // instead of launching Chromium locally — a plain, undisguised browser gets served a
    // bot-detection interstitial by plenty of real sites (Amazon among them) instead of
    // the actual page, which no amount of locator healing can recover from since the
    // element it's looking for was never on that page to begin with. Falls back to a
    // normal local launch if Hyperbrowser itself is unreachable or out of credits, rather
    // than failing every single run whenever Hyperbrowser has a bad moment.
    const env = { ...process.env };
    let hyperbrowserSessionId: string | null = null;
    if (process.env.HYPERBROWSER_API_KEY) {
      try {
        const session = await createHyperbrowserSession(10);
        hyperbrowserSessionId = session.id;
        env.HYPERBROWSER_WS_ENDPOINT = session.wsEndpoint;
      } catch (err) {
        console.error('Hyperbrowser session creation failed, falling back to a local browser launch:', err);
      }
    }

    try {
      return await new Promise((resolve) => {
        // Playwright treats the file argument as a regex — on Windows, path.join()'s
        // backslashes have special regex meaning (e.g. \e, \1) and silently break the
        // match, producing "No tests found" instead of running the spec.
        const args = [
          'playwright',
          'test',
          '--config=playwright.exec.config.ts',
          specPath.replace(/\\/g, '/'),
          `--project=${browser}`,
          `--output=${outputDir}`,
          `--retries=${retries}`,
        ];
        // "Headed" only makes sense for a locally-launched browser someone can actually
        // see — moot once connected to a remote Hyperbrowser session (its own liveUrl is
        // the only way to watch it, and this codepath doesn't wire that up for execution
        // runs), and still needs the no-display fallback for the local-launch case below.
        const hasDisplay = process.platform !== 'linux' || !!process.env.DISPLAY;
        if (headed && hasDisplay && !env.HYPERBROWSER_WS_ENDPOINT) args.push('--headed');
        const child = spawn('npx', args, { shell: true, cwd: process.cwd(), env });
        let output = '';
        const scanner = new StepEventScanner();
        // Persist events one at a time, in the order they were emitted — a batch of
        // un-awaited concurrent inserts from a single stdout chunk was silently dropping
        // some events (visible as healing steps vanishing from the live log).
        let eventChain: Promise<void> = Promise.resolve();
        const onChunk = (chunk: Buffer) => {
          const text = chunk.toString();
          output += text;
          for (const event of scanner.feed(text)) {
            eventChain = eventChain.then(() => onEvent(event));
          }
        };
        child.stdout.on('data', onChunk);
        child.stderr.on('data', onChunk);
        child.on('close', (code) => {
          eventChain.finally(() => resolve({ exitCode: code ?? 1, output }));
        });
      });
    } finally {
      if (hyperbrowserSessionId) await stopHyperbrowserSession(hyperbrowserSessionId);
    }
  }

  private async persistHealEvents(runId: string, testId: string, healEventsPath: string): Promise<void> {
    if (!existsSync(healEventsPath)) return;
    const events = JSON.parse(readFileSync(healEventsPath, 'utf-8')) as HealEventPayload[];

    for (const event of events) {
      await this.prisma.healEvent.create({
        data: {
          runId,
          locatorKey: event.locatorKey,
          failedStrategy: event.failedStrategy.toUpperCase() as PrismaLocatorStrategy,
          healedStrategy: event.healedStrategy.toUpperCase() as PrismaLocatorStrategy,
          method: event.method,
          provider: event.provider,
          model: event.model,
          oldValue: event.oldValue,
          newValue: event.newValue,
          verified: event.verified,
        },
      });

      // Persist the improvement so the NEXT run starts from the healed locator —
      // this is what makes self-healing cumulative rather than repeating the same
      // repair every single run.
      await this.prisma.locator.update({
        where: { testId_key: { testId, key: event.locatorKey } },
        data: { strategy: event.healedStrategy.toUpperCase() as PrismaLocatorStrategy, value: event.newValue },
      });
    }
  }
}
