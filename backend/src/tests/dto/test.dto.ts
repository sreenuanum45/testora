import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateIf } from 'class-validator';

export enum TestTypeDto {
  WEB = 'WEB',
  API = 'API',
  WEB_API = 'WEB_API',
}

export enum TestCategoryDto {
  SMOKE = 'SMOKE',
  REGRESSION = 'REGRESSION',
  SANITY = 'SANITY',
  E2E = 'E2E',
}

function needsWebUrl(type: TestTypeDto): boolean {
  return type === TestTypeDto.WEB || type === TestTypeDto.WEB_API;
}
function needsApiFields(type: TestTypeDto): boolean {
  return type === TestTypeDto.API || type === TestTypeDto.WEB_API;
}

export class CreateTestDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  moduleId?: string;

  @IsEnum(TestCategoryDto)
  category!: TestCategoryDto;

  @IsEnum(TestTypeDto)
  type!: TestTypeDto;

  // Required when type includes a Web flow (WEB or the combined WEB_API). Matches the UI
  // tip: "Ensure the URL starts with 'http://' or 'https://'."
  // Accepts a real http(s) URL, or a {{env.KEY}} placeholder that resolves to one at
  // execution/export time (see ExecutionProcessor.executeWebTest / ExportController) — the
  // literal-URL-only check would otherwise make it impossible to ever save a templated
  // target URL, since there's no separate "update test" endpoint to set it after creation.
  @ValidateIf((o: CreateTestDto) => needsWebUrl(o.type))
  @IsString()
  @Matches(/^(https?:\/\/|\{\{env\.\w+\}\})/, {
    message: "Test URL must start with 'http://', 'https://', or a '{{env.KEY}}' placeholder",
  })
  targetUrl?: string;

  @IsOptional()
  @IsBoolean()
  recordInIncognito?: boolean;

  // Required when type includes an API check (API or the combined WEB_API)
  @ValidateIf((o: CreateTestDto) => needsApiFields(o.type))
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  apiMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  @ValidateIf((o: CreateTestDto) => needsApiFields(o.type))
  @IsString()
  @MinLength(1)
  apiEndpoint?: string;

  @IsOptional()
  @IsObject()
  apiHeaders?: Record<string, string>;

  @IsOptional()
  apiBody?: unknown;

  // Auto-Retry: how many times Playwright retries this test on failure before it's
  // marked FAILED. 0 = no retries (default).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  retries?: number;

  // Data-Driven Testing: run once per row in the referenced DataSet instead of once.
  @IsOptional()
  @IsString()
  dataSetId?: string;

  // Environment Variables: {{env.KEY}} placeholders in steps/API config resolve against
  // this Environment's Variables at execution/export time.
  @IsOptional()
  @IsString()
  environmentId?: string;

  // Advanced browser options (WEB/WEB_API only) — emitted as a Playwright test.use() block.
  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(4000)
  viewportWidth?: number;

  @IsOptional()
  @IsInt()
  @Min(200)
  @Max(4000)
  viewportHeight?: number;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateStepsDto {
  @IsObject({ each: true })
  @Type(() => Object)
  steps!: Array<Record<string, unknown>>;
}

// General test settings — tags and quarantine — edited from the test detail header rather
// than the step builder, so this is deliberately separate from UpdateStepsDto.
export class UpdateTestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  quarantined?: boolean;
}

export class SetVisualBaselineDto {
  @IsString()
  @MinLength(1)
  runId!: string;
}
