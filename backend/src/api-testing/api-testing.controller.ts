import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class SendRequestDto {
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method!: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  @IsString()
  url!: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  body?: unknown;
}

/** Ad-hoc "try it out" request sender for the API Testing module — separate from
 *  executing a SAVED API test (see ExecutionProcessor.executeApiTest), this is for
 *  trying a request before deciding to save it as a test. */
@UseGuards(JwtAuthGuard)
@Controller('api-testing/send')
export class ApiTestingController {
  @Post()
  async send(@Body() dto: SendRequestDto) {
    const started = Date.now();
    try {
      const res = await fetch(dto.url, {
        method: dto.method,
        headers: dto.headers ?? {},
        body: dto.method !== 'GET' && dto.body !== undefined ? JSON.stringify(dto.body) : undefined,
      });
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { status: res.status, statusText: res.statusText, headers, body: text, durationMs: Date.now() - started };
    } catch (err) {
      return { status: 0, statusText: 'ERROR', headers: {}, body: err instanceof Error ? err.message : String(err), durationMs: Date.now() - started };
    }
  }
}
