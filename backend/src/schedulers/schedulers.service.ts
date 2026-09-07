import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as cronParser from 'cron-parser';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

export interface SchedulerJobData {
  userId: string;
  projectId: string;
  suiteId: string;
}

@Injectable()
export class SchedulersService {
  constructor(
    @InjectQueue('scheduler') private readonly queue: Queue<SchedulerJobData>,
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async upsert(userId: string, projectId: string, suiteId: string, cronExpression: string) {
    await this.projects.findOneOwned(userId, projectId);
    try {
      cronParser.parseExpression(cronExpression);
    } catch {
      throw new BadRequestException(`Invalid cron expression: ${cronExpression}`);
    }

    await this.removeRepeatableFor(suiteId);

    const scheduler = await this.prisma.scheduler.upsert({
      where: { suiteId },
      create: { suiteId, cronExpression, enabled: true },
      update: { cronExpression, enabled: true },
    });

    await this.queue.add(
      `suite-${suiteId}`,
      { userId, projectId, suiteId },
      { repeat: { pattern: cronExpression }, jobId: `suite-${suiteId}` },
    );

    return scheduler;
  }

  async disable(userId: string, projectId: string, suiteId: string) {
    await this.projects.findOneOwned(userId, projectId);
    await this.removeRepeatableFor(suiteId);
    return this.prisma.scheduler.update({ where: { suiteId }, data: { enabled: false } });
  }

  private async removeRepeatableFor(suiteId: string): Promise<void> {
    const repeatables = await this.queue.getRepeatableJobs();
    const existing = repeatables.find((r) => r.id === `suite-${suiteId}`);
    if (existing) await this.queue.removeRepeatableByKey(existing.key);
  }
}
