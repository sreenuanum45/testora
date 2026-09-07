import { Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { ExecutionService } from './execution.service';

/** Opens Playwright's own trace viewer (full network/DOM-snapshot/console timeline) for a
 *  run's trace.zip — "Smart Debugging" / trace-based visibility that was previously
 *  captured but never surfaced anywhere in the UI. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/:runId/playback')
export class PlaybackController {
  constructor(private readonly execution: ExecutionService) {}

  @Post()
  async open(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('runId') runId: string) {
    const run = await this.execution.getRun(user.sub, projectId, runId);
    if (!run.tracePath || !existsSync(run.tracePath)) throw new NotFoundException('No trace available for that run');

    const child = spawn('npx', ['playwright', 'show-trace', resolve(run.tracePath)], {
      shell: true,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { opened: true };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/:runId/video')
export class RunVideoController {
  constructor(private readonly execution: ExecutionService) {}

  @Get()
  async stream(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const run = await this.execution.getRun(user.sub, projectId, runId);
    if (!run.videoPath || !existsSync(run.videoPath)) throw new NotFoundException('No video available for that run');
    res.set('Content-Type', 'video/webm');
    res.sendFile(resolve(run.videoPath));
  }
}

/** Failure screenshots (screenshot: 'only-on-failure' in playwright.exec.config.ts) were
 *  already being captured on disk but never surfaced anywhere in the UI — the Run model
 *  even had a screenshotPath column that execution.processor.ts never populated. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/:runId/screenshot')
export class RunScreenshotController {
  constructor(private readonly execution: ExecutionService) {}

  @Get()
  async stream(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const run = await this.execution.getRun(user.sub, projectId, runId);
    if (!run.screenshotPath || !existsSync(run.screenshotPath)) throw new NotFoundException('No screenshot available for that run');
    res.set('Content-Type', 'image/png');
    res.sendFile(resolve(run.screenshotPath));
  }
}

/** Live (poll while RUNNING) and historical (after it finishes) step-by-step progress for
 *  one run, including self-healing kicking in mid-step — the "watch it execute" panel. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/:runId/step-events')
export class RunStepEventsController {
  constructor(private readonly execution: ExecutionService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('runId') runId: string) {
    return this.execution.listStepEvents(user.sub, projectId, runId);
  }
}
