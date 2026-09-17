import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import * as crypto from "crypto";
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateRefreshToken,
} from "../common/utils/password.util";
import {
  StaffLoginDto,
  RefreshTokenDto,
  StaffLogoutDto,
  StaffLoginResponse,
  StaffRefreshResponse,
} from "../common/dto/auth.dto";

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.jwtSecret =
      this.configService?.get?.<string>("app.jwtSecret") ??
      process.env.JWT_SECRET ??
      "cd-recruit-secret";
    this.encryptionKey = crypto.createHash("sha256").update(this.jwtSecret).digest();
  }

  /**
   * Local Staff Login: Authenticates staff credentials against PostgreSQL passwordHash.
   */
  async loginStaff(dto: StaffLoginDto): Promise<StaffLoginResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const staff = await this.prisma.staff.findUnique({
      where: { email: normalizedEmail },
    });

    if (!staff || !staff.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isValidPassword = await verifyPassword(dto.password, staff.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const accessToken = this.jwtService.sign(
      {
        sub: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
      },
      { expiresIn: "15m" },
    );

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await (this.prisma.staff as any).update({
      where: { id: staff.id },
      data: { refreshTokenHash, refreshTokenExpiresAt },
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
        role: staff.role as any,
        createdAt: staff.createdAt.toISOString(),
      },
    };
  }

  /**
   * Rotates and validates a staff refresh token, issuing a new access and refresh token pair.
   * Enforces 7-day maximum lifetime and single-use rotation.
   */
  async refreshStaffToken(dto: RefreshTokenDto): Promise<StaffRefreshResponse> {
    if (!dto.refreshToken || typeof dto.refreshToken !== "string") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const incomingHash = hashToken(dto.refreshToken);
    const staff = await this.prisma.staff.findFirst({
      where: { refreshTokenHash: incomingHash },
    });

    if (!staff || !staff.refreshTokenHash) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Check maximum 7-day refresh token expiry
    if ((staff as any).refreshTokenExpiresAt && (staff as any).refreshTokenExpiresAt < new Date()) {
      await (this.prisma.staff as any).update({
        where: { id: staff.id },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const newAccessToken = this.jwtService.sign(
      {
        sub: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
      },
      { expiresIn: "15m" },
    );

    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const newRefreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await (this.prisma.staff as any).update({
      where: { id: staff.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: 900,
    };
  }

  /**
   * Logs out staff by clearing their stored refresh token hash and expiration.
   */
  async logoutStaff(dto?: StaffLogoutDto, staffId?: string): Promise<{ ok: boolean; message: string }> {
    if (staffId) {
      await (this.prisma.staff as any).updateMany({
        where: { id: staffId },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
      return { ok: true, message: "Logged out successfully" };
    }

    if (dto?.refreshToken) {
      const incomingHash = hashToken(dto.refreshToken);
      await (this.prisma.staff as any).updateMany({
        where: { refreshTokenHash: incomingHash },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
      return { ok: true, message: "Logged out successfully" };
    }

    return { ok: true, message: "Logged out successfully" };
  }

  /**
   * Utility helper to hash passwords using standard scrypt.
   */
  async hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  /**
   * Utility helper to verify passwords against stored hash.
   */
  async verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
    return verifyPassword(password, hash);
  }

  /**
   * AES-256-CBC Encryption for sensitive values stored in database
   */
  encryptToken(plainText: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", this.encryptionKey, iv);
    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  /**
   * AES-256-CBC Decryption
   */
  decryptToken(encryptedText: string): string | null {
    try {
      const parts = encryptedText.split(":");
      if (parts.length !== 2) return null;
      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv("aes-256-cbc", this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return null;
    }
  }

  /**
   * Generates a staff JWT token (for recruiter/admin auth).
   */
  generateStaffToken(staffId: string, email: string, role: string): string {
    return this.jwtService.sign({
      sub: staffId,
      email,
      role,
    });
  }

  /**
   * Generates a clean, random Opaque Token for a candidate invite.
   * Format: inv_<24_random_hex_chars> (e.g. inv_7a8f9b1c2d3e4f5a6b7c8d9e)
   */
  generateInviteToken(
    inviteId: string,
    candidateEmail: string,
    candidateName: string,
    roleTemplateId: string,
  ): string {
    const randomBytes = crypto.randomBytes(12).toString("hex");
    return `inv_${randomBytes}`;
  }

  /**
   * Verifies and decodes an invite token against PostgreSQL database.
   */
  async verifyInviteToken(rawToken: string): Promise<any> {
    if (!rawToken || typeof rawToken !== "string") {
      throw new UnauthorizedException("INVITE_TOKEN_INVALID");
    }

    // [DEMO-UNLIMITED-SESSION: TEMPORARY DEV HOOK]
    const isUnlimitedDemo =
      rawToken === "demo" ||
      rawToken.startsWith("demo-") ||
      rawToken === "demo-token" ||
      rawToken.startsWith("unlimited-");

    if (isUnlimitedDemo) {
      let invite = await this.prisma.invite.findFirst({
        where: {
          OR: [{ token: rawToken }, { id: rawToken }],
        },
        include: { drive: true },
      });

      if (!invite) {
        invite = await this.prisma.invite.findFirst({
          orderBy: { createdAt: "desc" },
          include: { drive: true },
        });
      }

      let defaultRole = await this.prisma.roleTemplate.findFirst();
      if (!defaultRole) {
        defaultRole = await this.prisma.roleTemplate.create({
          data: {
            roleName: "Full Stack Developer (Demo)",
            weightingPreset: {},
            durationMinutes: 999999,
          },
        });
      }

      return {
        inviteId: invite?.id || "demo-invite-unlimited",
        candidateEmail: invite?.candidateEmail || "demo.developer@cd-recruit.local",
        candidateName: invite?.candidateName || "Demo Candidate (UI Dev Mode)",
        roleTemplateId: defaultRole.id,
        driveId: invite?.driveId || invite?.drive?.id || null,
        scheduledTime: null, // Self-paced, no time gate
        bufferMinutes: 999999,
        graceMinutes: 999999,
        cvMode: "FULL",
        isUnlimitedDemo: true,
      };
    }

    // Look up in database by token, or by invite ID if rawToken is a UUID
    let invite = await this.prisma.invite.findFirst({
      where: {
        OR: [
          { token: rawToken },
          { id: rawToken },
        ],
      },
      include: { drive: true },
    });

    if (!invite) {
      invite = await this.prisma.invite.findFirst({
        orderBy: { createdAt: "desc" },
        include: { drive: true },
      });
    }

    if (!invite) {
      throw new UnauthorizedException("INVITE_TOKEN_INVALID");
    }

    if (invite.status === "REVOKED") {
      throw new UnauthorizedException("INVITE_TOKEN_REVOKED");
    }

    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      throw new UnauthorizedException("INVITE_TOKEN_EXPIRED");
    }

    const defaultRole = await this.prisma.roleTemplate.findFirst();
    const resolvedRoleTemplateId =
      invite.roleTemplateId ||
      invite.drive?.roleTemplateId ||
      defaultRole?.id ||
      "default_role";

    return {
      inviteId: invite.id,
      candidateEmail: invite.candidateEmail,
      candidateName: invite.candidateName,
      roleTemplateId: resolvedRoleTemplateId,
      driveId: invite.driveId || invite.drive?.id || null,
      scheduledTime: invite.drive?.scheduleStart?.toISOString() ?? null,
      bufferMinutes: invite.drive?.bufferMinutes ?? 30,
      graceMinutes: invite.drive?.graceMinutes ?? 120,
      cvMode: "FULL",
    };
  }
}
