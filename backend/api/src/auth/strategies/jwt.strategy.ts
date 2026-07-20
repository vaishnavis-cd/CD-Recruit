import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { StaffRole } from "@cd-recruit/shared-types";
import * as jwt from "jsonwebtoken";

interface JwtPayload {
  sub: string;
  email: string;
  role?: StaffRole;
  realm_access?: {
    roles: string[];
  };
}

let jwksCache: any[] = [];
let jwksCacheTimestamp = 0;

async function getJwksKeys(jwksUri: string) {
  const now = Date.now();
  if (jwksCache.length > 0 && now - jwksCacheTimestamp < 300_000) {
    return jwksCache;
  }
  
  try {
    const res = await fetch(jwksUri);
    if (!res.ok) throw new Error(`Failed to fetch JWKS from ${jwksUri}`);
    const data = await res.json();
    jwksCache = data.keys || [];
    jwksCacheTimestamp = now;
    return jwksCache;
  } catch (err) {
    console.error("Error fetching JWKS keys:", err);
    return jwksCache;
  }
}

function jwkToPem(jwk: any) {
  if (jwk.x5c && jwk.x5c.length > 0) {
    const cert = jwk.x5c[0];
    return `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`;
  }
  throw new Error("No x5c found in JWK");
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
        const infraMode = process.env.INFRA_MODE ?? "local";
        if (infraMode === "local") {
          const secret = configService.get<string>("app.jwtSecret") || process.env.JWT_SECRET;
          return done(null, secret);
        }

        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true }) as any;
          if (!decoded || !decoded.header || !decoded.header.kid) {
            return done(new UnauthorizedException("Invalid token header"), null);
          }

          const kid = decoded.header.kid;
          const keycloakUrl = process.env.KEYCLOAK_URL || "http://localhost:8085";
          const realm = process.env.KEYCLOAK_REALM || "cd-recruit";
          const jwksUri = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;

          const keys = await getJwksKeys(jwksUri);
          const signingKey = keys.find((key) => key.kid === kid);

          if (!signingKey) {
            return done(new UnauthorizedException("Signing key not found in JWKS"), null);
          }

          const pubKey = jwkToPem(signingKey);
          done(null, pubKey);
        } catch (err) {
          done(err, null);
        }
      }
    });
  }

  async validate(payload: JwtPayload) {
    const staffId = payload.sub;
    const email = payload.email || "";

    let role = payload.role;
    if (payload.realm_access?.roles) {
      const roles = payload.realm_access.roles.map(r => r.toUpperCase());
      if (roles.includes("ADMIN")) {
        role = StaffRole.ADMIN;
      } else if (roles.includes("RECRUITER")) {
        role = StaffRole.RECRUITER;
      }
    }

    if (!role) {
      role = StaffRole.RECRUITER;
    }

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
            name: email.split("@")[0].toUpperCase() || "STAFF",
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
