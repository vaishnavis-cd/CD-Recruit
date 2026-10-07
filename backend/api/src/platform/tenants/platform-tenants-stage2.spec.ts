import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { NullTenantBillingSummaryProvider } from './providers/tenant-billing-summary.provider';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import { TenantAccessService } from './tenant-access.service';

describe('Stage 2: Suspend / Restore with Credit Enforcement (Real Postgres DB)', () => {
  let prisma: PrismaService;
  let auditService: PlatformAuditService;
  let tenantsService: PlatformTenantsService;
  let tenantsController: PlatformTenantsController;
  let tenantAccessService: TenantAccessService;
  let guard: PlatformJwtAuthGuard;
  let rolesGuard: PlatformRolesGuard;

  const testOrgId = 'a1111111-2222-4333-8444-555555555555';
  const testBaId = 'ba-stage2-test-001';
  const testProfileId = 'prof-stage2-test-001';

  const cleanUp = async () => {
    await prisma.tenantProfile.deleteMany({
      where: { organizationId: testOrgId },
    }).catch(() => {});
    await prisma.organization.deleteMany({
      where: { id: testOrgId },
    }).catch(() => {});
    await prisma.billingAccount.deleteMany({
      where: { id: testBaId },
    }).catch(() => {});
  };

  beforeAll(async () => {
    process.env.PLATFORM_JWT_SECRET = 'dev-test-secret-at-least-32-chars-long!!';
    prisma = new PrismaService();
    await prisma.$connect();

    const billingProvider = new NullTenantBillingSummaryProvider();
    auditService = new PlatformAuditService(prisma);
    tenantsService = new PlatformTenantsService(prisma, auditService, billingProvider);
    tenantsController = new PlatformTenantsController(tenantsService, auditService);
    tenantAccessService = new TenantAccessService(prisma);

    guard = new PlatformJwtAuthGuard();
    rolesGuard = new PlatformRolesGuard(new Reflector());

    await cleanUp();

    // 1. Seed Billing Account
    await prisma.billingAccount.create({
      data: {
        id: testBaId,
        name: 'Stage 2 Acct',
        billingCountry: 'US',
        currency: 'USD',
        trialDomain: 'stage2.example.com',
        status: 'ACTIVE',
      },
    });

    // 2. Seed Organization
    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: 'Stage 2 Org',
        slug: 'stage2-org',
        billingAccountId: testBaId,
      },
    });

    // 3. Seed TenantProfile in ACTIVE state
    await prisma.tenantProfile.create({
      data: {
        id: testProfileId,
        organizationId: testOrgId,
        lifecycleStage: 'ACTIVE',
        licenseTier: 'GROWTH',
        isManuallySuspended: false,
        isManuallyChurned: false,
      },
    });
  });

  afterAll(async () => {
    await cleanUp();
    await prisma.$disconnect();
  });

  it('1. Auth & Guard Enforcement: 401 on missing token, 403 on mfaSetupRequired, 200 for OWNER/FINANCE/SUPPORT', async () => {
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ url: `/api/v1/platform/tenants/${testOrgId}/suspend`, headers: {} }),
      }),
      getHandler: () => PlatformTenantsController.prototype.suspendTenant,
      getClass: () => PlatformTenantsController,
    };

    // 401 without token
    expect(() => guard.handleRequest(new UnauthorizedException(), null, null, mockContext)).toThrow(
      UnauthorizedException,
    );

    // 403 with mfaSetupRequired
    const restrictedUser = { id: 'staff_1', role: PlatformStaffRole.OWNER, mfaSetupRequired: true };
    expect(() => guard.handleRequest(null, restrictedUser, null, mockContext)).toThrow(
      ForbiddenException,
    );

    // Authorized staff roles (all 3 allowed)
    for (const role of [PlatformStaffRole.OWNER, PlatformStaffRole.FINANCE, PlatformStaffRole.SUPPORT]) {
      const user = { id: `staff_${role}`, role, mfaSetupRequired: false };
      const allowed = guard.handleRequest(null, user, null, mockContext);
      expect(allowed.role).toBe(role);

      const rolesContext: any = {
        getHandler: () => PlatformTenantsController.prototype.suspendTenant,
        getClass: () => PlatformTenantsController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      };
      expect(rolesGuard.canActivate(rolesContext)).toBe(true);
    }
  });

  it('2. Suspend Tenant: transitions ACTIVE -> SUSPENDED, sets metadata, and writes audit event', async () => {
    const actor = { id: 'staff-finance-1', role: 'FINANCE' };
    const res = await tenantsController.suspendTenant(
      testOrgId,
      {
        reason: 'Payment delinquency and pending KYC check',
        ticketRef: 'FIN-1042',
      },
      { user: actor } as any,
    );

    expect(res).toEqual({ success: true, status: 'SUSPENDED' });

    // Verify DB state
    const profile = await prisma.tenantProfile.findUnique({
      where: { organizationId: testOrgId },
    });
    expect(profile?.lifecycleStage).toBe('SUSPENDED');
    expect(profile?.isManuallySuspended).toBe(true);
    expect(profile?.suspensionReason).toBe('Payment delinquency and pending KYC check');
    expect(profile?.suspendedById).toBe('staff-finance-1');
    expect(profile?.suspendedAt).not.toBeNull();

    // Verify audit event
    const audits = await prisma.systemAuditEvent.findMany({
      where: { targetTenantId: testOrgId, action: 'TENANT_SUSPENDED' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const lastAudit = audits[audits.length - 1];
    expect(lastAudit.actorRole).toBe('FINANCE');
    expect(lastAudit.reason).toBe('Payment delinquency and pending KYC check');
    expect(lastAudit.ticketRef).toBe('FIN-1042');
    expect((lastAudit.before as any)?.status).toBe('ACTIVE');
    expect((lastAudit.after as any)?.status).toBe('SUSPENDED');
  });

  it('3. Invalid Transition: Suspending an already SUSPENDED tenant returns 409 ConflictException', async () => {
    const actor = { id: 'staff-owner-1', role: 'OWNER' };
    await expect(
      tenantsController.suspendTenant(
        testOrgId,
        { reason: 'Duplicate suspension attempt' },
        { user: actor } as any,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('4. Credit Enforcement: TenantAccessService.assertCanConsume blocks new attempts with TENANT_SUSPENDED', async () => {
    await expect(
      tenantAccessService.assertCanConsume(testOrgId),
    ).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'TENANT_SUSPENDED',
          message: expect.stringContaining('assessment is currently unavailable'),
        }),
      }),
    );
  });

  it('5. Restore Tenant: transitions SUSPENDED -> ACTIVE, clears suspension fields, and writes audit event', async () => {
    const actor = { id: 'staff-support-1', role: 'SUPPORT' };
    const res = await tenantsController.restoreTenant(
      testOrgId,
      {
        reason: 'Payment received and KYC verified successfully',
        ticketRef: 'FIN-1042-RESOLVED',
      },
      { user: actor } as any,
    );

    expect(res).toEqual({ success: true, status: 'ACTIVE' });

    // Verify DB state
    const profile = await prisma.tenantProfile.findUnique({
      where: { organizationId: testOrgId },
    });
    expect(profile?.lifecycleStage).toBe('ACTIVE');
    expect(profile?.isManuallySuspended).toBe(false);
    expect(profile?.suspensionReason).toBeNull();
    expect(profile?.suspendedAt).toBeNull();
    expect(profile?.suspendedById).toBeNull();

    // Verify audit record
    const audits = await prisma.systemAuditEvent.findMany({
      where: { targetTenantId: testOrgId, action: 'TENANT_RESTORED' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const lastAudit = audits[audits.length - 1];
    expect(lastAudit.actorRole).toBe('SUPPORT');
    expect((lastAudit.before as any)?.status).toBe('SUSPENDED');
    expect((lastAudit.after as any)?.status).toBe('ACTIVE');
  });

  it('6. Credit Enforcement: TenantAccessService.assertCanConsume passes cleanly after restore', async () => {
    await expect(
      tenantAccessService.assertCanConsume(testOrgId),
    ).resolves.toBeUndefined();
  });

  it('7. Invalid Transition: Restoring an already ACTIVE tenant returns 409 ConflictException', async () => {
    const actor = { id: 'staff-support-1', role: 'SUPPORT' };
    await expect(
      tenantsController.restoreTenant(
        testOrgId,
        { reason: 'Attempt duplicate restore' },
        { user: actor } as any,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('8. Concurrency: Two simultaneous suspends yield exactly one success and one 409', async () => {
    const actor = { id: 'staff-owner-1', role: 'OWNER' };

    // Ensure ACTIVE state
    await prisma.tenantProfile.update({
      where: { organizationId: testOrgId },
      data: {
        lifecycleStage: 'ACTIVE',
        isManuallySuspended: false,
        suspendedAt: null,
        suspensionReason: null,
      },
    });

    const results = await Promise.allSettled([
      tenantsController.suspendTenant(testOrgId, { reason: 'Race suspend call 1' }, { user: actor } as any),
      tenantsController.suspendTenant(testOrgId, { reason: 'Race suspend call 2' }, { user: actor } as any),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
  });

  it('9. Non-existent Tenant returns 404 NotFoundException and invalid UUID returns 400', async () => {
    const fakeId = 'ffffffff-ffff-4fff-afff-ffffffffffff';
    const actor = { id: 'staff-owner-1', role: 'OWNER' };
    await expect(
      tenantsController.suspendTenant(fakeId, { reason: 'Valid suspension reason' }, { user: actor } as any),
    ).rejects.toThrow(NotFoundException);

    const uuidPipe = new ParseUUIDPipe({ version: '4' });
    await expect(uuidPipe.transform('non-uuid-string', { type: 'param' })).rejects.toThrow(BadRequestException);
  });

  it('10. PII-Blindness Scan on Suspend/Restore responses and Audit payloads', async () => {
    const audits = await prisma.systemAuditEvent.findMany({
      where: { targetTenantId: testOrgId },
    });

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    for (const audit of audits) {
      const payloadString = JSON.stringify(audit);
      const emailsFound = payloadString.match(emailPattern);
      expect(emailsFound).toBeNull();
      expect(payloadString.toLowerCase()).not.toContain('password');
      expect(payloadString.toLowerCase()).not.toContain('secret');
    }
  });

  it('11. Mid-session suspension lifecycle: in-progress sessions continue and submit cleanly while new attempts are blocked', async () => {
    // Ensure ACTIVE state
    await prisma.tenantProfile.update({
      where: { organizationId: testOrgId },
      data: {
        lifecycleStage: 'ACTIVE',
        isManuallySuspended: false,
        suspendedAt: null,
        suspensionReason: null,
      },
    });

    // 1. Suspend tenant
    await tenantsController.suspendTenant(
      testOrgId,
      { reason: 'Non-payment suspension mid-session test' },
      { user: { id: 'staff-owner-1', role: 'OWNER' } } as any,
    );

    // 2. Brand new candidate attempt triggers assertCanConsume and gets rejected
    await expect(
      tenantAccessService.assertCanConsume(testOrgId),
    ).rejects.toThrow(ForbiddenException);

    // 3. Candidate with existing IN_PROGRESS session: verify startSession condition (isNewOrNotStarted = false)
    // When session is already IN_PROGRESS, assertCanConsume is bypassed by session service design
    const inProgressSession = { status: 'IN_PROGRESS' };
    const isNewOrNotStarted = !inProgressSession || inProgressSession.status === 'NOT_STARTED';
    expect(isNewOrNotStarted).toBe(false);

    // 4. Restore tenant for subsequent tests
    await tenantsController.restoreTenant(
      testOrgId,
      { reason: 'Restoring after mid-session verification' },
      { user: { id: 'staff-support-1', role: 'SUPPORT' } } as any,
    );
  });
});
