import { Injectable, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>("app.jwtSecret") ?? "";
  }

  /**
   * Generates a JWT for a staff member (used for dev auth).
   */
  generateStaffToken(staffId: string, email: string, role: string): string {
    return this.jwtService.sign({
      sub: staffId,
      email,
      role,
    });
  }

  /**
   * Generates a signed token for a candidate invite.
   * Uses standard jsonwebtoken package to allow custom config or separate signing key later.
   */
  generateInviteToken(
    inviteId: string,
    candidateEmail: string,
    candidateName: string,
    roleTemplateId: string,
  ): string {
    const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
    return jwt.sign(
      {
        inviteId,
        candidateEmail,
        candidateName,
        roleTemplateId,
      },
      this.jwtSecret,
      {
        expiresIn: `${ttlHours}h`,
      },
    );
  }

  /**
   * Verifies and decodes an invite token.
   */
  verifyInviteToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (err) {
      throw new BadRequestException("INVITE_TOKEN_INVALID");
    }
  }
}
