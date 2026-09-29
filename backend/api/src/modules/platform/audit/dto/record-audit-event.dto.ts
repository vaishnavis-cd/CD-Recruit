import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RecordPlatformAuditDto {
  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @IsString()
  @IsNotEmpty()
  actorRole!: string;

  @IsString()
  @IsNotEmpty()
  subjectType!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsOptional()
  beforeState?: Record<string, any>;

  @IsOptional()
  afterState?: Record<string, any>;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  ticketRef?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class QueryAuditLogDto {
  @IsOptional()
  @IsString()
  subjectType?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  ticketRef?: string;

  @IsOptional()
  limit?: number;

  @IsOptional()
  offset?: number;
}
