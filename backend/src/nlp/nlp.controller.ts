import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { NlpService } from './nlp.service';

class NlpStepsDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: 'append' | 'replace';
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests/:testId/nlp-steps')
export class NlpController {
  constructor(private readonly nlp: NlpService) {}

  @Post()
  generate(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Body() dto: NlpStepsDto,
  ) {
    return this.nlp.generateSteps(user.sub, projectId, testId, dto.text, dto.mode ?? 'append');
  }
}
