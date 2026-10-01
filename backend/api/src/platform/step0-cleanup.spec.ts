import assert from 'node:assert';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import { PlatformAuthService } from './auth/platform-auth.service';
import { PlatformAuditService } from './audit/platform-audit.service';
import { PlatformJwtAuthGuard } from './auth/guards/platform-jwt-auth.guard';
import { PlatformJwtStrategy } from './auth/strategies/platform-jwt.strategy';
import { hashPassword } from '../common/utils/password.util';
import { generateTotpCode } from './auth/totp.util';
import { sanitizeAuditData } from './audit/platform-audit.util';

export async function runStep0CleanupTests() {
  console.log('--- Starting Super Admin Step 0 Cleanup Verification ---');

  const testPlatformSecret = 'test-platform-jwt-secret-step0-clean';
  let recordedAudits: any[] = [];
  const pwdHash = await hashPassword('ProctoraOwner#2026');

  let staffTable = [
    {
      id: 'stf_owner_01',
      email: 'owner@proctora.local',
      name: 'Platform Owner',
      role: PlatformStaffRole.OWNER,
      passwordHash: pwdHash,
      mfaEnabled: false,
      totpSecretEncrypted: null,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: 'stf_mfa_active_02',
      email: 'active2fa@proctora.local',
      name: 'Active 2FA Staff',
      role: PlatformStaffRole.SUPPORT,
      passwordHash: pwdHash,
      mfaEnabled: true,
      totpSecretEncrypted: null,
      isActive: true,
      createdAt: new Date(),
    },
  ];

  const configService = {
    get: (key: string) => {
      if (key === 'app.platformJwtSecret') return testPlatformSecret;
      if (key === 'app.mfaMasterKey') return 'master-secret-key-for-tests-32char';
      return null;
    },
  } as any;

  const jwtService = new JwtService({
    secret: testPlatformSecret,
    signOptions: { expiresIn: '15m', issuer: 'proctora-platform' },
  });

  const mockPrisma: any = {
    platformStaff: {
      findUnique: async ({ where }: any) => {
        if (where.id) return staffTable.find((s) => s.id === where.id) || null;
        if (where.email) return staffTable.find((s) => s.email === where.email) || null;
        return null;
      },
      update: async ({ where, data }: any) => {
        const idx = staffTable.findIndex((s) => s.id === where.id);
        if (idx >= 0) {
          staffTable[idx] = { ...staffTable[idx], ...data };
          return staffTable[idx];
        }
        return null;
      },
    },
    systemAuditEvent: {
      create: async ({ data }: any) => {
        recordedAudits.push(data);
        return { id: `aud_${Date.now()}`, timestamp: new Date(), ...data };
      },
    },
  };

  const auditService = new PlatformAuditService(mockPrisma);
  const authService = new PlatformAuthService(jwtService, configService, mockPrisma, auditService);
  const guard = new PlatformJwtAuthGuard();
  const strategy = new PlatformJwtStrategy(configService, mockPrisma);

  // Test 1: Login without MFA -> restricted token; calling GET /platform/tenants returns 403 MFA_SETUP_REQUIRED
  console.log('Testing 1: Login without MFA returns setupToken and blocks protected routes...');
  const loginRes = await authService.login({
    email: 'owner@proctora.local',
    password: 'ProctoraOwner#2026',
  });

  assert.strictEqual(loginRes.mfaSetupRequired, true, 'mfaSetupRequired must be true');
  assert.strictEqual(loginRes.mfaRequired, false, 'mfaRequired must be false');
  assert.ok('setupToken' in loginRes, 'setupToken must be present in response');

  const setupToken = (loginRes as any).setupToken;
  const decoded: any = jwtService.verify(setupToken, { secret: testPlatformSecret });
  const user = await strategy.validate(decoded);

  assert.strictEqual(user.mfaSetupRequired, true, 'User payload must have mfaSetupRequired: true');

  const protectedContext: any = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/v1/platform/tenants' }),
    }),
  };

  let caught403 = false;
  try {
    guard.handleRequest(null, user, null, protectedContext);
  } catch (err: any) {
    caught403 = true;
    assert.strictEqual(err.response?.message || err.message, 'MFA_SETUP_REQUIRED');
  }
  assert.ok(caught403, 'Expected 403 Forbidden with MFA_SETUP_REQUIRED');

  // MFA setup endpoint must be allowed
  const setupContext: any = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/v1/platform/auth/mfa/setup' }),
    }),
  };
  const setupAllowed = guard.handleRequest(null, user, null, setupContext);
  assert.strictEqual(setupAllowed.id, 'stf_owner_01');
  console.log('✓ Test 1 Passed: Login without MFA gives restricted token, blocks platform routes with 403 MFA_SETUP_REQUIRED');

  // Test 2: After MFA confirm -> full tokens; calling GET /platform/tenants no longer returns 403
  console.log('Testing 2: MFA confirm returns full tokens and permits platform routes...');
  const setupRes = await authService.setupMfa('stf_owner_01');
  const validCode = generateTotpCode(setupRes.secret);

  const confirmRes = await authService.confirmMfa('stf_owner_01', {
    tempSecret: setupRes.secret,
    code: validCode,
  });

  assert.ok(confirmRes.accessToken, 'Access token must be returned upon MFA confirmation');
  assert.strictEqual(confirmRes.tokenType, 'Bearer');

  const decodedFull: any = jwtService.verify(confirmRes.accessToken, { secret: testPlatformSecret });
  const fullUser = await strategy.validate(decodedFull);
  assert.strictEqual(fullUser.mfaSetupRequired, false, 'mfaSetupRequired must be false on full user');

  const fullAllowed = guard.handleRequest(null, fullUser, null, protectedContext);
  assert.strictEqual(fullAllowed.id, 'stf_owner_01');
  console.log('✓ Test 2 Passed: After MFA confirm, full tokens issued and protected platform routes are accessible');

  // Test 3: Wrong password -> writes LOGIN_FAILED audit row and returns 401
  console.log('Testing 3: Wrong password returns 401 and logs LOGIN_FAILED without password...');
  let caught401 = false;
  try {
    await authService.login({
      email: 'owner@proctora.local',
      password: 'IncorrectPassword123!',
    });
  } catch (err: any) {
    caught401 = true;
    assert.ok(err instanceof UnauthorizedException, 'Must throw UnauthorizedException');
  }
  assert.ok(caught401, 'Expected 401 Unauthorized');

  const loginFailedAudit = recordedAudits.find((a) => a.action === 'LOGIN_FAILED');
  assert.ok(loginFailedAudit, 'LOGIN_FAILED audit event must be recorded');
  assert.strictEqual(loginFailedAudit.executionResult, 'FAILED');
  assert.strictEqual(loginFailedAudit.after.attemptedEmail, 'owner@proctora.local');
  assert.ok(!JSON.stringify(loginFailedAudit).includes('IncorrectPassword123!'), 'Plaintext password must never be recorded in audit');
  console.log('✓ Test 3 Passed: Failed login attempts recorded in audit with email logged and password omitted');

  // Test 4: AuditService.record with a forced DB error does not throw
  console.log('Testing 4: AuditService.record handles DB errors gracefully...');
  const errorPrisma: any = {
    systemAuditEvent: {
      create: async () => {
        throw new Error('PostgreSQL Connection Severed [08006]');
      },
    },
  };
  const failingAuditService = new PlatformAuditService(errorPrisma);

  await failingAuditService.record({
    actorId: 'stf_owner_01',
    actorRole: 'OWNER',
    subjectType: 'STAFF',
    subjectId: 'stf_owner_01',
    action: 'TEST_UNHANDLED_EVENT',
  });
  console.log('✓ Test 4 Passed: AuditService.record does not throw on DB errors');

  // Test 5: Sensitive keys are redacted in stored before / after snapshots
  console.log('Testing 5: Sensitive keys are redacted in sanitizeAuditData...');
  const rawPayload = {
    email: 'staff@proctora.local',
    password: 'PlaintextSuperSecretPassword#2026',
    passwordHash: 'scrypt$1234$abcdef',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    refreshToken: 'raw_refresh_token_jwt_123',
    accessToken: 'bearer_token_xyz',
    safeKey: 'Safe metadata value',
  };

  const sanitized = sanitizeAuditData(rawPayload);
  assert.strictEqual(sanitized.password, '[REDACTED]');
  assert.strictEqual(sanitized.passwordHash, '[REDACTED]');
  assert.strictEqual(sanitized.totpSecret, '[REDACTED]');
  assert.strictEqual(sanitized.refreshToken, '[REDACTED]');
  assert.strictEqual(sanitized.accessToken, '[REDACTED]');
  assert.strictEqual(sanitized.safeKey, 'Safe metadata value');
  assert.strictEqual(sanitized.email, 'staff@proctora.local');
  console.log('✓ Test 5 Passed: All secrets/tokens properly redacted in audit snapshots');

  console.log('=== All 5 Verification Tests Passed Successfully ===');
}

describe('Super Admin Step 0 Cleanup Verification', () => {
  it('executes all 5 verification assertions cleanly', async () => {
    await runStep0CleanupTests();
  });
});

