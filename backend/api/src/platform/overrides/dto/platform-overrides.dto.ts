import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MinLength,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateOverrideDto {
  @ApiProperty({ description: "Target tenant / organization ID or name", example: "org_acme_01" })
  @IsString()
  @MinLength(1)
  tenantId: string;

  @ApiPropertyOptional({ description: "Target drive UUID if scoped to a specific drive", example: "drv_campus_2026_09" })
  @IsOptional()
  @IsString()
  driveId?: string;

  @ApiProperty({
    description: "Override category type",
    example: "PROCTORING_RELAXATION",
    enum: [
      "PROCTORING_RELAXATION",
      "PROCTORING_SENSITIVITY",
      "SCHEDULE_EXTENSION",
      "QUESTION_CORRECTION",
      "QUESTION_FIX",
      "INVITE_RATIO",
      "INCIDENT_WINDOW",
    ],
  })
  @IsString()
  overrideType: string;

  @ApiPropertyOptional({ description: "Duration in hours before override expires", default: 24, minimum: 1, maximum: 168 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  durationHours?: number = 24;

  @ApiProperty({ description: "Operational justification / reason (min 5 chars)", example: "Campus Wi-Fi unstable at Tier-2 university test center" })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiProperty({ description: "Mandatory ticket reference (Jira / Linear / Incident)", example: "INC-88902" })
  @IsString()
  @MinLength(2)
  ticketRef: string;

  @ApiPropertyOptional({ description: "State before override application" })
  @IsOptional()
  @IsObject()
  beforeState?: Record<string, any>;

  @ApiPropertyOptional({ description: "State after override application" })
  @IsOptional()
  @IsObject()
  afterState?: Record<string, any>;
}

export class ListOverridesQueryDto {
  @ApiPropertyOptional({ description: "Filter by status (ACTIVE, EXPIRED, REVOKED)" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Filter by target organization ID" })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: "Page number", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: "Items per page (alias for limit)", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class RevokeOverrideDto {
  @ApiPropertyOptional({ description: "Reason for early revocation", example: "Drive concluded successfully" })
  @IsOptional()
  @IsString()
  reason?: string;
}
