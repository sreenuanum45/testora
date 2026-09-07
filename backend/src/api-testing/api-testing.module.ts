import { Module } from '@nestjs/common';
import { ApiTestingController } from './api-testing.controller';

@Module({
  controllers: [ApiTestingController],
})
export class ApiTestingModule {}
