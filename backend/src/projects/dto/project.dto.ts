import { IsOptional, IsString, IsUrl, MinLength, ValidateIf } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateProjectDto {
  // Slack-compatible incoming webhook — a POST with a { text } body fires here whenever a
  // standalone run or a suite run finishes FAILED (see NotificationsService). An empty
  // string clears it (ProjectsService.update maps '' -> null) — that's how the Settings
  // page's "Remove" action works, since a DTO field can't distinguish "omitted" from "null".
  @IsOptional()
  @ValidateIf((o: UpdateProjectDto) => !!o.webhookUrl)
  @IsUrl({ require_tld: false }, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string;
}
