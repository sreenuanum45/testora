import { Injectable, NotFoundException } from '@nestjs/common';
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { materializeLocators } from '../tests/locator-materializer';
import { parseCodegenToSteps } from './step-parser';

interface RecordingSession {
  process: ChildProcessWithoutNullStreams;
  outputFile: string;
  startedAt: number;
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
    this.sessions.set(testId, { process: child, outputFile, startedAt: Date.now() });

    child.on('close', () => {
      this.sessions.delete(testId);
    });

    return { started: true };
  }

  async stop(testId: string): Promise<{ stopped: boolean; steps?: unknown[] }> {
    const session = this.sessions.get(testId);
    if (!session) throw new NotFoundException('No recording in progress for this test');

    try {
      if (process.platform === 'win32' && session.process.pid) {
        execSync(`taskkill /pid ${session.process.pid} /t /f`);
      } else {
        session.process.kill('SIGTERM');
      }
    } catch {
      // process may have already exited on its own
    }
    this.sessions.delete(testId);

    // Give the file system a brief moment to flush codegen's final write.
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!existsSync(session.outputFile)) return { stopped: true };

    const raw = redactPasswords(readFileSync(session.outputFile, 'utf-8'));
    const steps = parseCodegenToSteps(raw);
    rmSync(session.outputFile, { force: true });

    await this.prisma.test.update({ where: { id: testId }, data: { steps: steps as object[] } });
    await materializeLocators(this.prisma, testId, steps);
    return { stopped: true, steps };
  }

  status(testId: string): { recording: boolean; elapsedMs: number | null } {
    const session = this.sessions.get(testId);
    return { recording: !!session, elapsedMs: session ? Date.now() - session.startedAt : null };
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
