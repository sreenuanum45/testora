import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProjectsModule } from '../projects/projects.module';
import { TestsModule } from '../tests/tests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { ExecutionProcessor } from './execution.processor';
import {
  PlaybackController,
  RunVideoController,
  RunScreenshotController,
  RunVisualDiffController,
  RunStepEventsController,
  HealInsightsController,
  RunExplainController,
  WeeklyDigestController,
  RunCompareController,
} from './playback.controller';

@Module({
  imports: [ProjectsModule, TestsModule, NotificationsModule, BullModule.registerQueue({ name: 'execution' })],
  controllers: [
    ExecutionController,
    PlaybackController,
    RunVideoController,
    RunScreenshotController,
    RunVisualDiffController,
    RunStepEventsController,
    HealInsightsController,
    RunExplainController,
    WeeklyDigestController,
    RunCompareController,
  ],
  providers: [ExecutionService, ExecutionProcessor],
  exports: [ExecutionService, BullModule],
})
export class ExecutionModule {}
