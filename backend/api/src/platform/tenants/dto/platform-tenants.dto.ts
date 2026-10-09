import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsBoolean,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export enum PlatformTenantStatusFilter {
  PROVISIONING = 'PROVISIONING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  OFFBOARDED = 'OFFBOARDED',
}

export enum PlatformTenantLicenseTier {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  ENTERPRISE = 'ENTERPRISE',
}

export enum PlatformTenantSortField {
  createdAt = 'createdAt',
  name = 'name',
}

export enum PlatformSortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class ListPlatformTenantsQueryDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(PlatformTenantStatusFilter, {
    message: 'status must be one of: PROVISIONING, ACTIVE, SUSPENDED, OFFBOARDED',
  })
  status?: PlatformTenantStatusFilter;

  @IsOptional()
  @IsEnum(PlatformTenantLicenseTier, {
    message: 'tier must be one of: STARTER, GROWTH, ENTERPRISE',
  })
  tier?: PlatformTenantLicenseTier;

  @IsOptional()
  @IsEnum(PlatformTenantSortField, {
    message: 'sort must be one of: createdAt, name',
  })
  sort?: PlatformTenantSortField = PlatformTenantSortField.createdAt;

  @IsOptional()
  @IsEnum(PlatformSortOrder, {
    message: 'order must be one of: asc, desc',
  })
  order?: PlatformSortOrder = PlatformSortOrder.desc;
}

export class GetTenantAuditQueryDto {
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

export interface PlatformTenantListItemDto {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  licenseTier: string;
  createdAt: string;
  driveCount: number;
  creditsRemaining: number | null;
  funnelStage?: string | null;
  funnelReason?: string | null;
}

export interface ListPlatformTenantsResponseDto {
  items: PlatformTenantListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TenantOverviewDto {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED';
  licenseTier: string;
  createdAt: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  internalOwnerId: string | null;
  domainVerifiedAt: string | null;
  walkthroughCompletedAt: string | null;
  walkthroughChecklist: Record<string, any> | null;
}

export interface TenantDriveSummaryDto {
  id: string;
  name: string;
  status: string;
  invitesSent: number;
  sessionsStarted: number;
  sessionsCompleted: number;
}

export interface TenantDrivesSectionDto {
  driveCount: number;
  items: TenantDriveSummaryDto[];
}

export interface TenantBillingSectionDto {
  connected: boolean;
  billingAccountId?: string | null;
  summary?: any;
}

export interface TenantLicensingSectionDto {
  licenseTier: string;
}

export interface TenantRetentionSectionDto {
  appealWindowDaysOverride: number | null;
}

export interface TenantDetailResponseDto {
  overview: TenantOverviewDto;
  drives: TenantDrivesSectionDto;
  billing: TenantBillingSectionDto;
  licensing: TenantLicensingSectionDto;
  retention: TenantRetentionSectionDto;
  funnelStage: string | null;
  funnelReason?: string | null;
}

export interface TenantBriefResponseDto {
  id: string;
  name: string;
  slug: string;
  lifecycleStage: string;
  licenseTier: string;
  createdAt: string;
}

export class SuspendTenantDto {
  @IsString()
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ticketRef?: string;
}

export class RestoreTenantDto {
  @IsString()
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ticketRef?: string;
}

export class WalkthroughUpdateDto {
  @IsOptional()
  @IsBoolean()
  kickoffCallDone?: boolean;

  @IsOptional()
  @IsBoolean()
  sampleDriveDeployed?: boolean;

  @IsOptional()
  @IsBoolean()
  adminTrained?: boolean;
}

export class PipelineQueryDto {
  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export interface PipelineCardDto {
  id: string;
  name: string;
  domain: string | null;
  domainVerified: boolean;
  internalOwnerId: string | null;
  createdAt: string;
  driveCount: number;
  walkthroughDone: boolean;
}

export interface PipelineColumnDto {
  count: number;
  items: PipelineCardDto[];
}

export interface PipelineBoardResponseDto {
  SIGNED_UP: PipelineColumnDto;
  TRIAL_ACTIVE: PipelineColumnDto;
  FIRST_DRIVE_CREATED: PipelineColumnDto;
  CONVERTED: PipelineColumnDto;
  DORMANT: PipelineColumnDto;
  UNKNOWN: PipelineColumnDto;
}

export class AssignTenantOwnerDto {
  @IsOptional()
  @ValidateIf((o) => o.internalOwnerId !== null && o.internalOwnerId !== undefined)
  @IsUUID('4')
  internalOwnerId: string | null;
}

export enum LicenseTierEnum {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  ENTERPRISE = 'ENTERPRISE',
}

export class UpdateLicenseTierDto {
  @IsEnum(LicenseTierEnum, { message: 'Invalid license tier' })
  licenseTier: LicenseTierEnum;

  @IsString()
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ticketRef?: string;
}




