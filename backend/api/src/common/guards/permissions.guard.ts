import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission, StaffRole } from "@cd-recruit/shared-types";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { SettingsService } from "../../settings/settings.service";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private settingsService: SettingsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) {
      throw new ForbiddenException("NO_ROLE_ASSIGNED");
    }

    if (user.role === StaffRole.ADMIN) {
      return true;
    }

    const hasAllPermissions = requiredPermissions.every((perm) =>
      this.settingsService.hasPermission(user.role, perm),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException("INSUFFICIENT_PERMISSIONS");
    }

    return true;
  }
}
