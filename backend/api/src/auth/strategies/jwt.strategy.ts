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
      jwksUri.includes("localhost") ? jwksUri.replace("localhost", "127.0.0.1") : jwksUri.replace("127.0.0.1", "localhost"),
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

        // Path 1: Local Staff Tokens (HS256)
        if (alg === "HS256") {
          const secret =
            configService.get<string>("app.jwtSecret") ||
            process.env.JWT_SECRET;

          if (!secret) {
            return done(new UnauthorizedException("JWT_SECRET_NOT_CONFIGURED"));
          }

          return done(null, secret);
        }

        // Path 2: Keycloak Tokens (RS256 with kid)
        if (alg === "RS256") {
          const kid = decoded.header.kid;
          if (!kid) {
            return done(new UnauthorizedException("MISSING_KEYCLOAK_KID"));
          }

          try {
            const keycloakUrl = process.env.KEYCLOAK_URL || "http://localhost:8080";
            const realm = process.env.KEYCLOAK_REALM || "cd-recruit";
            const jwksUri = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;

            const keys = await getJwksKeys(jwksUri);
            const signingKey = keys.find((key) => key.kid === kid);

            if (!signingKey) {
              return done(new UnauthorizedException(`KEYCLOAK_KEY_NOT_FOUND: ${kid}`));
            }

            const pubKey = jwkToPem(signingKey);
            return done(null, pubKey);
          } catch (err: any) {
            return done(new UnauthorizedException(`KEYCLOAK_JWKS_ERROR: ${err.message}`));
          }
        }

        // Path 3: Reject any unsupported algorithm (e.g. 'none', 'HS384', 'RS512')
        return done(new UnauthorizedException(`UNSUPPORTED_JWT_ALGORITHM: ${alg}`));
      },
    });
  }

  async validate(payload: JwtPayload) {
    const staffId = payload.sub;
    const isKeycloakToken = !!payload.realm_access?.roles;

    let role: StaffRole | undefined = payload.role;

    if (isKeycloakToken && payload.realm_access?.roles) {
      const roles = payload.realm_access.roles.map((r) => r.toUpperCase());
      if (roles.includes("ADMIN")) {
        role = StaffRole.ADMIN;
      } else if (roles.includes("HR_LEAD")) {
        role = StaffRole.HR_LEAD;
      } else if (roles.includes("HR_ASSOCIATE")) {
        role = StaffRole.HR_ASSOCIATE;
      } else if (roles.includes("REVIEWER")) {
        role = StaffRole.REVIEWER;
      } else if (roles.includes("RECRUITER")) {
        role = StaffRole.RECRUITER;
      }
    }

    if (!role) {
      role = StaffRole.RECRUITER;
    }

    // Step 1: Lookup Staff by ID
    let staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    // Step 2: Fallback lookup by email if not found by ID
    if (!staff && payload.email) {
      staff = await this.prisma.staff.findUnique({
        where: { email: payload.email.toLowerCase().trim() },
      });
    }

    // Step 3: Handle nonexistent staff
    if (!staff) {
      if (isKeycloakToken) {
        // Legacy Keycloak backward-compatibility: auto-provision Keycloak staff
        const email = payload.email || payload.preferred_username || `${staffId}@cdrecruit.local`;
        const displayName = payload.name || payload.preferred_username || email.split("@")[0].toUpperCase();

        staff = await this.prisma.staff.create({
          data: {
            id: staffId,
            email,
            name: displayName,
            role: (role || StaffRole.ADMIN) as any,
            keycloakUserId: `keycloak-${staffId}`,
          },
        });
      } else {
        // Local token: DO NOT auto-create staff! Reject unknown staff ID
        throw new UnauthorizedException("STAFF_NOT_FOUND");
      }
    }

    // Update role if changed
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

