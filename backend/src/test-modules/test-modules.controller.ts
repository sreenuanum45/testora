import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { TestModulesService } from './test-modules.service';

class CreateTestModuleDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/test-modules')
export class TestModulesController {
  constructor(private readonly modules: TestModulesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: CreateTestModuleDto) {
    return this.modules.create(user.sub, projectId, dto.name);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.modules.findAll(user.sub, projectId);
  }
}
