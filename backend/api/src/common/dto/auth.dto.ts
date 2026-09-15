import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { StaffRole } from "@cd-recruit/shared-types";

export class StaffLoginDto {
  @IsEmail({}, { message: "A valid email address is required" })
  @IsNotEmpty({ message: "Email cannot be empty" })
  email: string;

  @IsString({ message: "Password must be a string" })
  @IsNotEmpty({ message: "Password cannot be empty" })
  @MinLength(1, { message: "Password cannot be empty" })
  password: string;
}

export class RefreshTokenDto {
  @IsString({ message: "Refresh token must be a string" })
  @IsNotEmpty({ message: "Refresh token cannot be empty" })
  refreshToken: string;
}

export class StaffLogoutDto {
  @IsOptional()
  @IsString({ message: "Refresh token must be a string" })
  refreshToken?: string;
}

export interface SanitizedStaffProfile {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  createdAt: string;
}

export interface StaffLoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  staff: SanitizedStaffProfile;
}

export interface StaffRefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}
