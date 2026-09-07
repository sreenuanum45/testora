import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { TestsService } from './tests.service';
import { CreateTestDto, UpdateStepsDto } from './dto/test.dto';

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
}
