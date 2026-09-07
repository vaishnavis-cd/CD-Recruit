import { SetMetadata } from "@nestjs/common";
import { Permission } from "@cd-recruit/shared-types";

export const PERMISSIONS_KEY = "permissions";
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
