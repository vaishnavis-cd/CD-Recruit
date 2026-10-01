import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum } from "class-validator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";

export class PlatformLoginDto {
  @IsEmail({}, { message: "Invalid email address" })
  @IsNotEmpty({ message: "Email is required" })
  email: string;

  @IsString()
  @IsNotEmpty({ message: "Password is required" })
  @MinLength(6, { message: "Password must be at least 6 characters" })
  password: string;
}

export class PlatformMfaVerifyDto {
  @IsString()
  @IsNotEmpty({ message: "Challenge token is required" })
  challengeToken: string;

  @IsString()
  @IsNotEmpty({ message: "Verification code is required" })
  code: string;
}

export class PlatformMfaConfirmDto {
  @IsString()
  @IsNotEmpty({ message: "Temporary secret is required" })
  tempSecret: string;

  @IsString()
  @IsNotEmpty({ message: "6-digit verification code is required" })
  code: string;
}

export class PlatformMfaDisableDto {
  @IsString()
  @IsNotEmpty({ message: "Password is required to disable 2FA" })
  password: string;
}

export interface PlatformMfaSetupResponse {
  secret: string;
  otpAuthUri: string;
  qrCodeDataUrl: string;
}

export class PlatformRefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: "Refresh token is required" })
  refreshToken: string;
}

export class PlatformDevTokenQueryDto {
  @IsOptional()
  @IsEnum(PlatformStaffRole)
  role?: PlatformStaffRole;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  staffId?: string;
}

export interface PlatformStaffDto {
  id: string;
  email: string;
  name: string;
  role: PlatformStaffRole;
  createdAt?: string;
}

export interface PlatformLoginMfaSetupRequiredResponse {
  mfaSetupRequired: true;
  mfaRequired: false;
  setupToken: string;
  staff: PlatformStaffDto;
}

export interface PlatformLoginMfaRequiredResponse {
  mfaSetupRequired?: false;
  mfaRequired: true;
  mfaChallengeToken: string;
  staff: PlatformStaffDto;
}

export class PlatformChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  newPassword: string;
}

export interface PlatformLoginPasswordChangeRequiredResponse {
  mustChangePassword: true;
  mfaRequired: false;
  mfaSetupRequired: false;
  passwordChangeToken: string;
  staff: PlatformStaffDto;
}

export type PlatformLoginResponse =
  | PlatformLoginPasswordChangeRequiredResponse
  | PlatformLoginMfaSetupRequiredResponse
  | PlatformLoginMfaRequiredResponse;

export interface PlatformTokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: 'Bearer';
  expiresIn: number;
  staff: PlatformStaffDto;
}

