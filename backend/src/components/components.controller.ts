import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsObject, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { ComponentsService } from './components.service';
import type { RecordedStep } from '../recording/step-parser';

class CreateComponentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject({ each: true })
  steps!: RecordedStep[];
}

class UpdateComponentDto {
  @IsObject({ each: true })
  steps!: RecordedStep[];
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/components')
export class ComponentsController {
  constructor(private readonly components: ComponentsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: CreateComponentDto) {
    return this.components.create(user.sub, projectId, dto.name, dto.steps);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.components.findAll(user.sub, projectId);
  }

  @Put(':componentId')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('componentId') componentId: string,
    @Body() dto: UpdateComponentDto,
  ) {
    return this.components.update(user.sub, projectId, componentId, dto.steps);
  }

  @Delete(':componentId')
  remove(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('componentId') componentId: string) {
    return this.components.remove(user.sub, projectId, componentId);
  }
}
