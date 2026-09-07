import { Module } from '@nestjs/common';
import { TestsModule } from '../tests/tests.module';
import { ExportController } from './export.controller';

@Module({
  imports: [TestsModule],
  controllers: [ExportController],
})
export class ExportModule {}
