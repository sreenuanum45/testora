import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ExecutionModule } from '../execution/execution.module';
import { SuitesController } from './suites.controller';
import { SuitesService } from './suites.service';

@Module({
  imports: [ProjectsModule, ExecutionModule],
  controllers: [SuitesController],
  providers: [SuitesService],
  exports: [SuitesService],
})
export class SuitesModule {}
