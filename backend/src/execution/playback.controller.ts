import { Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
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

/** The pixelmatch diff image against the test's visual baseline — see
 *  ExecutionProcessor.diffAgainstVisualBaseline. Only present once a baseline has been set
 *  and a same-dimension screenshot has run since. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/:runId/visual-diff')
export class RunVisualDiffController {
  constructor(private readonly execution: ExecutionService) {}

  @Get()
  async stream(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Res() res: Response,
  ) {
    const run = await this.execution.getRun(user.sub, projectId, runId);
    if (!run.visualDiffPath || !existsSync(run.visualDiffPath)) throw new NotFoundException('No visual diff available for that run');
    res.set('Content-Type', 'image/png');
    res.sendFile(resolve(run.visualDiffPath));
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

/** On-demand AI explanation of a failed run — see ExecutionService.explainFailure. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/:runId/explain')
export class RunExplainController {
  constructor(private readonly execution: ExecutionService) {}

  @Post()
  explain(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('runId') runId: string) {
    return this.execution.explainFailure(user.sub, projectId, runId);
  }
}

/** Project-wide self-healing analytics — see ExecutionService.getHealInsights. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/heal-insights')
export class HealInsightsController {
  constructor(private readonly execution: ExecutionService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.execution.getHealInsights(user.sub, projectId);
  }
}

/** Step-by-step diff between two runs — see ExecutionService.compareRuns. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/runs/compare')
export class RunCompareController {
  constructor(private readonly execution: ExecutionService) {}

  @Get()
  compare(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query('a') runIdA: string,
    @Query('b') runIdB: string,
  ) {
    return this.execution.compareRuns(user.sub, projectId, runIdA, runIdB);
  }
}

/** On-demand AI weekly status digest — see ExecutionService.getWeeklyDigest. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/digest')
export class WeeklyDigestController {
  constructor(private readonly execution: ExecutionService) {}

  @Post()
  get(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.execution.getWeeklyDigest(user.sub, projectId);
  }
}
