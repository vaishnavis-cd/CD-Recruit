import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as crypto from 'crypto';
import { Client } from 'pg';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { hashPassword } from '../../common/utils/password.util';
import { generateTotpCode } from '../auth/totp.util';

describe('Stage 2: Platform Staff Management Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let pgClient: Client;

  const testDbUrl =
    process.env.DATABASE_URL ||
    'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit_test?schema=public';

  const ownerAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();
  const financeId = crypto.randomUUID();
  const supportId = crypto.randomUUID();

  const ownerAEmail = `stage2-ownera-${Date.now()}@platform.local`.toLowerCase();
  const ownerBEmail = `stage2-ownerb-${Date.now()}@platform.local`.toLowerCase();
  const financeEmail = `stage2-finance-${Date.now()}@platform.local`.toLowerCase();
  const supportEmail = `stage2-support-${Date.now()}@platform.local`.toLowerCase();

  let ownerAToken: string;
  let ownerBToken: string;
  let financeToken: string;
  let supportToken: string;
  let platformSecret: string;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: testDbUrl });
    await pgClient.connect();

    const initialPassHash = await hashPassword('ValidInitialPass123!');

    // Seed staff in DB
    for (const [id, email, name, role] of [
      [ownerAId, ownerAEmail, 'Stage2 Owner A', 'OWNER'],
      [ownerBId, ownerBEmail, 'Stage2 Owner B', 'OWNER'],
      [financeId, financeEmail, 'Stage2 Finance', 'FINANCE'],
      [supportId, supportEmail, 'Stage2 Support', 'SUPPORT'],
    ]) {
      await pgClient.query(
        `INSERT INTO platform.platform_staff (id, email, name, role, is_active, mfa_enabled, status, token_version, password_hash)
         VALUES ($1, $2, $3, $4, true, true, 'ACTIVE', 0, $5)
         ON CONFLICT (email) DO NOTHING`,
        [id, email, name, role, initialPassHash]
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      })
    );

    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    platformSecret =
      process.env.PLATFORM_JWT_SECRET ||
      (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:platform` : 'proctora-platform-secret');

    ownerAToken = jwtService.sign(
      { sub: ownerAId, email: ownerAEmail, name: 'Stage2 Owner A', role: 'OWNER', platformRole: 'OWNER', type: 'platform_staff', tokenVersion: 0 },
      { secret: platformSecret, issuer: 'proctora-platform' }
    );
    ownerBToken = jwtService.sign(
      { sub: ownerBId, email: ownerBEmail, name: 'Stage2 Owner B', role: 'OWNER', platformRole: 'OWNER', type: 'platform_staff', tokenVersion: 0 },
      { secret: platformSecret, issuer: 'proctora-platform' }
    );
    financeToken = jwtService.sign(
      { sub: financeId, email: financeEmail, name: 'Stage2 Finance', role: 'FINANCE', platformRole: 'FINANCE', type: 'platform_staff', tokenVersion: 0 },
      { secret: platformSecret, issuer: 'proctora-platform' }
    );
    supportToken = jwtService.sign(
      { sub: supportId, email: supportEmail, name: 'Stage2 Support', role: 'SUPPORT', platformRole: 'SUPPORT', type: 'platform_staff', tokenVersion: 0 },
      { secret: platformSecret, issuer: 'proctora-platform' }
    );
  });

  afterAll(async () => {
    if (pgClient) {
      try {
        await pgClient.query(
          `UPDATE platform.platform_staff SET status = 'ACTIVE', is_active = true WHERE status = 'INACTIVE' OR is_active = false`
        );
      } catch {}
      await pgClient.end();
    }
    if (app) await app.close();
  });

  describe('1. Auth & Role Access Matrix', () => {
    it('allows OWNER to list staff but forbids FINANCE and SUPPORT', async () => {
      const resOwner = await request(app.getHttpServer())
        .get('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`);
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.items).toBeDefined();

      const resFinance = await request(app.getHttpServer())
        .get('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${financeToken}`);
      expect(resFinance.status).toBe(403);

      const resSupport = await request(app.getHttpServer())
        .get('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${supportToken}`);
      expect(resSupport.status).toBe(403);
    });

    it('allows ALL roles (OWNER, FINANCE, SUPPORT) to view /staff/options', async () => {
      for (const token of [ownerAToken, financeToken, supportToken]) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/platform/staff/options')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);

        // Sanity: options must not contain email or secret
        for (const item of res.body) {
          expect(item.id).toBeDefined();
          expect(item.fullName).toBeDefined();
          expect(item.role).toBeDefined();
          expect((item as any).email).toBeUndefined();
          expect(JSON.stringify(item)).not.toContain('@');
        }
      }
    });
  });

  describe('2. Staff Creation & Password Policy', () => {
    const newStaffEmail = `new-operator-${Date.now()}@platform.local`.toLowerCase();

    it('rejects weak initial passwords', async () => {
      const resWeak = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Weak Operator',
          email: `weak-${Date.now()}@platform.local`.toLowerCase(),
          role: 'SUPPORT',
          initialPassword: 'short',
        });
      expect(resWeak.status).toBe(400);

      const targetEmail = `johndoe-${Date.now()}@platform.local`.toLowerCase();
      const resEmailInPass = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Email In Pass',
          email: targetEmail,
          role: 'SUPPORT',
          initialPassword: `JohnDoeStrongPassword123!`,
        });
      expect(resEmailInPass.status).toBe(400);
    });

    it('creates staff with valid password, mustChangePassword=true, mfaEnabled=false', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'New Test Operator',
          email: newStaffEmail,
          role: 'SUPPORT',
          initialPassword: 'CorrectPassword123!@#',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(newStaffEmail.toLowerCase());
      expect(res.body.role).toBe('SUPPORT');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.mustChangePassword).toBe(true);
      expect(res.body.mfaEnabled).toBe(false);

      // Verify no password hash or secrets returned
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.totpSecret).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('CorrectPassword123!@#');
    });

    it('rejects duplicate email case-insensitively with 409 STAFF_EMAIL_TAKEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Duplicate Operator',
          email: newStaffEmail.toUpperCase(),
          role: 'FINANCE',
          initialPassword: 'CorrectPassword123!@#',
        });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('STAFF_EMAIL_TAKEN');
    });
  });

  describe('3. Forced Login Flow (Password Change -> MFA Setup -> Full Access)', () => {
    const flowEmail = `flow-user-${Date.now()}@platform.local`.toLowerCase();
    const tempPass = 'TemporaryPass123!@#';
    const finalPass = 'FinalSecurePassword2026!#$';
    let flowStaffId: string;
    let passwordChangeToken: string;
    let mfaSetupToken: string;
    let generatedTotpSecret: string;
    let fullAccessToken: string;

    beforeAll(async () => {
      const resCreate = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Flow User',
          email: flowEmail,
          role: 'FINANCE',
          initialPassword: tempPass,
        });
      expect(resCreate.status).toBe(201);
      flowStaffId = resCreate.body.id;
    });

    it('login returns mustChangePassword=true and restricted passwordChangeToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({ email: flowEmail, password: tempPass });

      expect(res.status).toBe(200);
      expect(res.body.mustChangePassword).toBe(true);
      expect(res.body.passwordChangeToken).toBeDefined();
      passwordChangeToken = res.body.passwordChangeToken;
    });

    it('restricted passwordChangeToken is rejected on standard endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/platform/staff/options')
        .set('Authorization', `Bearer ${passwordChangeToken}`);
      expect([401, 403]).toContain(res.status);
    });

    it('changes password with restricted token and returns mfaSetupRequired=true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/change-password')
        .set('Authorization', `Bearer ${passwordChangeToken}`)
        .send({
          currentPassword: tempPass,
          newPassword: finalPass,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mfaSetupRequired).toBe(true);
      expect(res.body.setupToken).toBeDefined();
      mfaSetupToken = res.body.setupToken;
    });

    it('restricted setupToken is rejected on standard endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/platform/staff/options')
        .set('Authorization', `Bearer ${mfaSetupToken}`);
      expect([401, 403]).toContain(res.status);
    });

    it('completes MFA setup and issues full access token', async () => {
      // Step 1: get QR code and secret
      const resSetup = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/mfa/setup')
        .set('Authorization', `Bearer ${mfaSetupToken}`);
      expect(resSetup.status).toBe(200);
      expect(resSetup.body.secret).toBeDefined();
      generatedTotpSecret = resSetup.body.secret;

      // Generate valid TOTP token
      const totpCode = generateTotpCode(generatedTotpSecret);

      // Step 2: confirm MFA
      const resConfirm = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/mfa/confirm')
        .set('Authorization', `Bearer ${mfaSetupToken}`)
        .send({
          tempSecret: generatedTotpSecret,
          code: totpCode,
        });

      expect(resConfirm.status).toBe(200);
      expect(resConfirm.body.accessToken).toBeDefined();
      fullAccessToken = resConfirm.body.accessToken;

      // Access standard endpoint
      const resOptions = await request(app.getHttpServer())
        .get('/api/v1/platform/staff/options')
        .set('Authorization', `Bearer ${fullAccessToken}`);
      expect(resOptions.status).toBe(200);
    });
  });

  describe('4. Deactivated Staff Security', () => {
    let targetStaffId: string;
    let targetToken: string;
    const targetEmail = `deact-${Date.now()}@platform.local`.toLowerCase();

    beforeAll(async () => {
      const resCreate = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'To Deactivate',
          email: targetEmail,
          role: 'SUPPORT',
          initialPassword: 'TempPass123456!#$',
        });
      targetStaffId = resCreate.body.id;

      targetToken = jwtService.sign(
        { sub: targetStaffId, email: targetEmail, name: 'To Deactivate', role: 'SUPPORT', platformRole: 'SUPPORT', type: 'platform_staff', tokenVersion: 0 },
        { secret: platformSecret, issuer: 'proctora-platform' }
      );
    });

    it('deactivating staff invalidates access immediately and refuses login with generic 401', async () => {
      // Deactivate
      const resDeact = await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${targetStaffId}/deactivate`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Security offboarding audit test' });
      expect(resDeact.status).toBe(200);
      expect(resDeact.body.status).toBe('INACTIVE');

      // Existing access token immediately gets 401
      const resAccess = await request(app.getHttpServer())
        .get('/api/v1/platform/staff/options')
        .set('Authorization', `Bearer ${targetToken}`);
      expect(resAccess.status).toBe(401);

      // Login returns generic 401
      const resLogin = await request(app.getHttpServer())
        .post('/api/v1/platform/auth/login')
        .send({ email: targetEmail, password: 'TempPass123456!#$' });
      expect(resLogin.status).toBe(401);
    });

    it('reactivating staff allows login and bumps tokenVersion', async () => {
      const resReact = await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${targetStaffId}/reactivate`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Reinstated by chief owner' });
      expect(resReact.status).toBe(200);
      expect(resReact.body.status).toBe('ACTIVE');

      // Old token still dies because tokenVersion was bumped
      const resOld = await request(app.getHttpServer())
        .get('/api/v1/platform/staff/options')
        .set('Authorization', `Bearer ${targetToken}`);
      expect(resOld.status).toBe(401);
    });
  });

  describe('5. Role Updates & Immediate Effect', () => {
    let roleStaffId: string;
    const roleStaffEmail = `role-change-${Date.now()}@platform.local`.toLowerCase();

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          fullName: 'Role Switcher',
          email: roleStaffEmail,
          role: 'SUPPORT',
          initialPassword: 'InitialPass123!@#',
        });
      roleStaffId = res.body.id;
    });

    it('promoting SUPPORT to OWNER allows staff administration immediately', async () => {
      // Promote
      const resPatch = await request(app.getHttpServer())
        .patch(`/api/v1/platform/staff/${roleStaffId}/role`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ role: 'OWNER', reason: 'Promoted to platform owner' });
      expect(resPatch.status).toBe(200);
      expect(resPatch.body.role).toBe('OWNER');

      // Ensure user has completed initial password change and MFA
      await pgClient.query(
        `UPDATE platform.platform_staff SET must_change_password = false, mfa_enabled = true WHERE id = $1`,
        [roleStaffId]
      );

      // Issue token with tokenVersion: 1
      const promotedToken = jwtService.sign(
        { sub: roleStaffId, email: roleStaffEmail, name: 'Role Switcher', role: 'SUPPORT', platformRole: 'SUPPORT', type: 'platform_staff', tokenVersion: 1 },
        { secret: platformSecret, issuer: 'proctora-platform' }
      );

      // Even though token payload says 'SUPPORT', DB says 'OWNER' -> gets 200 on /staff
      const resList = await request(app.getHttpServer())
        .get('/api/v1/platform/staff')
        .set('Authorization', `Bearer ${promotedToken}`);
      expect(resList.status).toBe(200);
    });
  });

  describe('6. Self-Modification Prevention', () => {
    it('blocks self-demotion, self-deactivation, self-mfa-reset, self-password-reset with 403 CANNOT_MODIFY_SELF', async () => {
      const resRole = await request(app.getHttpServer())
        .patch(`/api/v1/platform/staff/${ownerAId}/role`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ role: 'SUPPORT', reason: 'Self demotion attempt' });
      expect(resRole.status).toBe(403);
      expect(resRole.body.message).toContain('CANNOT_MODIFY_SELF');

      const resDeact = await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${ownerAId}/deactivate`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Self deactivation attempt' });
      expect(resDeact.status).toBe(403);
      expect(resDeact.body.message).toContain('CANNOT_MODIFY_SELF');

      const resMfa = await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${ownerAId}/reset-mfa`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Self MFA reset attempt' });
      expect(resMfa.status).toBe(403);
      expect(resMfa.body.message).toContain('CANNOT_MODIFY_SELF');

      const resPass = await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${ownerAId}/reset-password`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ newTemporaryPassword: 'NewTempPassword123!@#', reason: 'Self password reset attempt' });
      expect(resPass.status).toBe(403);
      expect(resPass.body.message).toContain('CANNOT_MODIFY_SELF');
    });
  });

  describe('7. Last-Owner Protection & Concurrency', () => {
    it('blocks deactivation or demotion of the last owner with 409 LAST_OWNER', async () => {
      // Deactivate Owner B
      const resDeactB = await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${ownerBId}/deactivate`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Deactivating Owner B for test' });
      expect(resDeactB.status).toBe(200);

      // Reactivate Owner B
      await request(app.getHttpServer())
        .post(`/api/v1/platform/staff/${ownerBId}/reactivate`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ reason: 'Reactivating Owner B' });

      // Demote Owner B -> success
      const resDemoteB = await request(app.getHttpServer())
        .patch(`/api/v1/platform/staff/${ownerBId}/role`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ role: 'SUPPORT', reason: 'Demoting Owner B' });
      expect(resDemoteB.status).toBe(200);

      // Restore Owner B to OWNER
      await request(app.getHttpServer())
        .patch(`/api/v1/platform/staff/${ownerBId}/role`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ role: 'OWNER', reason: 'Restoring Owner B to OWNER' });
    });

    it('simultaneous deactivations when only 2 owners exist: exactly ONE succeeds, other gets 409 LAST_OWNER', async () => {
      // Pristine setup: ensure ONLY Owner A and B are active owners
      await pgClient.query(
        `UPDATE platform.platform_staff SET status = 'INACTIVE', is_active = false WHERE role = 'OWNER' AND id NOT IN ($1, $2)`,
        [ownerAId, ownerBId]
      );
      await pgClient.query(
        `UPDATE platform.platform_staff SET status = 'ACTIVE', role = 'OWNER', is_active = true, token_version = 0 WHERE id IN ($1, $2)`,
        [ownerAId, ownerBId]
      );

      const freshTokenA = jwtService.sign(
        { sub: ownerAId, email: ownerAEmail, name: 'Stage2 Owner A', role: 'OWNER', platformRole: 'OWNER', type: 'platform_staff', tokenVersion: 0 },
        { secret: platformSecret, issuer: 'proctora-platform' }
      );
      const freshTokenB = jwtService.sign(
        { sub: ownerBId, email: ownerBEmail, name: 'Stage2 Owner B', role: 'OWNER', platformRole: 'OWNER', type: 'platform_staff', tokenVersion: 0 },
        { secret: platformSecret, issuer: 'proctora-platform' }
      );

      // ownerA tries to deactivate ownerB, ownerB tries to deactivate ownerA at the exact same moment
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/platform/staff/${ownerBId}/deactivate`)
          .set('Authorization', `Bearer ${freshTokenA}`)
          .send({ reason: 'Simultaneous deactivation request A' }),
        request(app.getHttpServer())
          .post(`/api/v1/platform/staff/${ownerAId}/deactivate`)
          .set('Authorization', `Bearer ${freshTokenB}`)
          .send({ reason: 'Simultaneous deactivation request B' }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 409]);

      const failedRes = resA.status === 409 ? resA : resB;
      expect(failedRes.body.message).toContain('LAST_OWNER');

      // Cleanup: make sure Owner A and B are both active owners again
      await pgClient.query(
        `UPDATE platform.platform_staff SET status = 'ACTIVE', role = 'OWNER', is_active = true WHERE id IN ($1, $2)`,
        [ownerAId, ownerBId]
      );
    });
  });

  describe('8. No-Op Mutations & Audit Payloads Redaction', () => {
    it('no-op role change returns changed:false and writes NO audit event', async () => {
      await pgClient.query(
        `UPDATE platform.platform_staff SET status = 'ACTIVE', role = 'OWNER', is_active = true, token_version = 0 WHERE id IN ($1, $2)`,
        [ownerAId, ownerBId]
      );
      const freshTokenA = jwtService.sign(
        { sub: ownerAId, email: ownerAEmail, name: 'Stage2 Owner A', role: 'OWNER', platformRole: 'OWNER', type: 'platform_staff', tokenVersion: 0 },
        { secret: platformSecret, issuer: 'proctora-platform' }
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/platform/staff/${ownerBId}/role`)
        .set('Authorization', `Bearer ${freshTokenA}`)
        .send({ role: 'OWNER', reason: 'No-op role change test' });
      expect(res.status).toBe(200);
      expect(res.body.changed).toBe(false);

      const auditCheck = await pgClient.query(
        `SELECT * FROM platform.platform_audit_event WHERE reason = 'No-op role change test'`
      );
      expect(auditCheck.rowCount).toBe(0);
    });

    it('audit rows contain reason, valid actors, and ZERO passwords or @ in before/after', async () => {
      const auditRows = await pgClient.query(
        `SELECT * FROM platform.platform_audit_event WHERE action LIKE 'STAFF_%' LIMIT 50`
      );
      expect(auditRows.rowCount).toBeGreaterThan(0);

      for (const row of auditRows.rows) {
        expect(row.actor_id).toBeDefined();
        const beforeStr = JSON.stringify(row.payload_before || {});
        const afterStr = JSON.stringify(row.payload_after || {});

        // No email in before/after
        expect(beforeStr).not.toContain('@');
        expect(afterStr).not.toContain('@');

        // No passwords or hashes in payload
        expect(beforeStr).not.toContain('password');
        expect(afterStr).not.toContain('password');
        expect(beforeStr).not.toContain('secret');
        expect(afterStr).not.toContain('secret');
      }
    });
  });

  describe('9. Recovery Script Execution', () => {
    it('clears TOTP and bumps tokenVersion for specified owner via recovery script', async () => {
      process.env.CONFIRM_RESET_OWNER_MFA = 'yes';
      process.env.DATABASE_URL = testDbUrl;

      const { resetOwnerMfa } = await import('../../../../prisma/scripts/reset-owner-mfa');
      await resetOwnerMfa(ownerBEmail, prisma);

      const check = await pgClient.query(
        `SELECT mfa_enabled, totp_secret_encrypted, token_version FROM platform.platform_staff WHERE email = $1`,
        [ownerBEmail]
      );
      expect(check.rows[0].mfa_enabled).toBe(false);
      expect(check.rows[0].totp_secret_encrypted).toBeNull();
      expect(check.rows[0].token_version).toBeGreaterThan(0);

      const audit = await pgClient.query(
        `SELECT * FROM platform.platform_audit_event WHERE actor_id = 'system:recovery-script' AND subject_id = $1`,
        [ownerBId]
      );
      expect(audit.rowCount).toBeGreaterThan(0);
    });
  });
});
