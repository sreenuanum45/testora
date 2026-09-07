import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import type { RecordedStep } from '../recording/step-parser';

@Injectable()
export class ComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, name: string, steps: RecordedStep[]) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.component.create({ data: { name, projectId, steps: steps as object[] } });
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.component.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }

  async findOne(userId: string, projectId: string, componentId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const component = await this.prisma.component.findUnique({ where: { id: componentId } });
    if (!component || component.projectId !== projectId) throw new NotFoundException('Component not found');
    return component;
  }

  async update(userId: string, projectId: string, componentId: string, steps: RecordedStep[]) {
    await this.findOne(userId, projectId, componentId);
    return this.prisma.component.update({ where: { id: componentId }, data: { steps: steps as object[] } });
  }

  async remove(userId: string, projectId: string, componentId: string) {
    await this.findOne(userId, projectId, componentId);
    await this.prisma.component.delete({ where: { id: componentId } });
    return { deleted: true };
  }
}
