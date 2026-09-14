import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { flattenComponentSteps, applyVariables, substituteVariables } from '../tests/step-flattener';
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
    let rawSteps = (test.steps as unknown as RecordedStep[]) ?? [];
    rawSteps = await flattenComponentSteps(this.prisma, rawSteps);

    // Match what actually executes (see ExecutionProcessor.executeWebTest): {{env.KEY}}
    // placeholders in step values/selectors AND the test's own targetUrl are resolved
    // against its linked Environment's Variables — "Export as Playwright Code" advertises
    // real, runnable output, which a literal unresolved "{{env.baseUrl}}" string is not.
    const envVars = test.environmentId
      ? Object.fromEntries(
          (await this.prisma.variable.findMany({ where: { environmentId: test.environmentId } })).map((v) => [v.key, v.value]),
        )
      : null;
    const steps = applyVariables(rawSteps, envVars);
    const targetUrl = test.targetUrl ? substituteVariables(test.targetUrl, envVars) : undefined;

    const code = generatePlaywrightCode(
      test.name,
      steps,
      { viewportWidth: test.viewportWidth, viewportHeight: test.viewportHeight, userAgent: test.userAgent },
      targetUrl,
    );
    return { code, fileName: `${test.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.spec.ts` };
  }
}
