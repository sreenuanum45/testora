import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { RecordingService } from './recording.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests/:testId/recording')
export class RecordingController {
  constructor(private readonly recording: RecordingService) {}

  @Post('start')
  start(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('testId') testId: string) {
    return this.recording.start(user.sub, projectId, testId);
  }

  @Post('stop')
  stop(@Param('testId') testId: string) {
    return this.recording.stop(testId);
  }

  @Get('status')
  status(@Param('testId') testId: string) {
    return this.recording.status(testId);
  }
}
