import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { SuitesService } from '../suites/suites.service';
import type { SchedulerJobData } from './schedulers.service';

@Processor('scheduler')
export class SchedulersProcessor extends WorkerHost {
  constructor(private readonly suites: SuitesService) {
    super();
  }

  async process(job: Job<SchedulerJobData>): Promise<void> {
    const { userId, projectId, suiteId } = job.data;
    await this.suites.runSuite(userId, projectId, suiteId);
  }
}
