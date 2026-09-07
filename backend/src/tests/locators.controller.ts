import { Body, Controller, Delete, Param, Put, UseGuards } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from './tests.service';

enum LocatorStrategyDto {
  TESTID = 'TESTID',
  ROLE = 'ROLE',
  LABEL = 'LABEL',
  PLACEHOLDER = 'PLACEHOLDER',
  TEXT = 'TEXT',
  CSS = 'CSS',
}

class UpdateLocatorDto {
  @IsEnum(LocatorStrategyDto)
  strategy!: LocatorStrategyDto;

  @IsString()
  @MinLength(1)
  value!: string;

  @IsOptional()
  @IsString()
  roleName?: string;
}

/** Custom Locators: lets a user manually override a step's locator strategy/value — e.g.
 *  when the recorder guessed a brittle one, or to hand-tune before self-healing ever has
 *  to run. */
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tests/:testId/locators')
export class LocatorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

  @Put(':key')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Param('key') key: string,
    @Body() dto: UpdateLocatorDto,
  ) {
    await this.tests.findOne(user.sub, projectId, testId);
    const existing = await this.prisma.locator.findUnique({ where: { testId_key: { testId, key } } });
    if (!existing) throw new NotFoundException('Locator not found');
    return this.prisma.locator.update({
      where: { testId_key: { testId, key } },
      data: { strategy: dto.strategy, value: dto.value, roleName: dto.roleName },
    });
  }

  @Delete(':key')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('testId') testId: string,
    @Param('key') key: string,
  ) {
    await this.tests.findOne(user.sub, projectId, testId);
    await this.prisma.locator.delete({ where: { testId_key: { testId, key } } }).catch(() => undefined);
    return { deleted: true };
  }
}
