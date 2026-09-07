import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ComponentsController } from './components.controller';
import { ComponentsService } from './components.service';

@Module({
  imports: [ProjectsModule],
  controllers: [ComponentsController],
  providers: [ComponentsService],
  exports: [ComponentsService],
})
export class ComponentsModule {}
