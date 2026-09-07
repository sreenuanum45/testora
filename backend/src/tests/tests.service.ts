import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTestDto } from './dto/test.dto';
import { materializeLocators } from './locator-materializer';
import { flattenComponentSteps } from './step-flattener';
import type { RecordedStep } from '../recording/step-parser';

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, dto: CreateTestDto) {
    await this.projects.findOneOwned(userId, projectId);
    const needsWeb = dto.type === 'WEB' || dto.type === 'WEB_API';
    const needsApi = dto.type === 'API' || dto.type === 'WEB_API';
    return this.prisma.test.create({
      data: {
        name: dto.name,
        type: dto.type,
        category: dto.category,
        projectId,
        moduleId: dto.moduleId,
        targetUrl: needsWeb ? dto.targetUrl : undefined,
        recordInIncognito: dto.recordInIncognito ?? true,
        apiMethod: needsApi ? dto.apiMethod : undefined,
        apiEndpoint: needsApi ? dto.apiEndpoint : undefined,
        apiHeaders: needsApi ? (dto.apiHeaders ?? {}) : undefined,
        apiBody: needsApi ? ((dto.apiBody as Prisma.InputJsonValue) ?? Prisma.JsonNull) : undefined,
        retries: dto.retries ?? 0,
        dataSetId: dto.dataSetId,
        environmentId: dto.environmentId,
        viewportWidth: needsWeb ? dto.viewportWidth : undefined,
        viewportHeight: needsWeb ? dto.viewportHeight : undefined,
        userAgent: needsWeb ? dto.userAgent : undefined,
      },
    });
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.test.findMany({
      where: { projectId },
      include: { module: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, projectId: string, testId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const test = await this.prisma.test.findUnique({ where: { id: testId }, include: { locators: true } });
    if (!test || test.projectId !== projectId) throw new NotFoundException('Test not found');
    return test;
  }

  async updateSteps(userId: string, projectId: string, testId: string, steps: unknown[]) {
    await this.findOne(userId, projectId, testId);
    await this.prisma.test.update({ where: { id: testId }, data: { steps: steps as object[] } });
    // Locator keys are index-based ("step-N"), and execution flattens component-reference
    // steps before generating the spec — flatten here too so a "step-N" key always means
    // the same Nth element both times, instead of drifting whenever a component step
    // (which can expand to 0, 1, or many steps) sits before it in the list.
    const flattened = await flattenComponentSteps(this.prisma, steps as RecordedStep[]);
    await materializeLocators(this.prisma, testId, flattened);
    return this.prisma.test.findUnique({ where: { id: testId }, include: { locators: true } });
  }
}
