import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import * as jwt from "jsonwebtoken";

export interface PlatformJwtPayload {
  sub: string;
  email: string;
  name: string;
  platformRole: PlatformStaffRole;
  type: string;
  iss: string;
}

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, "platform-jwt") {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const platformSecret =
      configService.get<string>("app.platformJwtSecret") ||
      process.env.PLATFORM_JWT_SECRET ||
      (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:platform` : "proctora-platform-secret");

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (request, rawJwtToken, done) => {
        if (!rawJwtToken || typeof rawJwtToken !== "string") {
          return done(new UnauthorizedException("NO_TOKEN_PROVIDED"));
        }

        let decoded: any;
        try {
          decoded = jwt.decode(rawJwtToken, { complete: true });
        } catch {
          return done(new UnauthorizedException("MALFORMED_JWT"));
        }

        if (!decoded || !decoded.header || !decoded.header.alg) {
          return done(new UnauthorizedException("MALFORMED_JWT"));
        }

        if (decoded.header.alg !== "HS256") {
          return done(new UnauthorizedException(`UNSUPPORTED_JWT_ALGORITHM: ${decoded.header.alg}`));
        }

        return done(null, platformSecret);
      },
    });
  }

  async validate(payload: PlatformJwtPayload) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException("INVALID_TOKEN_PAYLOAD");
    }

    // Strict token type boundary: only fully authenticated platform tokens permitted
    if (payload.type !== "platform_staff") {
      throw new UnauthorizedException("INVALID_TOKEN_TYPE");
    }

    // Strict issuer boundary (ADR-002)
    if (payload.iss !== "proctora-platform") {
      throw new UnauthorizedException("INVALID_ISSUER");
    }

    // Verify platform role is one of the 3 approved platform roles
    if (!payload.platformRole || !Object.values(PlatformStaffRole).includes(payload.platformRole)) {
      throw new UnauthorizedException("INVALID_PLATFORM_ROLE");
    }

    // Lookup strictly in platform.platform_staff (NEVER in public.staff)
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: payload.sub },
    });

    if (!staff) {
      throw new UnauthorizedException("PLATFORM_STAFF_NOT_FOUND");
    }

    if (!staff.isActive) {
      throw new UnauthorizedException("PLATFORM_STAFF_INACTIVE");
    }

    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role as PlatformStaffRole,
      platformRole: staff.role as PlatformStaffRole,
      isPlatformStaff: true,
    };
  }
}
