import { Global, Module } from '@nestjs/common';
import { LlmProviderService } from './llm-provider.service';
import { LlmController } from './llm.controller';

@Global()
@Module({
  controllers: [LlmController],
  providers: [LlmProviderService],
  exports: [LlmProviderService],
})
export class LlmModule {}
