import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  verifyPassword,
  hashPassword,
  hashToken,
  generateRefreshToken,
  validatePasswordPolicy,
} from "../../common/utils/password.util";
import {
  PlatformLoginDto,
  PlatformMfaVerifyDto,
  PlatformMfaConfirmDto,
  PlatformMfaSetupResponse,
  PlatformRefreshTokenDto,
  PlatformDevTokenQueryDto,
  PlatformLoginResponse,
  PlatformTokenResponse,
  PlatformStaffDto,
  PlatformChangePasswordDto,
} from "./dto/platform-auth.dto";
import {
  generateBase32Secret,
  verifyTotpCode,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
  encryptTotpSecret,
  decryptTotpSecret,
} from "./totp.util";
import { PlatformAuditService } from "../audit/platform-audit.service";

@Injectable()
export class PlatformAuthService {
  private readonly platformJwtSecret: string;
  private readonly mfaMasterKey: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PlatformAuditService))
    private readonly auditService: PlatformAuditService,
  ) {
    this.platformJwtSecret =
      this.configService?.get<string>("app.platformJwtSecret") ||
      process.env.PLATFORM_JWT_SECRET ||
      (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:platform` : "proctora-platform-secret");

    this.mfaMasterKey =
      this.configService?.get<string>("app.mfaMasterKey") ||
      process.env.MFA_MASTER_KEY ||
      this.platformJwtSecret;
  }

  /**
   * Generates a new TOTP secret & QR code data URI for staff enrollment.
   */
  async setupMfa(staffId: string, ipAddress?: string): Promise<PlatformMfaSetupResponse> {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: staffId },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("Platform staff account not found or disabled");
    }

    const secret = generateBase32Secret(32);
    const otpAuthUri = buildOtpAuthUri(staff.email, secret, "Proctora Platform");
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpAuthUri);

    this.auditService.record({
      actorId: staff.id,
      actorRole: staff.role,
      subjectType: "STAFF",
      subjectId: staff.id,
      action: "MFA_SETUP_STARTED",
      ipAddress,
      after: { email: staff.email },
    });

    return {
      secret,
      otpAuthUri,
      qrCodeDataUrl,
    };
  }

  /**
   * Confirms TOTP enrollment by verifying the first code before persisting to database.
   * Returns full access + refresh tokens upon successful enrollment.
   */
  async confirmMfa(
    staffId: string,
    dto: PlatformMfaConfirmDto,
    ipAddress?: string,
  ): Promise<PlatformTokenResponse> {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: staffId },
    });

    if (!staff || !staff.isActive) {
      throw new UnauthorizedException("Platform staff account not found or disabled");
    }

    const isValid = verifyTotpCode(dto.tempSecret, dto.code.trim());
    if (!isValid) {
      throw new UnauthorizedException("Invalid 6-digit verification code. Please try again.");
    }

    const encryptedSecret = encryptTotpSecret(dto.tempSecret, this.mfaMasterKey);

    const updatedStaff = await this.prisma.platformStaff.update({
      where: { id: staffId },
      data: {
        totpSecretEncrypted: encryptedSecret,
        mfaEnabled: true,
      },
    });

    this.auditService.record({
      actorId: staff.id,
      actorRole: staff.role,
      subjectType: "STAFF",
      subjectId: staff.id,
      action: "MFA_ENABLED",
      ipAddress,
      after: { email: staff.email, mfaEnabled: true },
    });

    return this.issuePlatformTokens(updatedStaff);
  }

  /**
   * MFA Verification Endpoint: Validates challenge token and verifies live TOTP code.
   */
  async verifyMfa(dto: PlatformMfaVerifyDto, ipAddress?: string): Promise<PlatformTokenResponse> {
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

    if (!staff.totpSecretEncrypted) {
      throw new UnauthorizedException(
        "MFA_ENROLLMENT_REQUIRED: TOTP secret is not yet configured for this platform account",
      );
    }

    const decryptedSecret = decryptTotpSecret(staff.totpSecretEncrypted, this.mfaMasterKey);
    const isValid = verifyTotpCode(decryptedSecret, dto.code.trim());

    if (!isValid) {
      this.auditService.record({
        actorId: staff.id,
        actorRole: staff.role,
        subjectType: "STAFF",
        subjectId: staff.id,
        action: "MFA_CHALLENGE_FAILED",
        ipAddress,
        executionResult: "FAILED",
        after: { email: staff.email },
      });
      throw new UnauthorizedException("Invalid or expired 6-digit TOTP code");
    }

    this.auditService.record({
      actorId: staff.id,
      actorRole: staff.role,
      subjectType: "STAFF",
      subjectId: staff.id,
      action: "LOGIN_SUCCESS",
      ipAddress,
      after: { email: staff.email, method: "TOTP_RFC6238" },
    });

    return this.issuePlatformTokens(staff);
  }

  /**
   * Platform Staff Login: Authenticates staff credentials against platform.platform_staff.
   * Respects MFA policy: Never issues full platform tokens directly.
   * - If mfa_enabled = true: returns mfaChallengeToken (5m expiry).
   * - If mfa_enabled = false: returns setupToken with mfaSetupRequired claim (15m expiry).
   */
  async login(dto: PlatformLoginDto, ipAddress?: string): Promise<PlatformLoginResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Look up strictly in platform.platform_staff (isolated from public.staff)
    const staff = await this.prisma.platformStaff.findUnique({
      where: { email: normalizedEmail },
    });

    if (!staff || !staff.passwordHash || staff.status === "INACTIVE" || !staff.isActive) {
      this.auditService.record({
        actorId: staff?.id || "unknown",
        actorRole: staff?.role || "UNKNOWN",
        subjectType: "STAFF",
        subjectId: normalizedEmail,
        action: "LOGIN_FAILED",
        ipAddress,
        executionResult: "FAILED",
        after: { attemptedEmail: normalizedEmail, reason: "INVALID_CREDENTIALS" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    const isValidPassword = await verifyPassword(dto.password, staff.passwordHash);
    if (!isValidPassword) {
      this.auditService.record({
        actorId: staff.id,
        actorRole: staff.role,
        subjectType: "STAFF",
        subjectId: staff.id,
        action: "LOGIN_FAILED",
        ipAddress,
        executionResult: "FAILED",
        after: { attemptedEmail: normalizedEmail, reason: "INVALID_PASSWORD" },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    const staffDto: PlatformStaffDto = {
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role as PlatformStaffRole,
      createdAt: staff.createdAt.toISOString(),
    };

    // Precedence 1: Force password change first if required
    if (staff.mustChangePassword) {
      const passwordChangeToken = this.jwtService.sign(
        {
          sub: staff.id,
          email: staff.email,
          name: staff.name,
          platformRole: staff.role,
          role: staff.role,
          tokenVersion: staff.tokenVersion,
          type: "platform_password_change",
          mustChangePassword: true,
        },
        {
          secret: this.platformJwtSecret,
          issuer: "proctora-platform",
          expiresIn: "15m",
        },
      );

      return {
        mustChangePassword: true,
        mfaRequired: false,
        mfaSetupRequired: false,
        passwordChangeToken,
        staff: staffDto,
      };
    }

    // Precedence 2: If MFA is not yet enabled, issue a restricted setup token
    if (!staff.mfaEnabled) {
      const setupToken = this.jwtService.sign(
        {
          sub: staff.id,
          email: staff.email,
          name: staff.name,
          platformRole: staff.role,
          role: staff.role,
          tokenVersion: staff.tokenVersion,
          type: "platform_mfa_setup",
          mfaSetupRequired: true,
        },
        {
          secret: this.platformJwtSecret,
          issuer: "proctora-platform",
          expiresIn: "15m",
        },
      );

      return {
        mfaSetupRequired: true,
        mfaRequired: false,
        setupToken,
        staff: staffDto,
      };
    }

    // Precedence 3: MFA challenge
    const mfaChallengeToken = this.jwtService.sign(
      {
        sub: staff.id,
        email: staff.email,
        platformRole: staff.role,
        tokenVersion: staff.tokenVersion,
        type: "platform_mfa_challenge",
      },
      {
        secret: this.platformJwtSecret,
        issuer: "proctora-platform",
        expiresIn: "5m",
      },
    );

    return {
      mfaSetupRequired: false,
      mfaRequired: true,
      mfaChallengeToken,
      staff: staffDto,
    };
  }

  /**
   * Change password endpoint with policy validation and session token invalidation.
   */
  async changePassword(
    staffId: string,
    dto: PlatformChangePasswordDto,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string; mfaSetupRequired?: boolean; setupToken?: string }> {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: staffId },
    });

    if (!staff || staff.status === "INACTIVE" || !staff.isActive) {
      throw new UnauthorizedException("Platform staff account not found or disabled");
    }

    if (!staff.passwordHash) {
      throw new UnauthorizedException("Staff account does not have a configured password");
    }

    const isValidCurrent = await verifyPassword(dto.currentPassword, staff.passwordHash);
    if (!isValidCurrent) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const policyResult = validatePasswordPolicy(dto.newPassword, staff.email, dto.currentPassword);
    if (!policyResult.valid) {
      throw new BadRequestException(policyResult.error || "Password does not meet security requirements");
    }

    const newHash = await hashPassword(dto.newPassword);

    const updatedStaff = await this.prisma.platformStaff.update({
      where: { id: staff.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });

    this.auditService.record({
      actorId: staff.id,
      actorRole: staff.role,
      subjectType: "STAFF",
      subjectId: staff.id,
      action: "PASSWORD_CHANGED",
      ipAddress,
      after: { email: staff.email, passwordChanged: true },
      reason: "Password change requested by staff member",
      executionResult: "SUCCESS",
    });

    if (!updatedStaff.mfaEnabled) {
      const setupToken = this.jwtService.sign(
        {
          sub: updatedStaff.id,
          email: updatedStaff.email,
          name: updatedStaff.name,
          platformRole: updatedStaff.role,
          role: updatedStaff.role,
          tokenVersion: updatedStaff.tokenVersion,
          type: "platform_mfa_setup",
          mfaSetupRequired: true,
        },
        {
          secret: this.platformJwtSecret,
          issuer: "proctora-platform",
          expiresIn: "15m",
        },
      );

      return {
        success: true,
        message: "Password changed successfully",
        mfaSetupRequired: true,
        setupToken,
      };
    }

    return {
      success: true,
      message: "Password changed successfully",
      mfaSetupRequired: false,
    };
  }

  /**
   * Refresh platform access token using stored refresh token hash.
   */
  async refresh(dto: PlatformRefreshTokenDto, ipAddress?: string): Promise<PlatformTokenResponse> {
    if (!dto.refreshToken || typeof dto.refreshToken !== "string") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const incomingHash = hashToken(dto.refreshToken);
    const staff = await this.prisma.platformStaff.findFirst({
      where: { refreshTokenHash: incomingHash },
    });

    if (!staff || staff.status === "INACTIVE" || !staff.isActive) {
      throw new UnauthorizedException("Invalid or revoked refresh token");
    }

    this.auditService.record({
      actorId: staff.id,
      actorRole: staff.role,
      subjectType: "STAFF",
      subjectId: staff.id,
      action: "TOKEN_REFRESH",
      ipAddress,
      after: { email: staff.email },
    });

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
        tokenVersion: staff.tokenVersion,
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
      data: {
        refreshTokenHash,
        lastLoginAt: new Date(),
      },
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
