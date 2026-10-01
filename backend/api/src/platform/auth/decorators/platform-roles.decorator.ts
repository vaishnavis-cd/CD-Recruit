import { SetMetadata } from "@nestjs/common";
import { PlatformStaffRole } from "@cd-recruit/shared-types";

export const PLATFORM_ROLES_KEY = "platform_roles";
export const PlatformRoles = (...roles: PlatformStaffRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);

export const PLATFORM_MUTATION_ROLES = [
  PlatformStaffRole.OWNER,
  PlatformStaffRole.FINANCE,
  PlatformStaffRole.SUPPORT,
];

export const PLATFORM_READ_ROLES = [
  PlatformStaffRole.OWNER,
  PlatformStaffRole.FINANCE,
  PlatformStaffRole.SUPPORT,
];

export const PLATFORM_STAFF_ADMIN_ROLES = [
  PlatformStaffRole.OWNER,
];

export const PLATFORM_AUDIT_VIEW_ROLES = [
  PlatformStaffRole.OWNER,
  PlatformStaffRole.FINANCE,
  PlatformStaffRole.SUPPORT,
];


