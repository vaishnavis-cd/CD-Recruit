import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { StaffRole } from "@cd-recruit/shared-types";
import * as jwt from "jsonwebtoken";

interface JwtPayload {
  sub: string;
  email?: string;
  name?: string;
  role?: StaffRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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
          return done(new UnauthorizedException("MALFORMED_JWT_HEADER"));
        }

        const alg = decoded.header.alg;

        // Strictly accept ONLY local HS256 Staff Tokens
        if (alg === "HS256") {
          const secret =
            configService.get<string>("app.jwtSecret") ||
            process.env.JWT_SECRET ||
            "cd-recruit-secret";

          return done(null, secret);
        }

        // Explicitly reject Keycloak RS256 and any other unsupported algorithms
        return done(new UnauthorizedException(`UNSUPPORTED_JWT_ALGORITHM: ${alg}`));
      },
    });
  }

  async validate(payload: JwtPayload) {
    const staffId = payload.sub;

    if (!staffId) {
      throw new UnauthorizedException("INVALID_TOKEN_PAYLOAD");
    }

    // Step 1: Lookup Staff in PostgreSQL by ID
    let staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    // Step 2: Fallback lookup by email if not found by ID
    if (!staff && payload.email) {
      staff = await this.prisma.staff.findUnique({
        where: { email: payload.email.toLowerCase().trim() },
      });
    }

    // Step 3: Reject unknown staff (no auto-provisioning)
    if (!staff) {
      throw new UnauthorizedException("STAFF_NOT_FOUND");
    }

    // Optional role synchronization from valid token payload
    if (payload.role && staff.role !== (payload.role as any)) {
      staff = await this.prisma.staff.update({
        where: { id: staff.id },
        data: { role: payload.role as any },
      });
    }

    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
    };
  }
}
