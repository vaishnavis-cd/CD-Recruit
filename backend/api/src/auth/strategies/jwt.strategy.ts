import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { StaffRole } from "@cd-recruit/shared-types";
import * as jwt from "jsonwebtoken";
import * as crypto from "crypto";

interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
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

  const urisToTry = Array.from(
    new Set([
      jwksUri,
      jwksUri.replace(":8080", ":8085"),
      jwksUri.replace(":8085", ":8080"),
      jwksUri.replace("localhost", "127.0.0.1"),
      jwksUri.replace("127.0.0.1", "localhost"),
      "http://localhost:8085/realms/cd-recruit/protocol/openid-connect/certs",
      "http://127.0.0.1:8085/realms/cd-recruit/protocol/openid-connect/certs",
      "http://localhost:8080/realms/cd-recruit/protocol/openid-connect/certs",
      "http://127.0.0.1:8080/realms/cd-recruit/protocol/openid-connect/certs",
    ]),
  );

  let lastError: any = null;
  for (const uri of urisToTry) {
    try {
      const res = await fetch(uri);
      if (res.ok) {
        const data = await res.json();
        if (data?.keys?.length > 0) {
          jwksCache = data.keys;
          jwksCacheTimestamp = now;
          return jwksCache;
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  return jwksCache;
}

function jwkToPem(jwk: any): string {
  if (jwk.x5c && jwk.x5c.length > 0) {
    const cert = jwk.x5c[0];
    return `-----BEGIN CERTIFICATE-----\n${cert.match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----`;
  }
  try {
    return crypto.createPublicKey({ key: jwk, format: "jwk" }).export({ type: "pkcs1", format: "pem" }).toString();
  } catch (err) {
    throw new Error(`Failed to convert JWK to PEM key: ${err}`);
  }
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
        const secret = configService.get<string>("app.jwtSecret") || process.env.JWT_SECRET || "changeme-use-a-long-random-string";

        try {
          const decoded = jwt.decode(rawJwtToken, { complete: true }) as any;
          if (decoded?.header?.kid) {
            const kid = decoded.header.kid;
            const keycloakUrl = process.env.KEYCLOAK_URL || "http://localhost:8080";
            const realm = process.env.KEYCLOAK_REALM || "cd-recruit";
            const jwksUri = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;

            const keys = await getJwksKeys(jwksUri);
            const signingKey = keys.find((key) => key.kid === kid);

            if (signingKey) {
              const pubKey = jwkToPem(signingKey);
              return done(null, pubKey);
            }
          }
        } catch (err) {
          // Fall through to local secret validation
        }

        return done(null, secret);
      },
    });
  }

  async validate(payload: JwtPayload) {
    const staffId = payload.sub;
    const email = payload.email || payload.preferred_username || `${staffId}@cdrecruit.local`;
    const displayName = payload.name || payload.preferred_username || email.split("@")[0].toUpperCase();

    let role = payload.role;
    if (payload.realm_access?.roles) {
      const roles = payload.realm_access.roles.map((r) => r.toUpperCase());
      if (roles.includes("ADMIN")) {
        role = StaffRole.ADMIN;
      } else if (roles.includes("RECRUITER")) {
        role = StaffRole.RECRUITER;
      }
    }

    if (!role) {
      role = StaffRole.RECRUITER;
    }

    // Check if staff exists in DB by ID or email.
    let staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      staff = await this.prisma.staff.findUnique({
        where: { email },
      });

      if (!staff) {
        staff = await this.prisma.staff.create({
          data: {
            id: staffId,
            email,
            name: displayName,
            role: (role as any) || (StaffRole.ADMIN as any),
            keycloakUserId: `keycloak-${staffId}`,
          },
        });
      }
    }

    if (staff && role && staff.role !== (role as any)) {
      staff = await this.prisma.staff.update({
        where: { id: staff.id },
        data: { role: role as any },
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

