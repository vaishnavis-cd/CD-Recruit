import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsUUID, IsString, IsDateString, IsBoolean, IsInt, Min, Max } from "class-validator";
import { Type, Transform } from "class-transformer";

export class ListLedgerQueryDto {
  @ApiPropertyOptional({ description: "Filter by billing account UUID" })
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

  @ApiPropertyOptional({ description: "Filter by credit pool UUID" })
  @IsOptional()
  @IsUUID()
  creditPoolId?: string;

  @ApiPropertyOptional({ description: "Filter by candidate session UUID" })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ description: "Filter by campus drive UUID" })
  @IsOptional()
  @IsUUID()
  driveId?: string;

  @ApiPropertyOptional({ description: "Filter by ledger entry type (e.g. GRANT, CONSUME, REVERSAL)" })
  @IsOptional()
  @IsString()
  entryType?: string;

  @ApiPropertyOptional({ description: "Filter by reason code" })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: "Filter start date (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "Filter end date (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Include shadow mode transactions (default false)", default: false })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeShadow?: boolean = false;

  @ApiPropertyOptional({ description: "Page number (1-indexed)", default: 1 })
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
}

export class ExportLedgerQueryDto {
  @ApiPropertyOptional({ description: "Filter by billing account UUID" })
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

  @ApiPropertyOptional({ description: "Filter by credit pool UUID" })
  @IsOptional()
  @IsUUID()
  creditPoolId?: string;

  @ApiPropertyOptional({ description: "Filter by candidate session UUID" })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ description: "Filter by campus drive UUID" })
  @IsOptional()
  @IsUUID()
  driveId?: string;

  @ApiPropertyOptional({ description: "Filter by ledger entry type" })
  @IsOptional()
  @IsString()
  entryType?: string;

  @ApiPropertyOptional({ description: "Filter by reason code" })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: "Filter start date (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "Filter end date (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Include shadow transactions (default false)", default: false })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeShadow?: boolean = false;
}
