import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { ExecutionService } from './execution.service';

class RunTestDto {
  @IsOptional()
  @IsString()
  browser?: string;

  @IsOptional()
  @IsBoolean()
  headed?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests/:testId/runs')
export class ExecutionController {
  constructor(private readonly execution: ExecutionService) {}

  @Post()
  run(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: RunTestDto,
  ) {
    return this.execution.enqueueRun(user.sub, projectId, testId, dto.browser, dto.headed);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('testId') testId: string) {
    return this.execution.listRunsForTest(user.sub, projectId, testId);
  }

  @Get(':runId')
  getOne(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('runId') runId: string) {
    return this.execution.getRun(user.sub, projectId, runId);
  }
}
