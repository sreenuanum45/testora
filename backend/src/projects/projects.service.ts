import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent by (ownerId, name): a duplicate create for a name this user already has
   *  returns the existing project rather than erroring — makes "ensure a default project
   *  exists" bootstrap logic (see frontend Topbar) safe to call more than once. */
  async create(userId: string, dto: CreateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { ownerId_name: { ownerId: userId, name: dto.name } } });
    if (existing) return existing;
    return this.prisma.project.create({ data: { name: dto.name, ownerId: userId } });
  }

  findAllForUser(userId: string) {
    return this.prisma.project.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });
  }

  async findOneOwned(userId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== userId) throw new ForbiddenException('You do not have access to this project');
    return project;
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto) {
    await this.findOneOwned(userId, projectId);
    return this.prisma.project.update({
      where: { id: projectId },
      data: { webhookUrl: dto.webhookUrl === undefined ? undefined : dto.webhookUrl || null },
    });
  }
}
