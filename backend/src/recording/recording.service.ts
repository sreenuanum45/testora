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
  /** Xvfb + x11vnc, only set when running headless-server-side (see needsVirtualDisplay
   *  below) — undefined on a local dev machine that already has a real display. */
  virtualDisplay?: { xvfb: ChildProcessWithoutNullStreams; x11vnc: ChildProcessWithoutNullStreams };
  outputFile: string;
  startedAt: number;
  /** Resolves once the process has actually exited AND whatever it captured has been
   *  parsed and saved — shared by stop() and the natural-exit path below so both end up
   *  running (and awaiting) the exact same persistence logic instead of two copies that
   *  could drift. */
  result: Promise<RecordedStep[]>;
}

const RECORDINGS_DIR = join(process.cwd(), 'tmp', 'recordings');

// A server with no physical/virtual display of its own (Render, any headless Linux host)
// can't open a real Codegen browser window — Xvfb gives it one to render into, and
// vnc-relay.ts streams that virtual screen to whichever browser tab started the recording.
// A local dev machine (Windows/Mac, or a Linux desktop with $DISPLAY already set) has a
// real display already, so Codegen's window "just works" there exactly as before — no
// virtual display needed, and Xvfb/x11vnc likely aren't even installed there.
const NEEDS_VIRTUAL_DISPLAY = process.platform === 'linux' && !process.env.DISPLAY;
export const VNC_DISPLAY = ':99';
export const VNC_PORT = 5901;

@Injectable()
export class RecordingService {
  // One recording at a time, system-wide — the virtual display + VNC port above are a
  // single shared resource (not per-test), which is a deliberate simplification: this is
  // a single small container, not a fleet of recording workers.
  private sessions = new Map<string, RecordingSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

  isActive(testId: string): boolean {
    return this.sessions.has(testId);
  }

  async start(userId: string, projectId: string, testId: string): Promise<{ started: boolean; vncEnabled: boolean }> {
    if (this.sessions.size > 0) {
      throw new Error(
        this.sessions.has(testId)
          ? 'A recording is already in progress for this test'
          : 'A recording is already in progress for another test — only one at a time is supported',
      );
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

    let virtualDisplay: RecordingSession['virtualDisplay'];
    const codegenEnv = { ...process.env };

    if (NEEDS_VIRTUAL_DISPLAY) {
      const xvfb = spawn('Xvfb', [VNC_DISPLAY, '-screen', '0', '1440x900x24', '-nolisten', 'tcp'], {}) as ChildProcessWithoutNullStreams;
      // Xvfb needs a beat to create its display/socket before anything tries to use it —
      // there's no clean "ready" signal to wait on short of polling for the X socket file,
      // and a fixed short delay is simpler and reliable enough for a single local process.
      await new Promise((r) => setTimeout(r, 400));
      const x11vnc = spawn(
        'x11vnc',
        ['-display', VNC_DISPLAY, '-forever', '-shared', '-nopw', '-rfbport', String(VNC_PORT), '-noxdamage', '-quiet'],
        {},
      ) as ChildProcessWithoutNullStreams;
      await new Promise((r) => setTimeout(r, 400));
      virtualDisplay = { xvfb, x11vnc };
      codegenEnv.DISPLAY = VNC_DISPLAY;
    }

    const child = spawn('npx', args, { shell: true, env: codegenEnv });

    let resolveResult: (steps: RecordedStep[]) => void;
    const result = new Promise<RecordedStep[]>((resolve) => {
      resolveResult = resolve;
    });

    const session: RecordingSession = { process: child, virtualDisplay, outputFile, startedAt: Date.now(), result };
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
        killVirtualDisplay(virtualDisplay);
        // Only remove the session once persistence is actually done — status() staying
        // "recording: true" a little longer than the real browser window is alive is far
        // better than the frontend's poll seeing "not recording" and reloading the test
        // a moment before the DB write it's waiting on has landed.
        this.sessions.delete(testId);
        resolveResult(steps);
      })();
    });

    return { started: true, vncEnabled: !!virtualDisplay };
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

  status(testId: string): { recording: boolean; elapsedMs: number | null; vncEnabled: boolean } {
    const session = this.sessions.get(testId);
    return {
      recording: !!session,
      elapsedMs: session ? Date.now() - session.startedAt : null,
      vncEnabled: !!session?.virtualDisplay,
    };
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

function killVirtualDisplay(virtualDisplay: RecordingSession['virtualDisplay']): void {
  if (!virtualDisplay) return;
  try {
    virtualDisplay.x11vnc.kill('SIGTERM');
  } catch {
    // already exited
  }
  try {
    virtualDisplay.xvfb.kill('SIGTERM');
  } catch {
    // already exited
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
