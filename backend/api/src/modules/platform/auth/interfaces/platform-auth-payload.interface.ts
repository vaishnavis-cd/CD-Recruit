import { PlatformStaffRole } from '@prisma/client';

export interface PlatformJwtPayload {
  sub: string;             // PlatformStaff UUID
  email: string;
  role: PlatformStaffRole;
  mfaVerified: boolean;
  isPlatformStaff: true;
  iat?: number;
  exp?: number;
}

export interface PlatformTempTokenPayload {
  sub: string;             // PlatformStaff UUID
  email: string;
  isTempMfaToken: true;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedPlatformStaff {
  id: string;
  email: string;
  fullName: string;
  role: PlatformStaffRole;
  mfaEnabled: boolean;
  mfaVerified: boolean;
}
