import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { REQUIRE_MFA_KEY } from '../decorators/require-mfa.decorator';
import { PlatformJwtPayload, AuthenticatedPlatformStaff } from '../interfaces/platform-auth-payload.interface';

@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'PLATFORM_AUTH_REQUIRED',
        message: 'Platform authorization token is missing or malformed',
      });
    }

    const token = authHeader.split(' ')[1];
    let payload: PlatformJwtPayload;

    try {
      const secret =
        this.configService.get<string>('PLATFORM_JWT_SECRET') ||
        this.configService.get<string>('JWT_SECRET') ||
        'cd-recruit-platform-super-secret-key-2026';

      payload = this.jwtService.verify<PlatformJwtPayload>(token, { secret });
    } catch (err: any) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_PLATFORM_TOKEN',
        message: 'Invalid or expired platform token',
      });
    }

    if (!payload.isPlatformStaff || !payload.sub) {
      throw new ForbiddenException({
        statusCode: 403,
        errorCode: 'FORBIDDEN_PLATFORM_ACCESS',
        message: 'Supplied token does not possess platform operator identity',
      });
    }

    // Check staff in database to ensure active status
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: payload.sub },
    });

    if (!staff || (staff as any).isActive === false || (staff as any).status === 'DISABLED') {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'STAFF_ACCOUNT_DISABLED',
        message: 'Platform staff account is inactive or not found',
      });
    }

    // Check MFA requirements
    const requireMfa = this.reflector.getAllAndOverride<boolean>(REQUIRE_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((requireMfa !== false && staff.mfaEnabled) && !payload.mfaVerified) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'MFA_VERIFICATION_REQUIRED',
        message: 'Two-factor authentication verification is required for this operation',
      });
    }

    const authUser: AuthenticatedPlatformStaff = {
      id: staff.id,
      email: staff.email,
      fullName: (staff as any).name || (staff as any).fullName || 'Platform Staff',
      role: staff.role as any,
      mfaEnabled: staff.mfaEnabled,
      mfaVerified: payload.mfaVerified || false,
    };

    request.user = authUser;
    return true;
  }
}
