import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { GoneException } from "@app/common/exceptions/app.exceptions";

/**
 * Payload embedded inside an invite-token JWT.
 *
 * Invite tokens are self-contained — no InviteToken table in the DB.
 * The backend signs them with JWT_SECRET; validation is purely cryptographic.
 * Any field mutation requires re-issuing a new signed token.
 */
export interface InviteTokenPayload {
  /** Candidate's email address — used to findOrCreate the Candidate record. */
  email: string;
  /** Candidate's display name. */
  name: string;
  /** UUID of the RoleTemplate this session will use. */
  roleTemplateId: string;
  /**
   * CV (computer vision) mode to use.  Determined by whoever issues the token.
   * Accepted values: 'FULL' | 'REDUCED'.
   */
  cvMode: "FULL" | "REDUCED";
}

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * Verify an invite token.
   *
   * Throws UnauthorizedException on:
   *   - malformed token (not a valid JWT)
   *   - invalid signature
   *   - expired token (TTL enforced by JwtService)
   *   - missing required payload fields
   *
   * @throws UnauthorizedException with a code the controller maps to HTTP 401/410.
   */
  verifyInviteToken(token: string): InviteTokenPayload {
    let payload: InviteTokenPayload;

    try {
      payload = this.jwt.verify<InviteTokenPayload>(token);
    } catch (err: unknown) {
      const name = err instanceof Error ? (err as { name?: string }).name : "";
      if (name === "TokenExpiredError") {
        throw new GoneException({
          code: "INVITE_TOKEN_EXPIRED",
          message: "The invite token has expired.",
        });
      }
      throw new UnauthorizedException("INVITE_TOKEN_INVALID");
    }

    // Validate required fields are present in the payload
    if (
      !payload.email ||
      !payload.name ||
      !payload.roleTemplateId ||
      !payload.cvMode
    ) {
      throw new UnauthorizedException("INVITE_TOKEN_INVALID");
    }

    return payload;
  }

  /**
   * Sign a new invite token.
   * Used by admin/seeding tooling to issue tokens — not called in the candidate flow.
   */
  signInviteToken(payload: InviteTokenPayload): string {
    return this.jwt.sign(payload);
  }
}
