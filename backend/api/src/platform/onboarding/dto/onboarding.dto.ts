import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LicenseTierDto {
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  ENTERPRISE = 'ENTERPRISE',
}

export class DomainCheckRequestDto {
  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;
}

export class DomainCheckResponseDto {
  ok: boolean;
  normalizedDomain: string;
  reasons: string[];
}

export class CreateDraftDto {
  @IsOptional()
  @IsString()
  corporateDomain?: string;

  @IsOptional()
  @IsObject()
  draftData?: Record<string, any>;
}

export class UpdateDraftDto {
  @IsInt()
  @Min(1)
  @Max(4)
  currentStep: number;

  @IsObject()
  draftData: Record<string, any>;
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

export interface CommitTenantResultDto {
  organizationId: string;
  billingAccountId: string;
  trial: {
    creditsGranted: number;
    validityDays: number;
    expiresAt: string;
  };
}
