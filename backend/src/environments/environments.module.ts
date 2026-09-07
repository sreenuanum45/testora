import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsService } from './environments.service';

@Module({
  imports: [ProjectsModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService],
})
export class EnvironmentsModule {}
