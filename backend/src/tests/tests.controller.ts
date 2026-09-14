import { Body, Controller, Get, NotFoundException, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { TestsService } from './tests.service';
import { CreateTestDto, SetVisualBaselineDto, UpdateStepsDto, UpdateTestDto } from './dto/test.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests')
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: CreateTestDto) {
    return this.tests.create(user.sub, projectId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.tests.findAll(user.sub, projectId);
  }

  // Must come before ':testId' — otherwise Nest's route matching would treat "health" as
  // a :testId value and shadow this route entirely.
  @Get('health')
  getHealthSummary(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.tests.getHealthSummary(user.sub, projectId);
  }

  @Get(':testId')
  findOne(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('testId') testId: string) {
    return this.tests.findOne(user.sub, projectId, testId);
  }

  @Put(':testId/steps')
  updateSteps(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: UpdateStepsDto,
  ) {
    return this.tests.updateSteps(user.sub, projectId, testId, dto.steps);
  }

  @Put(':testId')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: UpdateTestDto,
  ) {
    return this.tests.update(user.sub, projectId, testId, dto);
  }

  @Post(':testId/visual-baseline')
  setVisualBaseline(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: SetVisualBaselineDto,
  ) {
    return this.tests.setVisualBaseline(user.sub, projectId, testId, dto.runId);
  }

  @Get(':testId/visual-baseline')
  async getVisualBaseline(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Res() res: Response,
  ) {
    const test = await this.tests.findOne(user.sub, projectId, testId);
    if (!test.visualBaselinePath || !existsSync(test.visualBaselinePath)) {
      throw new NotFoundException('No visual baseline set for that test');
    }
    res.set('Content-Type', 'image/png');
    res.sendFile(resolve(test.visualBaselinePath));
  }
}
