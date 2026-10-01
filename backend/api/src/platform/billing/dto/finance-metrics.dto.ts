import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsEnum, IsDateString, IsUUID } from "class-validator";
import { PeriodType } from "../../../billing/metrics/finance-metrics.types";

export class FinanceMetricsQueryDto {
  @ApiPropertyOptional({
    enum: PeriodType,
    description: "Preset reporting period (TODAY, CURRENT_WEEK, CURRENT_MONTH, PREVIOUS_MONTH, CUSTOM, ALL_TIME)",
    default: PeriodType.CURRENT_MONTH,
  })
  @IsOptional()
  @IsEnum(PeriodType)
  period?: PeriodType;

  @ApiPropertyOptional({ description: "Explicit start date for CUSTOM period (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "Explicit end date for CUSTOM period (exclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Filter metrics by billing account UUID" })
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;
}
