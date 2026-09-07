import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProjectsModule } from '../projects/projects.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';
import { ExecutionProcessor } from './execution.processor';
import { PlaybackController, RunVideoController, RunScreenshotController, RunStepEventsController } from './playback.controller';

@Module({
  imports: [ProjectsModule, BullModule.registerQueue({ name: 'execution' })],
  controllers: [ExecutionController, PlaybackController, RunVideoController, RunScreenshotController, RunStepEventsController],
  providers: [ExecutionService, ExecutionProcessor],
  exports: [ExecutionService, BullModule],
})
export class ExecutionModule {}
