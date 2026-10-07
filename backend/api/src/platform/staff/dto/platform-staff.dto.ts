import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlatformStaffRole } from '@cd-recruit/shared-types';

export class ListPlatformStaffQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(PlatformStaffRole)
  role?: PlatformStaffRole;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class CreatePlatformStaffDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(100)
  fullName: string;

  @IsEmail({}, { message: 'Valid email address is required' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsEnum(PlatformStaffRole, { message: 'Role must be OWNER, FINANCE, or SUPPORT' })
  @IsNotEmpty({ message: 'Role is required' })
  role: PlatformStaffRole;

  @IsString()
  @IsNotEmpty({ message: 'Initial temporary password is required' })
  initialPassword: string;
}

export class UpdateStaffRoleDto {
  @IsEnum(PlatformStaffRole, { message: 'Role must be OWNER, FINANCE, or SUPPORT' })
  @IsNotEmpty({ message: 'Role is required' })
  role: PlatformStaffRole;

  @IsString()
  @IsNotEmpty({ message: 'Audit reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;
}

export class StaffActionReasonDto {
  @IsString()
  @IsNotEmpty({ message: 'Audit reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;
}

export class ResetStaffPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'New temporary password is required' })
  newTemporaryPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Audit reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;
}

export interface PlatformStaffListItemDto {
  id: string;
  fullName: string;
  email: string;
  role: PlatformStaffRole;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ListPlatformStaffResponseDto {
  data: PlatformStaffListItemDto[];
  items?: PlatformStaffListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffOptionDto {
  id: string;
  fullName: string;
  role: string;
}
