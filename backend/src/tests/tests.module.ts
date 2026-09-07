import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { LocatorsController } from './locators.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [TestsController, LocatorsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
