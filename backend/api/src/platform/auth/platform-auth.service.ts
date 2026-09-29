import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  verifyPassword,
  hashToken,
  generateRefreshToken,
} from "../../common/utils/password.util";
import {
  PlatformLoginDto,
  PlatformMfaVerifyDto,
  PlatformRefreshTokenDto,
  PlatformDevTokenQueryDto,
  PlatformLoginResponse,
  PlatformTokenResponse,
  PlatformStaffDto,
} from "./dto/platform-auth.dto";

@Injectable()
export class PlatformAuthService {
  private readonly platformJwtSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.platformJwtSecret =
      this.configService?.get<string>("app.platformJwtSecret") ||
      process.env.PLATFORM_JWT_SECRET ||
      (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:platform` : "proctora-platform-secret");
  }

  /**
   * Platform Staff Login: Authenticates staff credentials against platform.platform_staff.
   * Respects MFA policy: If mfa_enabled = true, returns a challenge token and does NOT issue
   * a full platform access token until MFA verification is satisfied.
   */
  async login(dto: PlatformLoginDto): Promise<PlatformLoginResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Look up strictly in platform.platform_staff (isolated from public.staff)
    const staff = await this.prisma.platformStaff.findUnique({
      where: { email: normalizedEmail },
    });

    if (!staff || !staff.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!staff.isActive) {
      throw new UnauthorizedException("Account is disabled");
    }

    const isValidPassword = await verifyPassword(dto.password, staff.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const staffDto: PlatformStaffDto = {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role as PlatformStaffRole,
      createdAt: staff.createdAt.toISOString(),
    };

    // MFA Boundary: If MFA is required, issue short-lived challenge token only
    if (staff.mfaEnabled) {
      const mfaChallengeToken = this.jwtService.sign(
        {
          sub: staff.id,
          email: staff.email,
          platformRole: staff.role,
          type: "platform_mfa_challenge",
        },
        {
          secret: this.platformJwtSecret,
          issuer: "proctora-platform",
          expiresIn: "5m",
        },
      );

      return {
        mfaRequired: true,
        mfaChallengeToken,
        staff: staffDto,
      };
    }

    // Direct token issuance when MFA is explicitly not enabled
    const tokens = await this.issuePlatformTokens(staff);
    return {
      mfaRequired: false,
      ...tokens,
    };
  }

  /**
   * MFA Verification Endpoint: Validates challenge token and verifies TOTP code.
   * Note: If TOTP secret is not yet enrolled (e.g. initial setup), returns a clear
   * error rather than silently bypassing MFA.
   */
  async verifyMfa(dto: PlatformMfaVerifyDto): Promise<PlatformTokenResponse> {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.challengeToken, {
        secret: this.platformJwtSecret,
      });
    } catch {
      throw new UnauthorizedException("INVALID_OR_EXPIRED_MFA_CHALLENGE");
    }

    if (payload.type !== "platform_mfa_challenge" || payload.iss !== "proctora-platform") {
      throw new UnauthorizedException("INVALID_CHALLENGE_TOKEN_TYPE");
    }

    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: payload.sub },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("PLATFORM_STAFF_INACTIVE");
    }

    // Extension point for TOTP verification
    if (!staff.totpSecretEncrypted) {
      throw new UnauthorizedException(
        "MFA_ENROLLMENT_REQUIRED: TOTP secret is not yet configured for this platform account",
      );
    }

    // When TOTP provider is enrolled, verify the code here
    // In this phase, without an external authenticator enrollment, fail safely
    throw new UnauthorizedException("MFA_VERIFICATION_FAILED: Invalid or expired code");
  }

  /**
   * Refresh platform access token using stored refresh token hash.
   */
  async refresh(dto: PlatformRefreshTokenDto): Promise<PlatformTokenResponse> {
    if (!dto.refreshToken || typeof dto.refreshToken !== "string") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const incomingHash = hashToken(dto.refreshToken);
    const staff = await this.prisma.platformStaff.findFirst({
      where: { refreshTokenHash: incomingHash },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("Invalid or revoked refresh token");
    }

    return this.issuePlatformTokens(staff);
  }

  /**
   * Issues standard Platform JWT tokens (access + refresh) strictly typed as platform_staff.
   */
  private async issuePlatformTokens(staff: any): Promise<PlatformTokenResponse> {
    const accessToken = this.jwtService.sign(
      {
        sub: staff.id,
        email: staff.email,
        name: staff.name,
        platformRole: staff.role,
        role: staff.role,
        type: "platform_staff",
      },
      {
        secret: this.platformJwtSecret,
        issuer: "proctora-platform",
        expiresIn: "15m",
      },
    );

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);

    await this.prisma.platformStaff.update({
      where: { id: staff.id },
      data: { refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: 900,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role as PlatformStaffRole,
        createdAt: staff.createdAt.toISOString(),
      },
    };
  }

  /**
   * Generates a fully signed Platform JWT token for a given identity.
   */
  generatePlatformToken(
    staffId: string,
    email: string,
    name: string,
    role: PlatformStaffRole,
  ): string {
    return this.jwtService.sign(
      {
        sub: staffId,
        email,
        name,
        platformRole: role,
        role,
        type: "platform_staff",
      },
      {
        secret: this.platformJwtSecret,
        issuer: "proctora-platform",
        expiresIn: "1h",
      },
    );
  }

  /**
   * Development Token Helper: Matches repository conventions (auth.controller.ts getDevToken).
   * Disabled in production.
   */
  async getDevToken(
    query: PlatformDevTokenQueryDto,
  ): Promise<{ token: string; staff: PlatformStaffDto }> {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("dev-token endpoint is disabled in production");
    }

    const email = query.email || "owner@cdrecruit.local";
    let staff = await this.prisma.platformStaff.findUnique({
      where: { email },
    });

    if (!staff) {
      // Fallback to first existing platform staff or query params
      staff = await this.prisma.platformStaff.findFirst();
    }

    const staffId = staff?.id || query.staffId || "dev-platform-owner-id";
    const staffEmail = staff?.email || email;
    const staffName = staff?.name || "Platform Owner";
    const staffRole = (query.role || staff?.role || PlatformStaffRole.OWNER) as PlatformStaffRole;

    const token = this.generatePlatformToken(staffId, staffEmail, staffName, staffRole);

    return {
      token,
      staff: {
        id: staffId,
        email: staffEmail,
        name: staffName,
        role: staffRole,
      },
    };
  }
}
