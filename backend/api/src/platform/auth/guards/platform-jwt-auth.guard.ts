import { Injectable, ExecutionContext, UnauthorizedException } from "@nestjs/common";
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
    return user;
  }
}
