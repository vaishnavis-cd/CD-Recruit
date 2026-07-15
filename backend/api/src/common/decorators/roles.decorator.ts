import { SetMetadata } from "@nestjs/common";
import { StaffRole } from "@cd-recruit/shared-types";

export const ROLES_KEY = "roles";
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
