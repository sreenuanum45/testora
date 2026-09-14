import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RecordingService } from './recording/recording.service';
import { attachVncRelay } from './recording/vnc-relay';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);

  const recording = app.get(RecordingService);
  attachVncRelay(app.getHttpServer(), (testId) => recording.isActive(testId));

  // eslint-disable-next-line no-console
  console.log(`Testora API listening on http://localhost:${port}/api`);
}

bootstrap();
