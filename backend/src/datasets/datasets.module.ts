import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { DataSetsController } from './datasets.controller';
import { DataSetsService } from './datasets.service';

@Module({
  imports: [ProjectsModule],
  controllers: [DataSetsController],
  providers: [DataSetsService],
  exports: [DataSetsService],
})
export class DataSetsModule {}
