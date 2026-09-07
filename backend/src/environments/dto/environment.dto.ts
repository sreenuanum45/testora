import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEnvironmentDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;
}

export class UpsertVariableDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}
