import { SetMetadata } from '@nestjs/common';
import { PlatformStaffRole } from '@cd-recruit/shared-types';

export const PLATFORM_ROLES_KEY = 'platform_roles';
export const Roles = (...roles: PlatformStaffRole[]) => SetMetadata(PLATFORM_ROLES_KEY, roles);
