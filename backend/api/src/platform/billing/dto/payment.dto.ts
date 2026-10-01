import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsUUID,
  IsString,
  MinLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  Length,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";

export class ManualInvoicePaymentDto {
  @ApiProperty({ description: "Target billing account UUID" })
  @IsUUID()
  billingAccountId: string;

  @ApiProperty({ description: "Invoice number", example: "INV-2026-0042" })
  @IsString()
  @MinLength(3)
  invoiceNumber: string;

  @ApiPropertyOptional({ description: "Purchase Order number", example: "PO-99412" })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiProperty({ description: "Linked price book entry UUID for historical pricing" })
  @IsUUID()
  priceBookEntryId: string;

  @ApiProperty({ description: "Quantity of credits purchased", example: 1000 })
  @IsInt()
  @Min(1)
  quantityCredits: number;

  @ApiProperty({ description: "Total amount charged in integer minor units (paise/cents)", example: 6000000 })
  @IsInt()
  @Min(0)
  amountMinor: number;

  @ApiPropertyOptional({ description: "Tax charged in integer minor units", example: 1080000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  @ApiProperty({ description: "ISO-3 currency code (INR, USD, MYR)", example: "INR" })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({ description: "Timestamp payment was captured (ISO-8601)", example: "2026-09-28T09:00:00Z" })
  @IsDateString()
  capturedAt: string;
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ description: "Filter by billing account UUID" })
  @IsOptional()
  @IsUUID()
  billingAccountId?: string;

  @ApiPropertyOptional({ description: "Filter by payment status (CAPTURED, REFUNDED, FAILED, DISPUTED, CREATED)" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Filter by payment provider (MANUAL_INVOICE, RAZORPAY, STRIPE)" })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: "Filter by invoice or PO number" })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional({ description: "Start date filter (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date filter (inclusive ISO-8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Page number (1-indexed)", default: 1 })
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
