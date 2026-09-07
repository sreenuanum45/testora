import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProjectsModule } from '../projects/projects.module';
import { SuitesModule } from '../suites/suites.module';
import { SchedulersController } from './schedulers.controller';
import { SchedulersService } from './schedulers.service';
import { SchedulersProcessor } from './schedulers.processor';

@Module({
  imports: [ProjectsModule, SuitesModule, BullModule.registerQueue({ name: 'scheduler' })],
  controllers: [SchedulersController],
  providers: [SchedulersService, SchedulersProcessor],
})
export class SchedulersModule {}
