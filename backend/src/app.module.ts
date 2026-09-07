import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { EnvironmentsModule } from './environments/environments.module';
import { TestModulesModule } from './test-modules/test-modules.module';
import { TestsModule } from './tests/tests.module';
import { RecordingModule } from './recording/recording.module';
import { ExportModule } from './export/export.module';
import { ExecutionModule } from './execution/execution.module';
import { SuitesModule } from './suites/suites.module';
import { SchedulersModule } from './schedulers/schedulers.module';
import { ApiTestingModule } from './api-testing/api-testing.module';
import { NlpModule } from './nlp/nlp.module';
import { ComponentsModule } from './components/components.module';
import { DataSetsModule } from './datasets/datasets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: process.env.REDIS_URL
        ? { url: process.env.REDIS_URL }
        : {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
          },
    }),
    PrismaModule,
    LlmModule,
    AuthModule,
    ProjectsModule,
    EnvironmentsModule,
    TestModulesModule,
    TestsModule,
    RecordingModule,
    ExportModule,
    ExecutionModule,
    SuitesModule,
    SchedulersModule,
    ApiTestingModule,
    NlpModule,
    ComponentsModule,
    DataSetsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
