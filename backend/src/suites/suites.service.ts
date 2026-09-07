import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ExecutionService } from '../execution/execution.service';

@Injectable()
export class SuitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly execution: ExecutionService,
  ) {}

  async create(userId: string, projectId: string, name: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.suite.create({ data: { name, projectId } });
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.suite.findMany({
      where: { projectId },
      include: { tests: { include: { test: true } }, scheduler: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addTest(userId: string, projectId: string, suiteId: string, testId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const count = await this.prisma.suiteTest.count({ where: { suiteId } });
    return this.prisma.suiteTest.upsert({
      where: { suiteId_testId: { suiteId, testId } },
      create: { suiteId, testId, order: count },
      update: {},
    });
  }

  /** Runs every test in the suite as a batch, grouped under one SuiteRun so results can
   *  be viewed together — this is what both manual "run suite" and the cron scheduler
   *  trigger. */
  async runSuite(userId: string, projectId: string, suiteId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const suite = await this.prisma.suite.findUniqueOrThrow({
      where: { id: suiteId },
      include: { tests: { include: { test: true } } },
    });

    const suiteRun = await this.prisma.suiteRun.create({ data: { suiteId, status: 'RUNNING' } });

    for (const link of suite.tests) {
      // A data-driven test fans out into multiple runs (one per data row) — link all of
      // them to this SuiteRun, not just the first.
      const runs = await this.execution.enqueueRun(userId, projectId, link.testId);
      for (const run of runs) {
        await this.prisma.run.update({ where: { id: run.id }, data: { suiteRunId: suiteRun.id } });
      }
    }

    return suiteRun;
  }

  async listRuns(userId: string, projectId: string, suiteId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.suiteRun.findMany({
      where: { suiteId },
      include: { runs: { include: { healEvents: true } } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
  }
}
