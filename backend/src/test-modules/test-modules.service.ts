import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class TestModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, name: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.testModule.create({ data: { name, projectId } });
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.testModule.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }
}
