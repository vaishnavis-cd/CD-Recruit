import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsUUID,
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsObject,
  IsOptional,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ManualRequestKind } from "@cd-recruit/shared-types";

export class CreateManualRequestDto {
  @ApiProperty({ description: "Target billing account UUID" })
  @IsUUID()
  billingAccountId: string;

  @ApiProperty({ enum: ManualRequestKind, description: "Kind of manual billing request" })
  @IsEnum(ManualRequestKind)
  kind: ManualRequestKind;

  @ApiProperty({
    description: "Support or CRM ticket reference (e.g. JIRA-4821)",
    example: "JIRA-4821",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: "ticketRef must be alphanumeric format (e.g. JIRA-1234)",
  })
  ticketRef: string;

  @ApiProperty({
    description: "Detailed business justification (min 10 chars, zero PII)",
    example: "Goodwill grant for campus drive network outage",
  })
  @IsString()
  @MinLength(10)
  reason: string;

  @ApiProperty({ description: "Typed payload specific to the request kind" })
  @IsObject()
  payload: Record<string, any>;
}

export class RejectManualRequestDto {
  @ApiProperty({
    description: "Mandatory rejection reason (min 10 chars)",
    example: "Ticket reference does not match approved customer agreement",
  })
  @IsString()
  @MinLength(10)
  rejectionReason: string;
}

export class ListManualRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ["my_requests", "awaiting_approval", "all"],
    default: "all",
  })
  @IsOptional()
  @IsString()
  tab?: "my_requests" | "awaiting_approval" | "all" = "all";

  @ApiPropertyOptional({ description: "Filter by request status (PENDING, APPROVED, REJECTED, EXECUTED, CANCELLED)" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Filter by request kind" })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ description: "Filter by target billing account UUID" })
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

  @ApiPropertyOptional({ description: "Page number", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ManualRequestIdParamDto {
  @ApiProperty({ description: "Manual billing request UUID" })
  @IsUUID()
  id: string;
}
