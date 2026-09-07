import { Injectable, NotFoundException } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';

export type FakerColumnType =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'username'
  | 'password'
  | 'uuid'
  | 'streetAddress'
  | 'city'
  | 'country'
  | 'zipCode'
  | 'company'
  | 'jobTitle'
  | 'number'
  | 'boolean'
  | 'pastDate'
  | 'futureDate'
  | 'word'
  | 'sentence'
  | 'url'
  | 'creditCardNumber';

export interface FakerColumn {
  name: string;
  type: FakerColumnType;
}

const FAKER_GENERATORS: Record<FakerColumnType, () => string> = {
  fullName: () => faker.person.fullName(),
  firstName: () => faker.person.firstName(),
  lastName: () => faker.person.lastName(),
  email: () => faker.internet.email(),
  phone: () => faker.phone.number(),
  username: () => faker.internet.username(),
  password: () => faker.internet.password({ length: 12 }),
  uuid: () => faker.string.uuid(),
  streetAddress: () => faker.location.streetAddress(),
  city: () => faker.location.city(),
  country: () => faker.location.country(),
  zipCode: () => faker.location.zipCode(),
  company: () => faker.company.name(),
  jobTitle: () => faker.person.jobTitle(),
  number: () => String(faker.number.int({ min: 1, max: 10000 })),
  boolean: () => String(faker.datatype.boolean()),
  pastDate: () => faker.date.past().toISOString().slice(0, 10),
  futureDate: () => faker.date.future().toISOString().slice(0, 10),
  word: () => faker.lorem.word(),
  sentence: () => faker.lorem.sentence(),
  url: () => faker.internet.url(),
  creditCardNumber: () => faker.finance.creditCardNumber(),
};

export function generateFakerRows(columns: FakerColumn[], rowCount: number): Array<Record<string, string>> {
  const count = Math.min(Math.max(rowCount, 1), 500);
  return Array.from({ length: count }, () =>
    Object.fromEntries(columns.map((col) => [col.name, FAKER_GENERATORS[col.type]()])),
  );
}

@Injectable()
export class DataSetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async create(userId: string, projectId: string, name: string, rows: Array<Record<string, unknown>>) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.dataSet.create({ data: { name, projectId, rows: rows as object[] } });
  }

  async generate(userId: string, projectId: string, name: string, columns: FakerColumn[], rowCount: number) {
    const rows = generateFakerRows(columns, rowCount);
    return this.create(userId, projectId, name, rows);
  }

  async findAll(userId: string, projectId: string) {
    await this.projects.findOneOwned(userId, projectId);
    return this.prisma.dataSet.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }

  async findOne(userId: string, projectId: string, dataSetId: string) {
    await this.projects.findOneOwned(userId, projectId);
    const dataSet = await this.prisma.dataSet.findUnique({ where: { id: dataSetId } });
    if (!dataSet || dataSet.projectId !== projectId) throw new NotFoundException('Data set not found');
    return dataSet;
  }

  async remove(userId: string, projectId: string, dataSetId: string) {
    await this.findOne(userId, projectId, dataSetId);
    await this.prisma.dataSet.delete({ where: { id: dataSetId } });
    return { deleted: true };
  }
}

/** Parses a small CSV string (no quoted-comma edge cases — this is for simple QA test
 *  data, not general-purpose CSV) into row objects keyed by the header row. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0]!.split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}
