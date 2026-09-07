import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TestModulesController } from './test-modules.controller';
import { TestModulesService } from './test-modules.service';

@Module({
  imports: [ProjectsModule],
  controllers: [TestModulesController],
  providers: [TestModulesService],
})
export class TestModulesModule {}
