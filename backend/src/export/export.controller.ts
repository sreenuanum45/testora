import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { flattenComponentSteps } from '../tests/step-flattener';
import { generatePlaywrightCode } from './code-generator';
import type { RecordedStep } from '../recording/step-parser';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests/:testId/export')
export class ExportController {
  constructor(
    private readonly tests: TestsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('playwright')
  async exportPlaywright(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
  ) {
    const test = await this.tests.findOne(user.sub, projectId, testId);
    const rawSteps = (test.steps as unknown as RecordedStep[]) ?? [];
    const steps = await flattenComponentSteps(this.prisma, rawSteps);
    const code = generatePlaywrightCode(
      test.name,
      steps,
      { viewportWidth: test.viewportWidth, viewportHeight: test.viewportHeight, userAgent: test.userAgent },
      test.targetUrl ?? undefined,
    );
    return { code, fileName: `${test.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.spec.ts` };
  }
}
