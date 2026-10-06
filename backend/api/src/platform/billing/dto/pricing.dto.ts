import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  Length,
  IsDateString,
  IsBoolean,
} from "class-validator";
import { Transform } from "class-transformer";
import { PoolType } from "../../../billing/price/price-book.types";

export class PublishPriceBookEntryDto {
  @ApiProperty({ description: "Commercial SKU code", example: "DRIVE_PASS_100_IN" })
  @IsString()
  sku: string;

  @ApiProperty({ enum: PoolType, description: "Type of pool minted by SKU" })
  @IsEnum(PoolType)
  poolType: PoolType;

  @ApiProperty({ description: "Number of assessment credits included", example: 100 })
  @IsInt()
  @Min(1)
  credits: number;

  @ApiPropertyOptional({ description: "Validity days of minted pool", example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @ApiProperty({ description: "ISO-2 billing country anchor", example: "IN" })
  @IsString()
  @Length(2, 2)
  billingCountry: string;

  @ApiProperty({ description: "Currency code (INR, USD, MYR)", example: "INR" })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({
    description: "Unit price per credit in integer minor units (paise/cents)",
    example: 6000,
  })
  @IsInt()
  @Min(1)
  unitPriceMinor: number;

  @ApiProperty({
    description: "Effective from timestamp (ISO-8601)",
    example: "2026-10-01T00:00:00Z",
  })
  @IsDateString()
  effectiveFrom: string;
}

export class ListPricingCatalogQueryDto {
  @ApiPropertyOptional({ description: "Filter catalog by ISO-2 country (IN, US, MY)" })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({ description: "Filter for currently active versions only (default true)", default: true })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  activeOnly?: boolean = true;
}
