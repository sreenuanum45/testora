import { Module } from '@nestjs/common';
import { TestsModule } from '../tests/tests.module';
import { NlpController } from './nlp.controller';
import { NlpService } from './nlp.service';

@Module({
  imports: [TestsModule],
  controllers: [NlpController],
  providers: [NlpService],
})
export class NlpModule {}
