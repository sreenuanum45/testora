import { Module } from '@nestjs/common';
import { TestsModule } from '../tests/tests.module';
import { RecordingController } from './recording.controller';
import { RecordingService } from './recording.service';

@Module({
  imports: [TestsModule],
  controllers: [RecordingController],
  providers: [RecordingService],
})
export class RecordingModule {}
