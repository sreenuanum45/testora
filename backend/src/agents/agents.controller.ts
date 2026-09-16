import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { AgentsService } from './agents.service';

class PlanAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';
}

class GenerateAgentDto {
  @IsString()
  @MinLength(1)
  plan!: string;

  @IsOptional()
  @IsBoolean()
  apply?: boolean;
}

class HealAgentDto {
  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsBoolean()
  apply?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests/:testId/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  /** PLANNER — proposes a test plan grounded in the live page (via Hyperbrowser). */
  @Post('plan')
  plan(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: PlanAgentDto,
  ) {
    return this.agents.plan(user.sub, projectId, testId, dto.notes ?? '', dto.mode ?? 'append');
  }

  /** GENERATOR — turns a plan into concrete, executable steps (optionally applying them). */
  @Post('generate')
  generate(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: GenerateAgentDto,
  ) {
    return this.agents.generate(user.sub, projectId, testId, dto.plan, dto.apply ?? false);
  }

  /** HEALER — repairs the step list against the page as it looks now after a failed run. */
  @Post('heal')
  heal(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: HealAgentDto,
  ) {
    return this.agents.heal(user.sub, projectId, testId, dto.runId, dto.apply ?? false);
  }
}
