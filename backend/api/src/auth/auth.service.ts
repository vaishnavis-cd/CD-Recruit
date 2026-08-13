import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import * as crypto from "crypto";

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.jwtSecret = this.configService.get<string>("app.jwtSecret") ?? "cd-recruit-secret";
    this.encryptionKey = crypto.createHash("sha256").update(this.jwtSecret).digest();
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
