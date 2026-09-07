import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { EnvironmentsService } from './environments.service';
import { CreateEnvironmentDto, UpsertVariableDto } from './dto/environment.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/environments')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: CreateEnvironmentDto) {
    return this.environments.create(user.sub, projectId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.environments.findAll(user.sub, projectId);
  }

  @Delete(':environmentId')
  remove(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('environmentId') environmentId: string) {
    return this.environments.remove(user.sub, projectId, environmentId);
  }

  @Post(':environmentId/variables')
  upsertVariable(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: UpsertVariableDto,
  ) {
    return this.environments.upsertVariable(user.sub, projectId, environmentId, dto);
  }

  @Delete(':environmentId/variables/:key')
  removeVariable(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('environmentId') environmentId: string,
    @Param('key') key: string,
  ) {
    return this.environments.removeVariable(user.sub, projectId, environmentId, key);
  }
}
