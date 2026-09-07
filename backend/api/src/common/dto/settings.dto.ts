import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";
import { StaffRole, Permission } from "@cd-recruit/shared-types";

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

  @IsOptional()
  @IsString()
  aiIntensity?: string;
}

export class UpdateSystemConfigDto {
  @IsOptional()
  @IsInt()
  heartbeatStaleThresholdSeconds?: number;

  @IsOptional()
  @IsInt()
  graceWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  maxDisconnectCount?: number;
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

export class UpdateAppealWindowConfigDto {
  @IsInt()
  @Min(1)
  appealWindowDays: number;
}

export class UpdateRolePermissionDto {
  @IsEnum(StaffRole)
  role: StaffRole;

  @IsEnum(Permission)
  permission: Permission;

  @IsBoolean()
  isEnabled: boolean;
}

export class CreateStaffDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsEnum(StaffRole)
  role: StaffRole;

  @IsOptional()
  @IsString()
  tempPassword?: string;

  @IsOptional()
  @IsBoolean()
  temporary?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;
}

export class ResetStaffPasswordDto {
  @IsOptional()
  @IsString()
  newPassword?: string;

  @IsOptional()
  @IsBoolean()
  temporary?: boolean;
}
