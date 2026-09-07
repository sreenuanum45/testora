import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

export interface ExecutionJobData {
  runId: string;
}

@Injectable()
export class ExecutionService {
  constructor(
    @InjectQueue('execution') private readonly queue: Queue<ExecutionJobData>,
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /** Returns an array even for a normal (non-data-driven) run — a Data-Driven test with a
   *  DataSet attached fans out into one Run per row here, so callers always handle "one or
   *  more runs were just queued" uniformly instead of a single-vs-fan-out branch. */
  async enqueueRun(userId: string, projectId: string, testId: string, browser = 'chromium', headed = false) {
    await this.projects.findOneOwned(userId, projectId);
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test || test.projectId !== projectId) throw new NotFoundException('Test not found');

    if (test.dataSetId) {
      const dataSet = await this.prisma.dataSet.findUnique({ where: { id: test.dataSetId } });
      const rows = (dataSet?.rows as unknown as Array<Record<string, unknown>>) ?? [];
      if (rows.length > 0) {
        const runs = [];
        for (const [index, row] of rows.entries()) {
          const run = await this.prisma.run.create({
            data: { testId, status: 'QUEUED', browser, headed, dataRowIndex: index, dataRow: row as object },
          });
          await this.queue.add('run-test', { runId: run.id }, { removeOnComplete: 50, removeOnFail: 50 });
          runs.push(run);
        }
        return runs;
      }
    }

    const run = await this.prisma.run.create({ data: { testId, status: 'QUEUED', browser, headed } });
    await this.queue.add('run-test', { runId: run.id }, { removeOnComplete: 50, removeOnFail: 50 });
    return [run];
  }

  async getRun(userId: string, projectId: string, runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId }, include: { test: true, healEvents: true } });
    if (!run) throw new NotFoundException('Run not found');
    await this.projects.findOneOwned(userId, run.test.projectId);
    return run;
  }

  async listRunsForTest(userId: string, projectId: string, testId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.run.findMany({
      where: { testId },
      orderBy: { startedAt: 'desc' },
      include: { healEvents: true },
      take: 50,
    });
  }

  /** Step-by-step progress for one run — populated live as a WEB test executes (see
   *  ExecutionProcessor/generate-runnable-spec's emitStep), so this doubles as both a
   *  live-progress feed (poll while the run is RUNNING) and a permanent step-level report
   *  once it's finished. */
  async listStepEvents(userId: string, projectId: string, runId: string) {
    await this.getRun(userId, projectId, runId);
    return this.prisma.runStepEvent.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } });
  }
}
