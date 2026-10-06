import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';
import { AuthenticatedPlatformStaff } from '../interfaces/platform-auth-payload.interface';

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

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedPlatformStaff;

    if (!user || !user.role) {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: 'UNAUTHORIZED_ROLE_CONTEXT',
        message: 'No platform role assigned to the authenticated user',
      });
    }

    // OWNER has universal platform superuser authorization
    if (user.role === PlatformStaffRole.OWNER) {
      return true;
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PLATFORM_PERMISSIONS',
        message: `This action requires one of the following roles: [${requiredRoles.join(', ')}]. Current role: ${user.role}`,
      });
    }

    return true;
  }
}
