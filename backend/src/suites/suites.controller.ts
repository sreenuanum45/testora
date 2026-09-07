import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { SuitesService } from './suites.service';

class CreateSuiteDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

class AddTestDto {
  @IsString()
  testId!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/suites')
export class SuitesController {
  constructor(private readonly suites: SuitesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: CreateSuiteDto) {
    return this.suites.create(user.sub, projectId, dto.name);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.suites.findAll(user.sub, projectId);
  }

  @Post(':suiteId/tests')
  addTest(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @Body() dto: AddTestDto,
  ) {
    return this.suites.addTest(user.sub, projectId, suiteId, dto.testId);
  }

  @Post(':suiteId/run')
  run(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('suiteId') suiteId: string) {
    return this.suites.runSuite(user.sub, projectId, suiteId);
  }

  @Get(':suiteId/runs')
  listRuns(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('suiteId') suiteId: string) {
    return this.suites.listRuns(user.sub, projectId, suiteId);
  }
}
