import { UnauthorizedException, ForbiddenException, NotFoundException, BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PlatformStaffRole, CvMode, SessionStatus } from '@cd-recruit/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { NullTenantBillingSummaryProvider } from './providers/tenant-billing-summary.provider';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import {
  PlatformTenantStatusFilter,
  PlatformTenantLicenseTier,
} from './dto/platform-tenants.dto';

describe('Stage 1: Real Postgres DB Integration - Tenant Detail, Brief, Audit, and List', () => {
  let prisma: PrismaService;
  let auditService: PlatformAuditService;
  let tenantsService: PlatformTenantsService;
  let tenantsController: PlatformTenantsController;
  let guard: PlatformJwtAuthGuard;
  let rolesGuard: PlatformRolesGuard;
  let jwtService: JwtService;

  const testTenantId1 = '11111111-1111-4111-a111-111111111111';
  const testTenantId2 = '22222222-2222-4222-a222-222222222222';
  const testTenantIdNoProfile = '33333333-3333-4333-a333-333333333333';
  const otherTenantId = '99999999-9999-4999-a999-999999999999';

  const billingAcctId1 = 'ba-test-stage1-001';
  const billingAcctId2 = 'ba-test-stage1-002';
  const billingAcctId3 = 'ba-test-stage1-003';
  const billingAcctIdOther = 'ba-test-stage1-009';

  const staffOwnerId = 'stf-owner-stage1';
  const staffFinanceId = 'stf-finance-stage1';
  const staffSupportId = 'stf-support-stage1';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const billingProvider = new NullTenantBillingSummaryProvider();
    auditService = new PlatformAuditService(prisma);
    tenantsService = new PlatformTenantsService(prisma, auditService, billingProvider);
    tenantsController = new PlatformTenantsController(tenantsService, auditService);

    guard = new PlatformJwtAuthGuard();
    rolesGuard = new PlatformRolesGuard(new Reflector());
    jwtService = new JwtService({ secret: 'stage1-test-secret' });

    // Clean up test records
    await cleanupTestData();

    // 1. Seed Billing Accounts
    await prisma.billingAccount.createMany({
      data: [
        {
          id: billingAcctId1,
          name: 'Stage1 Acme Payer',
          billingCountry: 'IN',
          currency: 'INR',
          trialDomain: 'acme-stage1.corp',
          status: 'ACTIVE',
        },
        {
          id: billingAcctId2,
          name: 'Stage1 Beta Payer',
          billingCountry: 'US',
          currency: 'USD',
          trialDomain: 'beta-stage1.io',
          status: 'ACTIVE',
        },
        {
          id: billingAcctId3,
          name: 'Stage1 NoProfile Payer',
          billingCountry: 'IN',
          currency: 'INR',
          trialDomain: 'noprofile-stage1.com',
          status: 'ACTIVE',
        },
        {
          id: billingAcctIdOther,
          name: 'Stage1 Other Payer',
          billingCountry: 'IN',
          currency: 'INR',
          trialDomain: 'other-stage1.org',
          status: 'ACTIVE',
        },
      ],
      skipDuplicates: true,
    });

    // 2. Seed Organizations
    await prisma.organization.createMany({
      data: [
        {
          id: testTenantId1,
          name: 'Stage1 Acme Corporation',
          slug: 'acme-stage1',
          billingAccountId: billingAcctId1,
          appealWindowDaysOverride: 14,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: testTenantId2,
          name: 'Stage1 Beta Systems',
          slug: 'beta-stage1',
          billingAccountId: billingAcctId2,
          appealWindowDaysOverride: null,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
        {
          id: testTenantIdNoProfile,
          name: 'Stage1 Bare Organization',
          slug: 'bare-stage1',
          billingAccountId: billingAcctId3,
          appealWindowDaysOverride: null,
          createdAt: new Date('2026-01-03T00:00:00Z'),
        },
        {
          id: otherTenantId,
          name: 'Stage1 Other Organization',
          slug: 'other-stage1',
          billingAccountId: billingAcctIdOther,
          appealWindowDaysOverride: null,
          createdAt: new Date('2026-01-04T00:00:00Z'),
        },
      ],
      skipDuplicates: true,
    });

    // 3. Seed Tenant Profiles
    await prisma.tenantProfile.createMany({
      data: [
        {
          id: 'prof-stage1-001',
          organizationId: testTenantId1,
          lifecycleStage: 'ACTIVE',
          licenseTier: 'ENTERPRISE',
          isManuallySuspended: false,
          isManuallyChurned: false,
          domainVerifiedAt: new Date('2026-01-01T12:00:00Z'),
          walkthroughCompletedAt: new Date('2026-01-02T12:00:00Z'),
          walkthroughChecklist: { kickoffCallDone: true, sampleDriveDeployed: true, adminTrained: true },
          internalOwnerId: staffOwnerId,
          appealWindowDaysOverride: 14,
        },
        {
          id: 'prof-stage1-002',
          organizationId: testTenantId2,
          lifecycleStage: 'SUSPENDED',
          licenseTier: 'GROWTH',
          isManuallySuspended: true,
          isManuallyChurned: false,
          suspensionReason: 'Payment reconciliation hold',
          suspendedAt: new Date('2026-01-05T00:00:00Z'),
          domainVerifiedAt: new Date('2026-01-02T12:00:00Z'),
          walkthroughCompletedAt: null,
        },
      ],
      skipDuplicates: true,
    });

    // 4. Seed Platform Staff
    await prisma.platformStaff.createMany({
      data: [
        {
          id: staffOwnerId,
          email: 'stage1-owner@proctora.local',
          name: 'Stage 1 Owner',
          role: PlatformStaffRole.OWNER,
          mfaEnabled: true,
          isActive: true,
        },
        {
          id: staffFinanceId,
          email: 'stage1-finance@proctora.local',
          name: 'Stage 1 Finance',
          role: PlatformStaffRole.FINANCE,
          mfaEnabled: true,
          isActive: true,
        },
        {
          id: staffSupportId,
          email: 'stage1-support@proctora.local',
          name: 'Stage 1 Support',
          role: PlatformStaffRole.SUPPORT,
          mfaEnabled: true,
          isActive: true,
        },
      ],
      skipDuplicates: true,
    });

    // 5. Seed Staff in Tenant 1 (Recruiter)
    const recruiterStaffId = 'stf-recruiter-stage1';
    await prisma.staff.create({
      data: {
        id: recruiterStaffId,
        organizationId: testTenantId1,
        email: 'recruiter.secret@acme-stage1.corp',
        name: 'Jane Recruiter',
        role: 'RECRUITER',
      },
    });

    // 6. Seed Role Template
    const roleTemplateId = 'rt-stage1-001';
    await prisma.roleTemplate.create({
      data: {
        id: roleTemplateId,
        roleName: 'Software Engineer Stage1',
        weightingPreset: {},
        durationMinutes: 60,
      },
    });

    // 7. Seed Drives for Tenant 1
    const drive1Id = 'drv-stage1-001';
    const drive2Id = 'drv-stage1-002';
    await prisma.drive.createMany({
      data: [
        {
          id: drive1Id,
          organizationId: testTenantId1,
          name: 'Campus Hiring 2026',
          roleTemplateId,
          moduleConfig: {},
          status: 'ACTIVE',
          createdById: recruiterStaffId,
        },
        {
          id: drive2Id,
          organizationId: testTenantId1,
          name: 'Lateral Frontend Drive',
          roleTemplateId,
          moduleConfig: {},
          status: 'CLOSED',
          createdById: recruiterStaffId,
        },
      ],
      skipDuplicates: true,
    });

    // 8. Seed Candidates & Invites & Sessions in Tenant 1
    // Candidate 1: Finished session
    const cand1 = await prisma.candidate.create({
      data: {
        id: 'cand-stage1-001',
        organizationId: testTenantId1,
        email: 'john.doe.private@gmail.com',
        name: 'John Doe PII Candidate',
        idProofRef: 's3://vault/pii-cand1.jpg',
      },
    });

    const cand2 = await prisma.candidate.create({
      data: {
        id: 'cand-stage1-002',
        organizationId: testTenantId1,
        email: 'alice.smith.private@yahoo.com',
        name: 'Alice Smith PII Candidate',
      },
    });

    // Drive 1 invites & sessions
    await prisma.invite.createMany({
      data: [
        {
          id: 'inv-stage1-001',
          candidateEmail: 'cand1@test.com',
          candidateName: 'Cand 1',
          roleTemplateId,
          driveId: drive1Id,
          token: 'token-inv-1',
          createdById: recruiterStaffId,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          id: 'inv-stage1-002',
          candidateEmail: 'cand2@test.com',
          candidateName: 'Cand 2',
          roleTemplateId,
          driveId: drive1Id,
          token: 'token-inv-2',
          createdById: recruiterStaffId,
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          id: 'inv-stage1-003',
          candidateEmail: 'cand3@test.com',
          candidateName: 'Cand 3',
          roleTemplateId,
          driveId: drive1Id,
          token: 'token-inv-3',
          createdById: recruiterStaffId,
          expiresAt: new Date(Date.now() + 86400000),
        },
      ],
    });

    await prisma.session.createMany({
      data: [
        {
          id: 'sess-stage1-001',
          organizationId: testTenantId1,
          candidateId: cand1.id,
          roleTemplateId,
          driveId: drive1Id,
          cvMode: CvMode.FULL,
          status: SessionStatus.SUBMITTED,
          startedAt: new Date('2026-01-10T10:00:00Z'),
          submittedAt: new Date('2026-01-10T11:00:00Z'),
        },
        {
          id: 'sess-stage1-002',
          organizationId: testTenantId1,
          candidateId: cand2.id,
          roleTemplateId,
          driveId: drive1Id,
          cvMode: CvMode.FULL,
          status: SessionStatus.IN_PROGRESS,
          startedAt: new Date('2026-01-10T10:30:00Z'),
        },
      ],
    });


    // 9. Seed Audit Events targeting Tenant 1 and Other Tenant
    await prisma.systemAuditEvent.createMany({
      data: [
        {
          actorId: staffOwnerId,
          actorRole: 'OWNER',
          subjectType: 'TENANT',
          subjectId: testTenantId1,
          targetTenantId: testTenantId1,
          action: 'TENANT_ONBOARDED',
          before: null,
          after: { name: 'Stage1 Acme Corporation' },
          executionResult: 'SUCCESS',
          reason: 'Initial setup',
        },
        {
          actorId: staffSupportId,
          actorRole: 'SUPPORT',
          subjectType: 'TENANT',
          subjectId: otherTenantId,
          targetTenantId: otherTenantId,
          action: 'TENANT_AUDIT_OTHER',
          before: null,
          after: { name: 'Other Org' },
          executionResult: 'SUCCESS',
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function cleanupTestData() {
    await prisma.session.deleteMany({
      where: { organizationId: { in: [testTenantId1, testTenantId2, testTenantIdNoProfile, otherTenantId] } },
    });

    await prisma.invite.deleteMany({
      where: { driveId: { in: ['drv-stage1-001', 'drv-stage1-002'] } },
    });

    await prisma.candidate.deleteMany({
      where: { organizationId: { in: [testTenantId1, testTenantId2, testTenantIdNoProfile, otherTenantId] } },
    });

    await prisma.drive.deleteMany({
      where: { organizationId: { in: [testTenantId1, testTenantId2, testTenantIdNoProfile, otherTenantId] } },
    });

    await prisma.roleTemplate.deleteMany({
      where: { id: 'rt-stage1-001' },
    });

    await prisma.staff.deleteMany({
      where: { organizationId: { in: [testTenantId1, testTenantId2, testTenantIdNoProfile, otherTenantId] } },
    });

    await prisma.tenantProfile.deleteMany({
      where: { organizationId: { in: [testTenantId1, testTenantId2, testTenantIdNoProfile, otherTenantId] } },
    });

    await prisma.organization.deleteMany({
      where: { id: { in: [testTenantId1, testTenantId2, testTenantIdNoProfile, otherTenantId] } },
    });

    await prisma.billingAccount.deleteMany({
      where: { id: { in: [billingAcctId1, billingAcctId2, billingAcctId3, billingAcctIdOther] } },
    });

    await prisma.platformStaff.deleteMany({
      where: { id: { in: [staffOwnerId, staffFinanceId, staffSupportId] } },
    });
  }

  // 1. Auth & Guard checks for GET /tenants/:id
  it('1. Auth & RBAC on GET /tenants/:id: 401 without token, 403 on mfaSetupRequired, 200 for OWNER/FINANCE/SUPPORT', async () => {
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ url: `/api/v1/platform/tenants/${testTenantId1}`, headers: {} }),
      }),
      getHandler: () => PlatformTenantsController.prototype.getTenantDetail,
      getClass: () => PlatformTenantsController,
    };

    // 401 without token
    expect(() => guard.handleRequest(new UnauthorizedException(), null, null, mockContext)).toThrow(UnauthorizedException);

    // 403 with mfaSetupRequired
    const restrictedUser = { id: staffOwnerId, role: PlatformStaffRole.OWNER, mfaSetupRequired: true };
    expect(() => guard.handleRequest(null, restrictedUser, null, mockContext)).toThrow(ForbiddenException);

    // 200 for all 3 staff roles
    for (const role of [PlatformStaffRole.OWNER, PlatformStaffRole.FINANCE, PlatformStaffRole.SUPPORT]) {
      const user = { id: `stf_${role}`, role, mfaSetupRequired: false };
      const allowed = guard.handleRequest(null, user, null, mockContext);
      expect(allowed.role).toBe(role);

      const rolesContext: any = {
        getHandler: () => PlatformTenantsController.prototype.getTenantDetail,
        getClass: () => PlatformTenantsController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      };
      expect(rolesGuard.canActivate(rolesContext)).toBe(true);

      const detail = await tenantsController.getTenantDetail(testTenantId1);
      expect(detail.overview.id).toBe(testTenantId1);
      expect(detail.overview.name).toBe('Stage1 Acme Corporation');
    }
  });

  // 2. 404 on missing tenant & 400 on non-UUID parameter
  it('2. Status Codes: 404 on non-existent tenant, 400 on non-UUID parameter', async () => {
    const nonExistentUuid = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    await expect(tenantsController.getTenantDetail(nonExistentUuid)).rejects.toThrow(NotFoundException);

    const uuidPipe = new ParseUUIDPipe({ version: '4' });
    await expect(uuidPipe.transform('invalid-non-uuid-string', { type: 'param' })).rejects.toThrow(BadRequestException);
  });

  // 3. GET /tenants/:id/brief cross-team contract validation
  it('3. GET /tenants/:id/brief: returns exactly { id, name, slug, lifecycleStage, licenseTier, createdAt }', async () => {
    const brief = await tenantsController.getTenantBrief(testTenantId1);
    expect(Object.keys(brief).sort()).toEqual([
      'createdAt',
      'id',
      'licenseTier',
      'lifecycleStage',
      'name',
      'slug',
    ]);
    expect(brief.id).toBe(testTenantId1);
    expect(brief.name).toBe('Stage1 Acme Corporation');
    expect(brief.slug).toBe('acme-stage1');
    expect(brief.lifecycleStage).toBe('ACTIVE');
    expect(brief.licenseTier).toBe('ENTERPRISE');
    expect(typeof brief.createdAt).toBe('string');
  });

  // 4. Aggregated drive counts in tenant detail
  it('4. GET /tenants/:id detail: correctly computes grouped drive counts and billing empty section', async () => {
    const detail = await tenantsController.getTenantDetail(testTenantId1);

    expect(detail.overview.domain).toBe('acme-stage1.corp');
    expect(detail.overview.domainVerifiedAt).toBeDefined();
    expect(detail.overview.walkthroughCompletedAt).toBeDefined();
    expect(detail.overview.walkthroughChecklist).toEqual({
      kickoffCallDone: true,
      sampleDriveDeployed: true,
      adminTrained: true,
    });
    expect(detail.overview.internalOwnerId).toBe(staffOwnerId);
    expect(detail.retention.appealWindowDaysOverride).toBe(14);

    // Drives
    expect(detail.drives.driveCount).toBe(2);
    expect(detail.drives.items.length).toBe(2);

    const drive1 = detail.drives.items.find((d) => d.id === 'drv-stage1-001');
    expect(drive1).toBeDefined();
    expect(drive1?.invitesSent).toBe(3);
    expect(drive1?.sessionsStarted).toBe(2);
    expect(drive1?.sessionsCompleted).toBe(1);

    // Billing
    expect(detail.billing.connected).toBe(false);

    // Funnel stage (computed via deriveFunnelStage, UNKNOWN when billing disconnected)
    expect(detail.funnelStage).toBe('UNKNOWN');
  });

  // 5. Suspended tenant detail checks
  it('5. GET /tenants/:id for suspended tenant: shows status SUSPENDED with suspendedAt and reason', async () => {
    const detail = await tenantsController.getTenantDetail(testTenantId2);
    expect(detail.overview.status).toBe('SUSPENDED');
    expect(detail.overview.suspendedReason).toBe('Payment reconciliation hold');
    expect(detail.overview.suspendedAt).toBeDefined();
    expect(detail.overview.walkthroughCompletedAt).toBeNull();
  });

  // 6. Audit stream endpoint returns only tenant events
  it('6. GET /tenants/:id/audit: returns only audit events targeting the given tenant', async () => {
    const auditRes = await tenantsController.getTenantAudit(testTenantId1, { page: 1, pageSize: 10 });
    expect(auditRes.items.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.total).toBeGreaterThanOrEqual(1);
    expect(auditRes.items.some((i) => i.action === 'TENANT_ONBOARDED')).toBe(true);
    expect(auditRes.items.every((i) => (i as any).targetTenantId === testTenantId1 || i.subjectId === testTenantId1)).toBe(true);
  });

  // 7. Global Rule 12: Real-DB integration test for GET /platform/tenants list
  it('7. Real DB List Test: pagination, status filter, domain resolution, org with no profile defaults to PROVISIONING', async () => {
    // 7.1 List all (paged)
    const listRes = await tenantsService.listTenants({ page: 1, pageSize: 20 });
    expect(listRes.total).toBeGreaterThanOrEqual(4);

    const tenant1 = listRes.items.find((t) => t.id === testTenantId1);
    expect(tenant1).toBeDefined();
    expect(tenant1?.domain).toBe('acme-stage1.corp');
    expect(tenant1?.status).toBe('ACTIVE');

    // 7.2 Org with no tenant_profile row defaults to PROVISIONING
    const bareOrg = listRes.items.find((t) => t.id === testTenantIdNoProfile);
    expect(bareOrg).toBeDefined();
    expect(bareOrg?.status).toBe('PROVISIONING');
    expect(bareOrg?.licenseTier).toBe('STARTER');

    // 7.3 Status filter
    const activeList = await tenantsService.listTenants({ status: PlatformTenantStatusFilter.ACTIVE });
    expect(activeList.items.some((t) => t.id === testTenantId1)).toBe(true);
    expect(activeList.items.some((t) => t.id === testTenantId2)).toBe(false);

    const suspendedList = await tenantsService.listTenants({ status: PlatformTenantStatusFilter.SUSPENDED });
    expect(suspendedList.items.some((t) => t.id === testTenantId2)).toBe(true);
    expect(suspendedList.items.some((t) => t.id === testTenantId1)).toBe(false);
  });

  // 8. Strict PII-Blind scan across all endpoints
  it('8. PII-Blindness across Stage 1 responses: zero candidate emails, names, proof refs, or staff emails', async () => {
    const [detail, brief, audit, list] = await Promise.all([
      tenantsController.getTenantDetail(testTenantId1),
      tenantsController.getTenantBrief(testTenantId1),
      tenantsController.getTenantAudit(testTenantId1, { page: 1, pageSize: 10 }),
      tenantsController.listTenants({ page: 1, pageSize: 10 }),
    ]);

    const combinedJson = JSON.stringify({ detail, brief, audit, list });

    // Assert zero email patterns
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailsFound = combinedJson.match(emailPattern);
    expect(emailsFound).toBeNull();

    // Assert zero candidate/staff secret strings
    const forbiddenStrings = [
      'john.doe.private',
      'alice.smith.private',
      'John Doe PII Candidate',
      'Alice Smith PII Candidate',
      'pii-cand1.jpg',
      'recruiter.secret',
      'Jane Recruiter',
    ];

    for (const term of forbiddenStrings) {
      expect(combinedJson.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});
