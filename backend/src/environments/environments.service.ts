import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateEnvironmentDto, UpsertVariableDto } from './dto/environment.dto';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  /** Idempotent by (projectId, name) — same reasoning as ProjectsService.create. */
  async create(userId: string, projectId: string, dto: CreateEnvironmentDto) {
    await this.projects.findOneOwned(userId, projectId);
    const existing = await this.prisma.environment.findUnique({ where: { projectId_name: { projectId, name: dto.name } } });
    if (existing) return existing;
    return this.prisma.environment.create({
      data: { name: dto.name, baseUrl: dto.baseUrl, projectId },
    });
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.environment.findMany({
      where: { projectId },
      include: { variables: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertVariable(userId: string, projectId: string, environmentId: string, dto: UpsertVariableDto) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.variable.upsert({
      where: { environmentId_key: { environmentId, key: dto.key } },
      create: { environmentId, key: dto.key, value: dto.value, isSecret: dto.isSecret ?? false },
      update: { value: dto.value, isSecret: dto.isSecret ?? false },
    });
  }

  async removeVariable(userId: string, projectId: string, environmentId: string, key: string) {
    await this.projects.findOneOwned(userId, projectId);
    await this.prisma.variable.delete({ where: { environmentId_key: { environmentId, key } } }).catch(() => undefined);
    return { deleted: true };
  }

  async remove(userId: string, projectId: string, environmentId: string) {
    await this.projects.findOneOwned(userId, projectId);
    await this.prisma.environment.delete({ where: { id: environmentId } });
    return { deleted: true };
  }
}
