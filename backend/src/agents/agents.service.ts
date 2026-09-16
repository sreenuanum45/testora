import { Injectable } from '@nestjs/common';
import { LlmProviderService } from '../llm/llm-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { materializeLocators } from '../tests/locator-materializer';
import { flattenComponentSteps } from '../tests/step-flattener';
import type { RecordedStep } from '../recording/step-parser';
import { exploreSite, type ExploredPage } from './site-explorer';
import {
  parseAgentSteps,
  PLANNER_SYSTEM_PROMPT,
  GENERATOR_SYSTEM_PROMPT,
  HEALER_SYSTEM_PROMPT,
} from './agent-prompts';

export type AgentMode = 'append' | 'replace';

interface AgentResult {
  steps: RecordedStep[];
  provider: string;
  model: string;
  exploration: { url: string; title: string; usedFallback: boolean } | null;
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly llm: LlmProviderService,
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

  /**
   * PLANNER: explores the live target page through a Hyperbrowser session, then asks the
   * LLM to plan a test as a structured step list grounded in what's actually on the page.
   * When a Hyperbrowser session can't be created (no key configured, out of credits,
   * upstream down) the LLM still plans from the URL alone — degrading the grounding, not
   * killing the feature, since a plan is cheap to review and regenerate either way.
   */
  async plan(userId: string, projectId: string, testId: string, notes: string, mode: AgentMode): Promise<AgentResult> {
    const test = await this.tests.findOne(userId, projectId, testId);
    const targetUrl = this.requireTargetUrl(test.targetUrl);

    const exploration = await exploreSite(targetUrl).catch(() => null);
    const grounding = this.groundingText(targetUrl, exploration, notes);

    const result = await this.llm.completeWithFallback(
      PLANNER_SYSTEM_PROMPT,
      `${grounding}\n\n${notes ? `User's focus for this test:\n${notes}\n` : 'Plan a sensible core-flow test for this page.'}`,
    );
    const steps = parseAgentSteps(result.raw);

    if (mode === 'replace') await this.persistSteps(testId, steps);
    return this.describe(steps, result.provider, result.model, exploration);
  }

  /**
   * GENERATOR: takes the user's plan (free text or partial JSON steps) plus a live page
   * exploration and resolves it into concrete, executable steps — then (optionally, when
   * apply=true) saves them onto the test the way recording does, so the result is
   * immediately runnable and exportable.
   */
  async generate(userId: string, projectId: string, testId: string, plan: string, apply: boolean): Promise<AgentResult> {
    const test = await this.tests.findOne(userId, projectId, testId);
    const targetUrl = this.requireTargetUrl(test.targetUrl);

    const exploration = await exploreSite(targetUrl).catch(() => null);
    const grounding = this.groundingText(targetUrl, exploration);

    const result = await this.llm.completeWithFallback(
      GENERATOR_SYSTEM_PROMPT,
      `${grounding}\n\nPlan to implement:\n${plan}`,
    );
    const steps = parseAgentSteps(result.raw);

    if (apply) await this.persistSteps(testId, steps);
    return this.describe(steps, result.provider, result.model, exploration);
  }

  /**
   * HEALER: post-run repair agent — distinct from the in-run locator healing that already
   * exists (that one repairs ONE locator while the test is executing; this diagnoses the
   * whole failed run afterward and rewrites the step list). Given the failed run's error
   * + per-step log and a fresh exploration of the target page, the LLM produces a full
   * repaired step list; applying it is an explicit user action (apply=true).
   */
  async heal(userId: string, projectId: string, testId: string, runId: string | undefined, apply: boolean): Promise<AgentResult & { runId: string | null }> {
    const test = await this.tests.findOne(userId, projectId, testId);
    const targetUrl = this.requireTargetUrl(test.targetUrl);
    const existingSteps = ((test.steps as unknown as RecordedStep[]) ?? []).filter((s) => s.action !== 'component');

    const run = await this.findFailedRun(testId, runId);
    if (!run && existingSteps.length > 0) {
      throw new Error('No failed run found for this test — the healer repairs a failed run; generate or plan instead.');
    }

    const stepLog = run
      ? run.stepEvents
          .map((e) => `step[${e.index}] ${e.action} ${e.status}${e.message ? ` — ${e.message.slice(0, 200)}` : ''}`)
          .join('\n')
      : '(no per-step log available)';

    const runError = run?.errorMessage ?? null;
    const exploration = await exploreSite(targetUrl).catch(() => null);
    const grounding = this.groundingText(targetUrl, exploration);

    const userPrompt = [
      grounding,
      `Current step list:\n${JSON.stringify(existingSteps, null, 2)}`,
      `Failed run ${run?.id ?? '(unspecified)'} error:\n${(runError ?? '(no error message captured)').slice(0, 1500)}`,
      `Per-step log:\n${stepLog}`,
    ].join('\n\n');

    const result = await this.llm.completeWithFallback(HEALER_SYSTEM_PROMPT, userPrompt);
    const steps = parseAgentSteps(result.raw);

    if (apply) await this.persistSteps(testId, steps);
    return { ...this.describe(steps, result.provider, result.model, exploration), runId: run?.id ?? null };
  }

  // --- helpers -------------------------------------------------------------

  private requireTargetUrl(targetUrl: string | null): string {
    if (!targetUrl) throw new Error('Test has no target URL — agents need a live page to explore.');
    return targetUrl;
  }

  private groundingText(targetUrl: string, exploration: ExploredPage | null, notes?: string): string {
    const lines = [`Target URL: ${targetUrl}`];
    if (notes?.trim()) lines.push(`User notes: ${notes.trim()}`);
    if (exploration) {
      lines.push(`Live page title: ${exploration.title}`);
      lines.push(`Accessibility snapshot of the page as it looks now:\n${exploration.snapshot}`);
    } else {
      lines.push('(Live exploration was unavailable — plan from the URL and general knowledge of such sites, and mark any uncertain selector with the "text" strategy.)');
    }
    return lines.join('\n');
  }

  private describe(steps: RecordedStep[], provider: string, model: string, exploration: ExploredPage | null): AgentResult {
    return {
      steps,
      provider,
      model,
      exploration: exploration ? { url: exploration.url, title: exploration.title, usedFallback: exploration.usedFallback } : null,
    };
  }

  /** Same persistence path recording uses (steps + materialized locators against the
   *  flattened list), so agent-written steps heal and execute exactly like recorded ones. */
  private async persistSteps(testId: string, steps: RecordedStep[]): Promise<void> {
    await this.prisma.test.update({ where: { id: testId }, data: { steps: steps as object[] } });
    const flattened = await flattenComponentSteps(this.prisma, steps);
    await materializeLocators(this.prisma, testId, flattened);
  }

  private async findFailedRun(testId: string, runId?: string) {
    if (runId) {
      const run = await this.prisma.run.findFirst({
        where: { id: runId, testId },
        include: { stepEvents: { orderBy: { createdAt: 'asc' } } },
      });
      if (!run) throw new Error('Run not found for this test');
      return run;
    }
    return this.prisma.run.findFirst({
      where: { testId, status: 'FAILED' },
      orderBy: { startedAt: 'desc' },
      include: { stepEvents: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
