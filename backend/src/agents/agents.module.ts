import { Module } from '@nestjs/common';
import { TestsModule } from '../tests/tests.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [TestsModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
