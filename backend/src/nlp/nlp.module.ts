import { Module } from '@nestjs/common';
import { TestsModule } from '../tests/tests.module';
import { NlpController, AssertionCoachController } from './nlp.controller';
import { NlpService } from './nlp.service';

@Module({
  imports: [TestsModule],
  controllers: [NlpController, AssertionCoachController],
  providers: [NlpService],
})
export class NlpModule {}
