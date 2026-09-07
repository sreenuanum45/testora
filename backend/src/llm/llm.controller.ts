import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LlmProviderService } from './llm-provider.service';

@UseGuards(JwtAuthGuard)
@Controller('llm-status')
export class LlmController {
  constructor(private readonly llm: LlmProviderService) {}

  @Get()
  status() {
    return this.llm.status();
  }
}
