import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class PlatformJwtAuthGuard extends AuthGuard("platform-jwt") {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err) {
      throw err;
    }
    if (!user) {
      const message = info?.message || "UNAUTHORIZED_PLATFORM_ACCESS";
      throw new UnauthorizedException(message);
    }

    // Gated check: If token is a password change restricted token, only password change or logout is permitted
    if (user.tokenType === "platform_password_change" || user.mustChangePassword) {
      const request = context.switchToHttp().getRequest();
      const path = (request.url || request.path || "").toLowerCase();
      const isAllowed =
        path.includes("/auth/change-password") ||
        path.includes("/auth/logout");

      if (!isAllowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: "Forbidden",
          message: "PASSWORD_CHANGE_REQUIRED",
        });
      }
    }

    // Gated check: If token is an MFA setup restricted token, only MFA setup/confirm or logout is permitted
    if (user.mfaSetupRequired) {
      const request = context.switchToHttp().getRequest();
      const path = (request.url || request.path || "").toLowerCase();
      const isAllowed =
        path.includes("/auth/mfa/setup") ||
        path.includes("/auth/mfa/confirm") ||
        path.includes("/auth/logout");

      if (!isAllowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: "Forbidden",
          message: "MFA_SETUP_REQUIRED",
        });
      }
    }

    return user;
  }
}
