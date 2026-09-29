import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TotpUtil } from './totp.util';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { VerifyMfaDto, ConfirmMfaDto } from './dto/verify-mfa.dto';
import {
  PlatformJwtPayload,
  PlatformTempTokenPayload,
  AuthenticatedPlatformStaff,
} from './interfaces/platform-auth-payload.interface';

@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private getJwtSecret(): string {
    return (
      this.configService.get<string>('PLATFORM_JWT_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'cd-recruit-platform-super-secret-key-2026'
    );
  }

  /**
   * Hashes a password using PBKDF2 with SHA-512
   */
  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
      .toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verifies a plain password against a stored PBKDF2 hash
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) {
      return false;
    }
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
      .toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(originalHash, 'hex'),
    );
  }

  /**
   * Primary staff login flow
   */
  async login(dto: PlatformLoginDto, clientIp = '127.0.0.1') {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!staff || (staff as any).isActive === false || (staff as any).status === 'DISABLED' || !staff.passwordHash) {
      this.logger.warn(`Failed login attempt for email: ${dto.email} from IP: ${clientIp}`);
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = PlatformAuthService.verifyPassword(
      dto.password,
      staff.passwordHash,
    );

    if (!isPasswordValid) {
      this.logger.warn(`Invalid password for staff ID: ${staff.id} from IP: ${clientIp}`);
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // If MFA is enabled on account, issue a 5-minute temporary token
    if (staff.mfaEnabled) {
      const tempPayload: PlatformTempTokenPayload = {
        sub: staff.id,
        email: staff.email,
        isTempMfaToken: true,
      };

      const tempToken = this.jwtService.sign(tempPayload, {
        secret: this.getJwtSecret(),
        expiresIn: '5m',
      });

      return {
        requiresMfa: true,
        tempToken,
        staff: {
          id: staff.id,
          email: staff.email,
          fullName: (staff as any).name || (staff as any).fullName || 'Platform Staff',
          role: staff.role as any,
        },
      };
    }

    const accessToken = this.generateAccessToken(staff, false);

    return {
      requiresMfa: false,
      accessToken,
      expiresIn: 28800, // 8 hours
      staff: {
        id: staff.id,
        email: staff.email,
        fullName: (staff as any).name || (staff as any).fullName || 'Platform Staff',
        role: staff.role as any,
      },
    };
  }

  /**
   * Verifies TOTP code with temporary token to complete MFA login
   */
  async verifyMfa(dto: VerifyMfaDto, clientIp = '127.0.0.1') {
    let payload: PlatformTempTokenPayload;

    try {
      payload = this.jwtService.verify<PlatformTempTokenPayload>(dto.tempToken, {
        secret: this.getJwtSecret(),
      });
    } catch (err: any) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'EXPIRED_MFA_TOKEN',
        message: 'MFA session has expired. Please log in again.',
      });
    }

    if (!payload.isTempMfaToken || !payload.sub) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'INVALID_MFA_TOKEN',
        message: 'Invalid temporary MFA token',
      });
    }

    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: payload.sub },
    });

    const totpSecret = staff.totpSecretEncrypted;
    if (!staff || !staff.isActive || !totpSecret) {
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'STAFF_NOT_FOUND',
        message: 'Staff account inactive or missing TOTP secret',
      });
    }

    const isValidOtp = TotpUtil.verifyCode(totpSecret, dto.totpCode);
    if (!isValidOtp) {
      this.logger.warn(`Invalid TOTP code supplied for staff: ${staff.id} from IP: ${clientIp}`);
      throw new UnauthorizedException({
        statusCode: 401,
        errorCode: 'INVALID_TOTP_CODE',
        message: 'The 6-digit authenticator code is incorrect or expired',
      });
    }

    const accessToken = this.generateAccessToken(staff, true);

    return {
      accessToken,
      expiresIn: 28800, // 8 hours
      staff: {
        id: staff.id,
        email: staff.email,
        fullName: (staff as any).name || (staff as any).fullName || 'Platform Staff',
        role: staff.role as any,
        mfaEnabled: true,
      },
    };
  }

  /**
   * Generates a new TOTP setup secret and QR code URI
   */
  async setupMfa(staffId: string) {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      throw new UnauthorizedException('Staff account not found');
    }

    const secret = TotpUtil.generateSecret();
    const otpauthUrl = TotpUtil.generateOtpauthUrl(staff.email, secret);

    // Save secret in pending state
    await this.prisma.platformStaff.update({
      where: { id: staffId },
      data: { totpSecretEncrypted: secret },
    });

    return {
      secret,
      otpauthUrl,
      instructions: 'Scan this URI with your Google Authenticator or 1Password app and confirm with a 6-digit code.',
    };
  }

  /**
   * Confirms TOTP setup and locks MFA as enabled
   */
  async confirmMfa(staffId: string, dto: ConfirmMfaDto) {
    const staff = await this.prisma.platformStaff.findUnique({
      where: { id: staffId },
    });

    const totpSecret = staff?.totpSecretEncrypted;
    if (!staff || !totpSecret) {
      throw new BadRequestException('MFA setup has not been initiated for this account');
    }

    const isValid = TotpUtil.verifyCode(totpSecret, dto.totpCode);
    if (!isValid) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'INVALID_CONFIRMATION_CODE',
        message: 'Verification code failed. Please ensure your device clock is synchronized.',
      });
    }

    await this.prisma.platformStaff.update({
      where: { id: staffId },
      data: { mfaEnabled: true },
    });

    return {
      success: true,
      message: 'Two-factor authentication successfully enabled for this account.',
    };
  }

  private generateAccessToken(staff: any, mfaVerified: boolean): string {
    const payload: PlatformJwtPayload = {
      sub: staff.id,
      email: staff.email,
      role: staff.role,
      mfaVerified,
      isPlatformStaff: true,
    };

    return this.jwtService.sign(payload, {
      secret: this.getJwtSecret(),
      expiresIn: '8h',
    });
  }
}
