import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { StaffRole } from "@cd-recruit/shared-types";

interface JwtPayload {
  sub: string;
  email: string;
  role: StaffRole;
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
      secretOrKey: configService.get<string>("app.jwtSecret"),
    });
  }

  async validate(payload: JwtPayload) {
    const { sub: staffId, email, role } = payload;

    // Check if staff exists in DB. If not, auto-create a mock staff for development convenience.
    let staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      // Look up by email to avoid unique email constraint collision if id changed
      staff = await this.prisma.staff.findUnique({
        where: { email },
      });

      if (!staff) {
        staff = await this.prisma.staff.create({
          data: {
            id: staffId,
            email,
            name: email.split("@")[0].toUpperCase(),
            role: role || StaffRole.RECRUITER,
            keycloakUserId: `mock-keycloak-${staffId}`,
          },
        });
      }
    }

    return {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
    };
  }
}
