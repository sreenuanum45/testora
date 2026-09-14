import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { LlmProviderService } from '../llm/llm-provider.service';
import { TestsService } from '../tests/tests.service';

export interface ExecutionJobData {
  runId: string;
}

@Injectable()
export class ExecutionService {
  constructor(
    @InjectQueue('execution') private readonly queue: Queue<ExecutionJobData>,
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly llm: LlmProviderService,
    private readonly tests: TestsService,
  ) {}

  /** Returns an array even for a normal (non-data-driven) run — a Data-Driven test with a
   *  DataSet attached fans out into one Run per row here, so callers always handle "one or
   *  more runs were just queued" uniformly instead of a single-vs-fan-out branch. */
  async enqueueRun(userId: string, projectId: string, testId: string, browser = 'chromium', headed = false) {
    await this.projects.findOneOwned(userId, projectId);
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test || test.projectId !== projectId) throw new NotFoundException('Test not found');

    if (test.dataSetId) {
      const dataSet = await this.prisma.dataSet.findUnique({ where: { id: test.dataSetId } });
      const rows = (dataSet?.rows as unknown as Array<Record<string, unknown>>) ?? [];
      if (rows.length > 0) {
        const runs = [];
        for (const [index, row] of rows.entries()) {
          const run = await this.prisma.run.create({
            data: { testId, status: 'QUEUED', browser, headed, dataRowIndex: index, dataRow: row as object },
          });
          await this.queue.add('run-test', { runId: run.id }, { removeOnComplete: 50, removeOnFail: 50 });
          runs.push(run);
        }
        return runs;
      }
    }

    const run = await this.prisma.run.create({ data: { testId, status: 'QUEUED', browser, headed } });
    await this.queue.add('run-test', { runId: run.id }, { removeOnComplete: 50, removeOnFail: 50 });
    return [run];
  }

  async getRun(userId: string, projectId: string, runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId }, include: { test: true, healEvents: true } });
    if (!run) throw new NotFoundException('Run not found');
    await this.projects.findOneOwned(userId, run.test.projectId);
    return run;
  }

  async listRunsForTest(userId: string, projectId: string, testId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.run.findMany({
      where: { testId },
      orderBy: { startedAt: 'desc' },
      include: { healEvents: true },
      take: 50,
    });
  }

  /** Step-by-step progress for one run — populated live as a WEB test executes (see
   *  ExecutionProcessor/generate-runnable-spec's emitStep), so this doubles as both a
   *  live-progress feed (poll while the run is RUNNING) and a permanent step-level report
   *  once it's finished. */
  async listStepEvents(userId: string, projectId: string, runId: string) {
    await this.getRun(userId, projectId, runId);
    return this.prisma.runStepEvent.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } });
  }

  /**
   * Turns a run's raw Playwright output (stack trace, attachment paths, ANSI-stripped CLI
   * noise) into a short plain-English "why + what to check" explanation — reuses the same
   * Groq -> Gemini -> OpenRouter -> OpenAI chain self-healing already depends on, applied to
   * diagnosis instead of repair. Computed on demand (not persisted) since it's cheap and a
   * user will only ever want this for the run they're actively looking at.
   */
  async explainFailure(userId: string, projectId: string, runId: string) {
    const run = await this.getRun(userId, projectId, runId);
    if (run.status !== 'FAILED' || !run.errorMessage) {
      throw new NotFoundException('This run has no failure to explain.');
    }

    const healSummary = run.healEvents.length
      ? `Self-healing repaired ${run.healEvents.length} locator(s) during this run before the failure: ${run.healEvents
          .map((h) => `"${h.locatorKey}" (${h.method})`)
          .join(', ')}.`
      : 'No locators were healed during this run.';

    const systemPrompt =
      'You are a QA engineer\'s assistant reading a failed Playwright test\'s raw output. ' +
      'In 2-4 short sentences, explain in plain English the MOST LIKELY reason it failed and ' +
      'one concrete thing to check or try next. Do not quote the raw stack trace back. Do not ' +
      'use markdown. If the output shows a whole-test timeout with no specific locator error, ' +
      'say so plainly rather than guessing at a cause the output doesn\'t support.';
    const userPrompt = [
      `Test: ${run.test.name} (${run.test.type})`,
      run.test.targetUrl ? `Target URL: ${run.test.targetUrl}` : null,
      healSummary,
      'Raw failure output:',
      run.errorMessage.slice(0, 4000),
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.llm.completeWithFallback(systemPrompt, userPrompt);
    return { summary: result.raw.trim(), provider: result.provider, model: result.model };
  }

  /**
   * Diffs two runs step-by-step — answers "why did this start failing after run #47"
   * directly instead of making someone eyeball two separate step logs side by side. Aligns
   * step events by index (taking each index's FINAL status, since a healed step logs
   * running -> heal events -> passed and only the last status matters for the diff), and
   * separately calls out which locators healed in one run but not the other.
   */
  async compareRuns(userId: string, projectId: string, runIdA: string, runIdB: string) {
    const [a, b] = await Promise.all([this.getRun(userId, projectId, runIdA), this.getRun(userId, projectId, runIdB)]);
    const [eventsA, eventsB] = await Promise.all([
      this.prisma.runStepEvent.findMany({ where: { runId: runIdA }, orderBy: { createdAt: 'asc' } }),
      this.prisma.runStepEvent.findMany({ where: { runId: runIdB }, orderBy: { createdAt: 'asc' } }),
    ]);

    const finalStatusByIndex = (events: typeof eventsA): Map<number, string> => {
      const map = new Map<number, string>();
      for (const e of events) {
        if (e.action === 'heal') continue; // heal events share the triggering step's index but aren't the step's own status
        map.set(e.index, e.status);
      }
      return map;
    };
    const statusA = finalStatusByIndex(eventsA);
    const statusB = finalStatusByIndex(eventsB);
    const allIndices = [...new Set([...statusA.keys(), ...statusB.keys()])].sort((x, y) => x - y);

    const stepDiff = allIndices.map((index) => {
      const sA = statusA.get(index) ?? null;
      const sB = statusB.get(index) ?? null;
      return { index, statusA: sA, statusB: sB, changed: sA !== sB };
    });

    const keyOf = (h: { locatorKey: string; oldValue: string; newValue: string }): string => `${h.locatorKey}:${h.oldValue}->${h.newValue}`;
    const healKeysA = new Set(a.healEvents.map(keyOf));
    const healKeysB = new Set(b.healEvents.map(keyOf));

    return {
      runA: {
        id: a.id,
        status: a.status,
        startedAt: a.startedAt,
        durationMs: a.durationMs,
        browser: a.browser,
        errorMessage: a.errorMessage,
      },
      runB: {
        id: b.id,
        status: b.status,
        startedAt: b.startedAt,
        durationMs: b.durationMs,
        browser: b.browser,
        errorMessage: b.errorMessage,
      },
      durationDeltaMs: (b.durationMs ?? 0) - (a.durationMs ?? 0),
      statusChanged: a.status !== b.status,
      stepDiff,
      healsOnlyInA: a.healEvents.filter((h) => !healKeysB.has(keyOf(h))),
      healsOnlyInB: b.healEvents.filter((h) => !healKeysA.has(keyOf(h))),
    };
  }

  /**
   * A one-click natural-language "standup update" for the project's last 7 days — pass-rate
   * trend vs. the prior week, which tests are flaky/broken right now, and how much self-
   * healing absorbed. Composes the health/heal-insights data already computed elsewhere
   * into one summary, then has the LLM chain write it up in plain English rather than
   * making someone read three separate panels to piece the same story together themselves.
   */
  async getWeeklyDigest(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisWeekRuns, lastWeekRuns, healsThisWeek, health] = await Promise.all([
      this.prisma.run.findMany({
        where: { test: { projectId }, startedAt: { gte: weekAgo } },
        select: { status: true },
      }),
      this.prisma.run.findMany({
        where: { test: { projectId }, startedAt: { gte: twoWeeksAgo, lt: weekAgo } },
        select: { status: true },
      }),
      this.prisma.healEvent.count({ where: { run: { test: { projectId }, startedAt: { gte: weekAgo } } } }),
      this.tests.getHealthSummary(userId, projectId),
    ]);

    const passRate = (runs: { status: string }[]): number | null => {
      const finished = runs.filter((r) => r.status === 'PASSED' || r.status === 'FAILED');
      return finished.length > 0 ? Math.round((finished.filter((r) => r.status === 'PASSED').length / finished.length) * 100) : null;
    };

    const testsById = new Map((await this.prisma.test.findMany({ where: { projectId }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    const broken = health.filter((h) => h.classification === 'BROKEN').map((h) => testsById.get(h.testId) ?? h.testId);
    const flaky = health.filter((h) => h.classification === 'FLAKY').map((h) => testsById.get(h.testId) ?? h.testId);

    const summary = {
      period: 'last 7 days',
      totalRuns: thisWeekRuns.length,
      passRateThisWeek: passRate(thisWeekRuns),
      passRateLastWeek: passRate(lastWeekRuns),
      brokenTests: broken,
      flakyTests: flaky,
      locatorsHealedThisWeek: healsThisWeek,
    };

    if (summary.totalRuns === 0 && broken.length === 0 && flaky.length === 0) {
      return { digest: 'No runs in the last 7 days — nothing to report yet.', provider: null, model: null, summary };
    }

    const systemPrompt =
      'You write a short weekly status update for a QA test-automation project, like a standup update. ' +
      'You are given a JSON summary of the last 7 days: run counts, pass rate this week vs. last week, ' +
      'which tests are currently BROKEN (consistently failing) or FLAKY (inconsistent), and how many ' +
      'locators self-healing repaired. Write 3-5 sentences, plain English, no markdown, no headers. Lead ' +
      'with the overall trend (better/worse/steady than last week), name specific broken/flaky tests by ' +
      "name if any exist, and mention the heal count only if it's notable (don't force it in). If there's " +
      'truly nothing to report, say so briefly rather than padding.';
    const result = await this.llm.completeWithFallback(systemPrompt, JSON.stringify(summary, null, 2));

    return { digest: result.raw.trim(), provider: result.provider, model: result.model, summary };
  }

  /**
   * Project-wide self-healing analytics — the engine's actual value (how much drift it's
   * absorbing, where, and how) is otherwise buried inside individual run logs with no way to
   * see it in aggregate. Surfaces:
   *  - heals by method (free heuristic vs LLM) and by LLM provider
   *  - the most-healed locators (testId + locatorKey), i.e. the most FRAGILE parts of the
   *    app under test — a locator healing repeatedly is a maintenance signal worth acting on
   *    even though every individual run passed
   *  - a recent feed across the whole project
   */
  async getHealInsights(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);

    const heals = await this.prisma.healEvent.findMany({
      where: { run: { test: { projectId } } },
      include: { run: { select: { test: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const byMethod: Record<string, number> = { HEURISTIC: 0, LLM: 0 };
    const byProvider = new Map<string, number>();
    const byLocator = new Map<string, { testId: string; testName: string; locatorKey: string; count: number; lastHealedAt: Date }>();

    for (const h of heals) {
      byMethod[h.method] = (byMethod[h.method] ?? 0) + 1;
      if (h.provider) byProvider.set(h.provider, (byProvider.get(h.provider) ?? 0) + 1);

      const testId = h.run.test.id;
      const key = `${testId}:${h.locatorKey}`;
      const existing = byLocator.get(key);
      if (existing) existing.count += 1;
      else byLocator.set(key, { testId, testName: h.run.test.name, locatorKey: h.locatorKey, count: 1, lastHealedAt: h.createdAt });
    }

    const topLocators = [...byLocator.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    return {
      totalHeals: heals.length,
      byMethod,
      byProvider: Object.fromEntries(byProvider),
      topLocators,
      recent: heals.slice(0, 20).map((h) => ({
        id: h.id,
        testId: h.run.test.id,
        testName: h.run.test.name,
        locatorKey: h.locatorKey,
        method: h.method,
        provider: h.provider,
        oldValue: h.oldValue,
        newValue: h.newValue,
        createdAt: h.createdAt,
      })),
    };
  }
}
