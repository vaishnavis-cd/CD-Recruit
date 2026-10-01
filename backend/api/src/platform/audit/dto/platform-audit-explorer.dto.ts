import { IsOptional, IsString, IsIn, IsInt, Min, Max, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class QueryAuditEventsDto {
  @IsOptional()
  @IsIn(["PLATFORM", "BILLING", "ALL"])
  source?: "PLATFORM" | "BILLING" | "ALL" = "ALL";

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  subjectType?: string;

  @IsOptional()
  @IsString()
  targetTenantId?: string;

  @IsOptional()
  @IsString()
  ticketRef?: string;

  @IsOptional()
  @IsIn(["SUCCESS", "FAILED"])
  result?: "SUCCESS" | "FAILED";

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface CommonAuditEventDto {
  id: string;
  source: "PLATFORM" | "BILLING";
  occurredAt: string;
  actorId: string;
  actorRole: string;
  subjectType: string;
  subjectId: string;
  action: string;
  targetTenantId: string | null;
  tenantName: string | null;
  reason: string | null;
  ticketRef: string | null;
  executionResult: string;
  requestId: string | null;
  hasDiff: boolean;
}

export interface AuditEventChangeDiff {
  path: string;
  before: any;
  after: any;
}

export interface AuditEventDetailDto extends CommonAuditEventDto {
  impersonationContext: any;
  before: any;
  after: any;
  changes: AuditEventChangeDiff[];
}

export interface AuditFiltersDto {
  actions: string[];
  actors: Array<{ id: string; role: string }>;
  subjectTypes: string[];
}
