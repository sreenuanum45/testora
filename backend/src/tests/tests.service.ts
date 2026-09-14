import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTestDto, UpdateTestDto } from './dto/test.dto';
import { materializeLocators } from './locator-materializer';
import { flattenComponentSteps } from './step-flattener';
import { classifyHealth } from './health-classification';
import type { RecordedStep } from '../recording/step-parser';

// Mirrors EXEC_ROOT in execution.processor.ts (tmp/execution) — kept as an independent
// literal rather than a shared import since TestsModule has no dependency on ExecutionModule
// (the reverse is true: ExecutionModule imports TestsModule) and this is just a root path,
// not behavior worth coupling the two modules over.
const VISUAL_BASELINE_DIR = join(process.cwd(), 'tmp', 'execution', 'baselines');

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, dto: CreateTestDto) {
    await this.projects.findOneOwned(userId, projectId);
    const needsWeb = dto.type === 'WEB' || dto.type === 'WEB_API';
    const needsApi = dto.type === 'API' || dto.type === 'WEB_API';
    return this.prisma.test.create({
      data: {
        name: dto.name,
        type: dto.type,
        category: dto.category,
        projectId,
        moduleId: dto.moduleId,
        targetUrl: needsWeb ? dto.targetUrl : undefined,
        recordInIncognito: dto.recordInIncognito ?? true,
        apiMethod: needsApi ? dto.apiMethod : undefined,
        apiEndpoint: needsApi ? dto.apiEndpoint : undefined,
        apiHeaders: needsApi ? (dto.apiHeaders ?? {}) : undefined,
        apiBody: needsApi ? ((dto.apiBody as Prisma.InputJsonValue) ?? Prisma.JsonNull) : undefined,
        retries: dto.retries ?? 0,
        dataSetId: dto.dataSetId,
        environmentId: dto.environmentId,
        viewportWidth: needsWeb ? dto.viewportWidth : undefined,
        viewportHeight: needsWeb ? dto.viewportHeight : undefined,
        userAgent: needsWeb ? dto.userAgent : undefined,
        tags: dto.tags ?? [],
      },
    });
  }

  /** General test settings update (tags, quarantine) — separate from updateSteps since
   *  these fields have nothing to do with the step list and are edited independently from
   *  the test detail page's header, not the step builder. */
  async update(userId: string, projectId: string, testId: string, dto: UpdateTestDto) {
    await this.findOne(userId, projectId, testId);
    return this.prisma.test.update({
      where: { id: testId },
      data: {
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.quarantined !== undefined && {
          quarantined: dto.quarantined,
          quarantinedAt: dto.quarantined ? new Date() : null,
        }),
      },
      include: { locators: true },
    });
  }

  /** Copies a run's own screenshot into a stable per-test baseline file used for visual
   *  regression diffing on every subsequent run (see ExecutionProcessor). */
  async setVisualBaseline(userId: string, projectId: string, testId: string, runId: string) {
    await this.findOne(userId, projectId, testId);
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run || run.testId !== testId) throw new NotFoundException('Run not found for this test');
    if (!run.screenshotPath || !existsSync(run.screenshotPath)) {
      throw new NotFoundException('This run has no screenshot to use as a baseline');
    }

    if (!existsSync(VISUAL_BASELINE_DIR)) mkdirSync(VISUAL_BASELINE_DIR, { recursive: true });
    const baselinePath = join(VISUAL_BASELINE_DIR, `${testId}.png`);
    copyFileSync(run.screenshotPath, baselinePath);

    return this.prisma.test.update({ where: { id: testId }, data: { visualBaselinePath: baselinePath } });
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.test.findMany({
      where: { projectId },
      include: { module: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Classifies every test in the project from its own recent run history — turns "here's a
   * pile of pass/fail rows you'd have to open each test to see" into a triage signal you can
   * read straight off the dashboard:
   *  - BROKEN: failing right now, and consistently (its last 3+ runs all failed) — not a
   *    blip, something is actually wrong.
   *  - FLAKY: recent runs don't agree (a mix of PASSED and FAILED) — the test itself is
   *    unreliable, distinct from "the app broke."
   *  - STABLE: every recent run passed.
   *  - NEW: no runs yet, nothing to classify.
   * One query for the whole project (not one-per-test) — pull each test's most recent runs
   * and group in memory, since Prisma has no native "top N per group".
   */
  async getHealthSummary(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const RECENT_WINDOW = 10;

    const tests = await this.prisma.test.findMany({ where: { projectId }, select: { id: true } });
    const runs = await this.prisma.run.findMany({
      where: { testId: { in: tests.map((t) => t.id) } },
      orderBy: { startedAt: 'desc' },
      select: { testId: true, status: true, startedAt: true },
      take: 2000,
    });

    const byTest = new Map<string, typeof runs>();
    for (const run of runs) {
      const list = byTest.get(run.testId) ?? [];
      if (list.length < RECENT_WINDOW) list.push(run);
      byTest.set(run.testId, list);
    }

    return tests.map((t) => {
      const recent = byTest.get(t.id) ?? [];
      const statuses = recent.map((r) => r.status).filter((s): s is 'PASSED' | 'FAILED' => s === 'PASSED' || s === 'FAILED');

      return {
        testId: t.id,
        classification: classifyHealth(statuses),
        recentRuns: recent.map((r) => r.status).reverse(), // oldest -> newest, for a sparkline
        lastRunAt: recent[0]?.startedAt ?? null,
      };
    });
  }

  async findOne(userId: string, projectId: string, testId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const test = await this.prisma.test.findUnique({ where: { id: testId }, include: { locators: true } });
    if (!test || test.projectId !== projectId) throw new NotFoundException('Test not found');
    return test;
  }

  async updateSteps(userId: string, projectId: string, testId: string, steps: unknown[]) {
    await this.findOne(userId, projectId, testId);
    await this.prisma.test.update({ where: { id: testId }, data: { steps: steps as object[] } });
    // Locator keys are index-based ("step-N"), and execution flattens component-reference
    // steps before generating the spec — flatten here too so a "step-N" key always means
    // the same Nth element both times, instead of drifting whenever a component step
    // (which can expand to 0, 1, or many steps) sits before it in the list.
    const flattened = await flattenComponentSteps(this.prisma, steps as RecordedStep[]);
    await materializeLocators(this.prisma, testId, flattened);
    return this.prisma.test.findUnique({ where: { id: testId }, include: { locators: true } });
  }
}
