import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { DataSetsService, parseCsv, type FakerColumnType } from './datasets.service';

const FAKER_TYPES: FakerColumnType[] = [
  'fullName', 'firstName', 'lastName', 'email', 'phone', 'username', 'password', 'uuid',
  'streetAddress', 'city', 'country', 'zipCode', 'company', 'jobTitle', 'number', 'boolean',
  'pastDate', 'futureDate', 'word', 'sentence', 'url', 'creditCardNumber',
];

class CreateDataSetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsArray()
  rows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  csv?: string;
}

class FakerColumnDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(FAKER_TYPES)
  type!: FakerColumnType;
}

class GenerateDataSetDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FakerColumnDto)
  columns!: FakerColumnDto[];

  @IsInt()
  @Min(1)
  @Max(500)
  rowCount!: number;
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/data-sets')
export class DataSetsController {
  constructor(private readonly dataSets: DataSetsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: CreateDataSetDto) {
    const rows = dto.csv ? parseCsv(dto.csv) : (dto.rows ?? []);
    return this.dataSets.create(user.sub, projectId, dto.name, rows);
  }

  /** Faker-generated synthetic Data Sets — lets a user spin up N rows of realistic-looking
   *  test data (names, emails, addresses, etc.) instead of hand-typing a CSV. */
  @Post('generate')
  generate(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Body() dto: GenerateDataSetDto) {
    return this.dataSets.generate(user.sub, projectId, dto.name, dto.columns, dto.rowCount);
  }

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string) {
    return this.dataSets.findAll(user.sub, projectId);
  }

  @Delete(':dataSetId')
  remove(@CurrentUser() user: JwtPayload, @Param('projectId') projectId: string, @Param('dataSetId') dataSetId: string) {
    return this.dataSets.remove(user.sub, projectId, dataSetId);
  }
}
