import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { PlatformStaffRole } from '@cd-recruit/shared-types';

import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { PlatformRolesGuard } from './guards/platform-roles.guard';
import { TotpUtil } from './totp.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { MockBillingAccountService } from '../mocks/mock-billing-account.service';
import { MockTrialGrantService } from '../mocks/mock-trial-grant.service';

describe('Phase 1: Platform Foundation & Auth Specification Tests', () => {
  describe('TotpUtil (RFC 6238 TOTP Engine)', () => {
    it('should generate a valid 20-byte Base32 secret', () => {
      const secret = TotpUtil.generateSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThanOrEqual(32);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it('should generate and verify a valid 6-digit TOTP code', () => {
      const secret = TotpUtil.generateSecret();
      const code = TotpUtil.generateCode(secret);

      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);

      const isValid = TotpUtil.verifyCode(secret, code);
      expect(isValid).toBe(true);
    });

    it('should reject invalid or malformed TOTP codes', () => {
      const secret = TotpUtil.generateSecret();
      expect(TotpUtil.verifyCode(secret, '12345')).toBe(false);
      expect(TotpUtil.verifyCode(secret, 'abcdef')).toBe(false);
      expect(TotpUtil.verifyCode(secret, '000000')).toBe(false);
    });

    it('should respect time-drift window tolerances (+-30s)', () => {
      const secret = TotpUtil.generateSecret();
      const now = Date.now();
      const pastCode = TotpUtil.generateCode(secret, now - 30000);

      // Within 1 step window -> Valid
      expect(TotpUtil.verifyCode(secret, pastCode, 1, now)).toBe(true);

      // Outside window -> Invalid
      const farPastCode = TotpUtil.generateCode(secret, now - 120000);
      expect(TotpUtil.verifyCode(secret, farPastCode, 1, now)).toBe(false);
    });
  });

  describe('PlatformAuthService', () => {
    let service: PlatformAuthService;
    let prisma: any;
    let jwtService: JwtService;

    const mockStaff = {
      id: 'staff-uuid-1',
      email: 'owner@proctora.local',
      name: 'Ragul Arumugam',
      fullName: 'Ragul Arumugam',
      role: 'OWNER',
      isActive: true,
      status: 'ACTIVE',
      passwordHash: PlatformAuthService.hashPassword('SecretPassword123'),
      totpSecret: TotpUtil.generateSecret(),
      mfaEnabled: false,
      lastLoginAt: null,
    };

    beforeEach(async () => {
      prisma = {
        platformStaff: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PlatformAuthService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: JwtService,
            useValue: {
              sign: jest.fn().mockReturnValue('mock-jwt-token'),
              verify: jest.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('test-secret'),
            },
          },
        ],
      }).compile();

      service = module.get<PlatformAuthService>(PlatformAuthService);
      jwtService = module.get<JwtService>(JwtService);
    });

    it('should hash and verify passwords correctly with PBKDF2', () => {
      const password = 'StrongPassword!2026';
      const hash = PlatformAuthService.hashPassword(password);
      expect(hash).toContain(':');
      expect(PlatformAuthService.verifyPassword(password, hash)).toBe(true);
      expect(PlatformAuthService.verifyPassword('WrongPassword', hash)).toBe(false);
    });

    it('should log in active staff without MFA and return access token', async () => {
      prisma.platformStaff.findUnique.mockResolvedValue(mockStaff);
      prisma.platformStaff.update.mockResolvedValue(mockStaff);

      const result = await service.login({
        email: 'owner@proctora.local',
        password: 'SecretPassword123',
      });

      expect(result.requiresMfa).toBe(false);
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.staff.email).toBe('owner@proctora.local');
    });

    it('should issue temporary token if MFA is enabled', async () => {
      prisma.platformStaff.findUnique.mockResolvedValue({
        ...mockStaff,
        mfaEnabled: true,
      });

      const result = await service.login({
        email: 'owner@proctora.local',
        password: 'SecretPassword123',
      });

      expect(result.requiresMfa).toBe(true);
      expect(result.tempToken).toBe('mock-jwt-token');
      expect(result.accessToken).toBeUndefined();
    });

    it('should reject invalid passwords', async () => {
      prisma.platformStaff.findUnique.mockResolvedValue(mockStaff);

      await expect(
        service.login({
          email: 'owner@proctora.local',
          password: 'IncorrectPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('PlatformAuthGuard & PlatformRolesGuard', () => {
    let authGuard: PlatformAuthGuard;
    let rolesGuard: PlatformRolesGuard;
    let jwtService: any;
    let prisma: any;
    let reflector: any;

    beforeEach(() => {
      jwtService = {
        verify: jest.fn(),
      };
      prisma = {
        platformStaff: {
          findUnique: jest.fn(),
        },
      };
      reflector = {
        getAllAndOverride: jest.fn(),
      };

      authGuard = new PlatformAuthGuard(
        jwtService,
        { get: () => 'secret' } as any,
        prisma,
        reflector,
      );
      rolesGuard = new PlatformRolesGuard(reflector);
    });

    it('should allow valid platform operator token through PlatformAuthGuard', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'staff-1',
        email: 'support@proctora.local',
        role: PlatformStaffRole.SUPPORT,
        isPlatformStaff: true,
        mfaVerified: false,
      });

      prisma.platformStaff.findUnique.mockResolvedValue({
        id: 'staff-1',
        email: 'support@proctora.local',
        name: 'Support Staff',
        fullName: 'Support Staff',
        role: 'SUPPORT',
        isActive: true,
        status: 'ACTIVE',
        mfaEnabled: false,
      });

      reflector.getAllAndOverride.mockReturnValue(false);

      const request: any = { headers: { authorization: 'Bearer valid-token' } };
      const context: ExecutionContext = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      const canActivate = await authGuard.canActivate(context);
      expect(canActivate).toBe(true);
      expect(request.user).toBeDefined();
      expect(request.user.role).toBe(PlatformStaffRole.SUPPORT);
    });

    it('should reject non-platform token', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'candidate-1',
        isPlatformStaff: false, // Not platform staff
      });

      const request: any = { headers: { authorization: 'Bearer some-token' } };
      const context: ExecutionContext = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      await expect(authGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('PlatformRolesGuard should allow OWNER access to any route', () => {
      reflector.getAllAndOverride.mockReturnValue([PlatformStaffRole.FINANCE]);

      const request: any = {
        user: { id: 'staff-owner', role: PlatformStaffRole.OWNER },
      };
      const context: ExecutionContext = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('PlatformRolesGuard should forbid SUPPORT from accessing FINANCE-only routes', () => {
      reflector.getAllAndOverride.mockReturnValue([PlatformStaffRole.FINANCE]);

      const request: any = {
        user: { id: 'staff-support', role: PlatformStaffRole.SUPPORT },
      };
      const context: ExecutionContext = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Mock Adapters (Cross-Team Interfaces)', () => {
    it('MockBillingAccountService should produce compliant BillingAccountResultDto', async () => {
      const mockBilling = new MockBillingAccountService();
      const result = await mockBilling.createForOrganization('org-123', {
        accountName: 'Acme Test Corp',
        billingCountry: 'IN',
      });

      expect(result.organizationId).toBe('org-123');
      expect(result.currency).toBe('INR');
      expect(result.status).toBe('ACTIVE');

      const summary = await mockBilling.getAccountSummary('mock-acct-1');
      expect(summary.totalAvailableCredits).toBe(250);
      expect(summary.overdraftLimit).toBe(0);
      expect(summary.reconciliationStatus).toBe('PASSED');
    });

    it('MockTrialGrantService should grant exactly 25 credits with 30-day validity', async () => {
      const mockTrial = new MockTrialGrantService();
      const result = await mockTrial.grantTrial('mock-acct-1', 'acme.com');

      expect(result.creditsGranted).toBe(25);
      expect(result.validityDays).toBe(30);
      expect(result.status).toBe('ACTIVE');
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
