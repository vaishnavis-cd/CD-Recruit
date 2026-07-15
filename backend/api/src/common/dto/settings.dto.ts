import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { StaffRole } from "@cd-recruit/shared-types";

export class UpdateStaffRoleDto {
  @IsEnum(StaffRole)
  role: StaffRole;
}

export class UpdateScoringConfigDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  aiConfidenceThreshold: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  passRateThreshold: number;
}

export class UpdateRetentionConfigDto {
  @IsInt()
  @Min(1)
  biometricRetentionDays: number;
}

export class ListAuditLogQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}
