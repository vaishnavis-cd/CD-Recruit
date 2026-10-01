import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsInt, Min, Max, IsString, Length, IsUUID } from "class-validator";
import { Type } from "class-transformer";

export class ListBillingAccountsQueryDto {
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

  @ApiPropertyOptional({ description: "Search query for name, legal entity name, or tax ID" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by account status (ACTIVE, RESTRICTED, SUSPENDED)" })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "Filter by billing country (ISO-2, e.g. IN, US, MY)" })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}

export class BillingAccountIdParamDto {
  @ApiProperty({ description: "Billing account UUID" })
  @IsUUID()
  id: string;
}
