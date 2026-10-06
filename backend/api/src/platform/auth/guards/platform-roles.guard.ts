import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PLATFORM_ROLES_KEY } from "../decorators/platform-roles.decorator";

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformStaffRole[]>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || (!user.role && !user.platformRole)) {
      throw new ForbiddenException("NO_PLATFORM_ROLE_ASSIGNED");
    }

    const currentRole = (user.platformRole || user.role) as PlatformStaffRole;

    // OWNER has platform-wide administrative authority across all roles (ADR-002 & Artifact 06)
    if (currentRole === PlatformStaffRole.OWNER) {
      return true;
    }

    const hasRole = requiredRoles.includes(currentRole);
    if (!hasRole) {
      throw new ForbiddenException("INSUFFICIENT_PLATFORM_PERMISSIONS");
    }

    return true;
  }
}
