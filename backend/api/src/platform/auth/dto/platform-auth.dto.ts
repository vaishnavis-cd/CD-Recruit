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

export interface PlatformLoginMfaRequiredResponse {
  mfaRequired: true;
  mfaChallengeToken: string;
  staff: PlatformStaffDto;
}

export interface PlatformLoginSuccessResponse {
  mfaRequired: false;
  accessToken: string;
  refreshToken?: string;
  tokenType: "Bearer";
  expiresIn: number;
  staff: PlatformStaffDto;
}

export type PlatformLoginResponse =
  | PlatformLoginMfaRequiredResponse
  | PlatformLoginSuccessResponse;

export interface PlatformTokenResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: "Bearer";
  expiresIn: number;
  staff: PlatformStaffDto;
}
