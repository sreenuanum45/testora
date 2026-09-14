import { Injectable, NotFoundException } from '@nestjs/common';
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { materializeLocators } from '../tests/locator-materializer';
import { parseCodegenToSteps, type RecordedStep } from './step-parser';

interface RecordingSession {
  process: ChildProcessWithoutNullStreams;
  outputFile: string;
  startedAt: number;
  /** Resolves once the process has actually exited AND whatever it captured has been
   *  parsed and saved — shared by stop() and the natural-exit path below so both end up
   *  running (and awaiting) the exact same persistence logic instead of two copies that
   *  could drift. */
  result: Promise<RecordedStep[]>;
}

const RECORDINGS_DIR = join(process.cwd(), 'tmp', 'recordings');

@Injectable()
export class RecordingService {
  private sessions = new Map<string, RecordingSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

  async start(userId: string, projectId: string, testId: string): Promise<{ started: boolean }> {
    if (this.sessions.has(testId)) {
      throw new Error('A recording is already in progress for this test');
    }
    const test = await this.tests.findOne(userId, projectId, testId);
    if (!test.targetUrl) throw new Error('Test has no target URL to record against');

    if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true });
    const outputFile = join(RECORDINGS_DIR, `${testId}.spec.ts`);

    // A fixed, generous viewport avoids the recorder opening at a size where a responsive
    // page collapses its layout and hides or disables elements the user actually wants to
    // interact with (a frequent cause of "the button won't highlight" reports).
    const args = ['playwright', 'codegen', '--target=playwright-test', '--viewport-size=1440,900', '-o', outputFile, test.targetUrl];
    if (test.recordInIncognito) {
      // Codegen always launches a fresh, isolated browser context by default (no
      // persisted profile/cookies unless --save-storage is used) — that already IS
      // incognito-equivalent, so no extra flag is needed here; documented for clarity.
    }
    const child = spawn('npx', args, { shell: true });

    let resolveResult: (steps: RecordedStep[]) => void;
    const result = new Promise<RecordedStep[]>((resolve) => {
      resolveResult = resolve;
    });

    const session: RecordingSession = { process: child, outputFile, startedAt: Date.now(), result };
    this.sessions.set(testId, session);

    // The recorder's browser window can close for reasons OTHER than the user clicking
    // "Stop Recording" in the app — most obviously, just closing the window directly, which
    // is the natural thing to do when you're done. Codegen still wrote everything captured
    // up to that point to outputFile regardless of how the process ended, so persistence
    // has to run HERE (on any close, for any reason) rather than only inside stop() — a
    // recording that only gets saved when a specific button was clicked silently loses
    // everything the moment someone closes the window instead.
    child.on('close', () => {
      void (async () => {
        // Give the file system a brief moment to flush codegen's final write.
        await new Promise((r) => setTimeout(r, 500));
        const steps = await this.persistRecording(testId, outputFile);
        // Only remove the session once persistence is actually done — status() staying
        // "recording: true" a little longer than the real browser window is alive is far
        // better than the frontend's poll seeing "not recording" and reloading the test
        // a moment before the DB write it's waiting on has landed.
        this.sessions.delete(testId);
        resolveResult(steps);
      })();
    });

    return { started: true };
  }

  async stop(testId: string): Promise<{ stopped: boolean; steps?: unknown[] }> {
    const session = this.sessions.get(testId);
    if (!session) {
      // No tracked session — most likely the backend restarted mid-recording and lost its
      // in-memory state. Best-effort recovery: if Codegen's output file is still on disk,
      // whatever was captured before the orphaning is still worth saving rather than
      // silently discarding it.
      const outputFile = join(RECORDINGS_DIR, `${testId}.spec.ts`);
      if (existsSync(outputFile)) {
        const steps = await this.persistRecording(testId, outputFile);
        return { stopped: true, steps };
      }
      throw new NotFoundException('No recording in progress for this test');
    }

    try {
      if (process.platform === 'win32' && session.process.pid) {
        execSync(`taskkill /pid ${session.process.pid} /t /f`);
      } else {
        session.process.kill('SIGTERM');
      }
    } catch {
      // process may have already exited on its own
    }

    const steps = await session.result;
    return { stopped: true, steps };
  }

  status(testId: string): { recording: boolean; elapsedMs: number | null } {
    const session = this.sessions.get(testId);
    return { recording: !!session, elapsedMs: session ? Date.now() - session.startedAt : null };
  }

  private async persistRecording(testId: string, outputFile: string): Promise<RecordedStep[]> {
    if (!existsSync(outputFile)) return [];
    const raw = redactPasswords(readFileSync(outputFile, 'utf-8'));
    const steps = parseCodegenToSteps(raw);
    rmSync(outputFile, { force: true });

    await this.prisma.test.update({ where: { id: testId }, data: { steps: steps as object[] } });
    await materializeLocators(this.prisma, testId, steps);
    return steps;
  }
}

function redactPasswords(code: string): string {
  return code
    .split('\n')
    .map((line) => {
      if (!/password/i.test(line) || !/\.fill\(/.test(line)) return line;
      return line.replace(/\.fill\((['"`]).*?\1\)/, ".fill(process.env.TEST_PASSWORD ?? 'REDACTED')");
    })
    .join('\n');
}
