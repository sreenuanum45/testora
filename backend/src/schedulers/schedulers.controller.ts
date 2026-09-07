import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { SchedulersService } from './schedulers.service';

class SetCronDto {
  @IsString()
  cronExpression!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/suites/:suiteId/scheduler')
export class SchedulersController {
  constructor(private readonly schedulers: SchedulersService) {}

  @Post()
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('suiteId') suiteId: string,
    @Body() dto: SetCronDto,
  ) {
    return this.schedulers.upsert(user.sub, projectId, suiteId, dto.cronExpression);
  }

  @Delete()
  disable(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('suiteId') suiteId: string) {
    return this.schedulers.disable(user.sub, projectId, suiteId);
  }
}
