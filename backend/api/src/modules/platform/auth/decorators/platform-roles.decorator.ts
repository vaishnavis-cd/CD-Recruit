import { SetMetadata } from '@nestjs/common';
import { PlatformStaffRole } from '@prisma/client';

export const PLATFORM_ROLES_KEY = 'platform_roles';
export const Roles = (...roles: PlatformStaffRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
