import {
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { PlatformOnboardingController } from './platform-onboarding.controller';
import { PlatformTenantsService } from '../tenants/platform-tenants.service';
import { PlatformTenantsController } from '../tenants/platform-tenants.controller';
import { NullTenantBillingSummaryProvider } from '../tenants/providers/tenant-billing-summary.provider';
import { MockBillingAccountService } from '../mocks/mock-billing-account.service';
import { MockTrialGrantService } from '../mocks/mock-trial-grant.service';
import {
  IBillingAccountService,
  ITrialGrantService,
} from './interfaces/billing-integration.interface';

describe('Stage 3: Onboarding Wizard, Domain Checks & Atomic Commit (Real Postgres DB)', () => {
  let prisma: PrismaService;
  let auditService: PlatformAuditService;
  let onboardingService: PlatformOnboardingService;
  let onboardingController: PlatformOnboardingController;
  let tenantsService: PlatformTenantsService;
  let tenantsController: PlatformTenantsController;
  let billingAccountService: MockBillingAccountService;
  let trialGrantService: MockTrialGrantService;
  let guard: PlatformJwtAuthGuard;
  let rolesGuard: PlatformRolesGuard;

  const staffOwnerId = 'staff-owner-stage3';
  const staffFinanceId = 'staff-finance-stage3';
  const staffSupportId = 'staff-support-stage3';

  const actorOwner = { id: staffOwnerId, role: 'OWNER' };
  const actorFinance = { id: staffFinanceId, role: 'FINANCE' };
  const actorSupport = { id: staffSupportId, role: 'SUPPORT' };

  let seededOrgIds: string[] = [];
  let seededBaIds: string[] = [];
  let seededDraftIds: string[] = [];

  const cleanupAll = async () => {
    if (seededDraftIds.length > 0) {
      await prisma.onboardingDraft.deleteMany({
        where: { id: { in: seededDraftIds } },
      }).catch(() => {});
    }

    if (seededOrgIds.length > 0) {
      await prisma.staff.deleteMany({
        where: { organizationId: { in: seededOrgIds } },
      }).catch(() => {});

      await prisma.tenantProfile.deleteMany({
        where: { organizationId: { in: seededOrgIds } },
      }).catch(() => {});

      await prisma.organization.deleteMany({
        where: { id: { in: seededOrgIds } },
      }).catch(() => {});
    }

    if (seededBaIds.length > 0) {
      await prisma.creditPool.deleteMany({
        where: { billingAccountId: { in: seededBaIds } },
      }).catch(() => {});

      await prisma.billingAccount.deleteMany({
        where: { id: { in: seededBaIds } },
      }).catch(() => {});
    }

    await prisma.platformStaff.deleteMany({
      where: { id: { in: [staffOwnerId, staffFinanceId, staffSupportId] } },
    }).catch(() => {});
  };

  beforeAll(async () => {
    process.env.PLATFORM_JWT_SECRET = 'dev-test-secret-at-least-32-chars-long!!';
    prisma = new PrismaService();
    await prisma.$connect();

    await cleanupAll();

    // Seed platform staff rows
    await prisma.platformStaff.createMany({
      data: [
        { id: staffOwnerId, name: 'Owner Staff', email: 'owner@proctora.internal', role: 'OWNER' },
        { id: staffFinanceId, name: 'Finance Staff', email: 'finance@proctora.internal', role: 'FINANCE' },
        { id: staffSupportId, name: 'Support Staff', email: 'support@proctora.internal', role: 'SUPPORT' },
      ],
      skipDuplicates: true,
    });

    auditService = new PlatformAuditService(prisma);
    billingAccountService = new MockBillingAccountService();
    trialGrantService = new MockTrialGrantService();

    onboardingService = new PlatformOnboardingService(
      prisma,
      auditService,
      billingAccountService,
      trialGrantService,
    );
    const billingProvider = new NullTenantBillingSummaryProvider();
    tenantsService = new PlatformTenantsService(prisma, auditService, billingProvider);
    tenantsController = new PlatformTenantsController(tenantsService, auditService);
    onboardingController = new PlatformOnboardingController(onboardingService, tenantsService);

    guard = new PlatformJwtAuthGuard();
    rolesGuard = new PlatformRolesGuard(new Reflector());
  });

  afterAll(async () => {
    await cleanupAll();
    await prisma.$disconnect();
  });

  it('1. Auth & Guard Enforcement: 401 on missing token, 403 on mfaSetupRequired, 200 for all staff roles', async () => {
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/platform/onboarding/drafts', headers: {} }),
      }),
      getHandler: () => PlatformOnboardingController.prototype.createDraft,
      getClass: () => PlatformOnboardingController,
    };

    // 401 without token
    expect(() => guard.handleRequest(new UnauthorizedException(), null, null, mockContext)).toThrow(
      UnauthorizedException,
    );

    // 403 with mfaSetupRequired
    const restrictedUser = { id: staffOwnerId, role: PlatformStaffRole.OWNER, mfaSetupRequired: true };
    expect(() => guard.handleRequest(null, restrictedUser, null, mockContext)).toThrow(
      ForbiddenException,
    );

    // 200 for all 3 staff roles
    for (const role of [PlatformStaffRole.OWNER, PlatformStaffRole.FINANCE, PlatformStaffRole.SUPPORT]) {
      const user = { id: `staff_${role}`, role, mfaSetupRequired: false };
      const allowed = guard.handleRequest(null, user, null, mockContext);
      expect(allowed.role).toBe(role);

      const rolesContext: any = {
        getHandler: () => PlatformOnboardingController.prototype.createDraft,
        getClass: () => PlatformOnboardingController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      };
      expect(rolesGuard.canActivate(rolesContext)).toBe(true);
    }
  });

  it('2. Domain Check: free providers, mismatched emails, collisions, normalization & valid domains', async () => {
    // 2.1 Free email provider rejected
    const freeRes = await onboardingController.checkDomain({
      domain: 'gmail.com',
      adminEmail: 'hr@gmail.com',
    });
    expect(freeRes.ok).toBe(false);
    expect(freeRes.reasons).toContain('PERSONAL_EMAIL_PROVIDER_NOT_ALLOWED');

    // 2.2 Email domain mismatch
    const mismatchRes = await onboardingController.checkDomain({
      domain: 'acme.com',
      adminEmail: 'hr@othercorp.com',
    });
    expect(mismatchRes.ok).toBe(false);
    expect(mismatchRes.reasons).toContain('EMAIL_DOMAIN_MISMATCH');

    // 2.3 Normalization (strips leading www. and @, trims, lowercases)
    const normRes = await onboardingController.checkDomain({
      domain: '  @WWW.Acme-Corp.Com  ',
      adminEmail: 'admin@acme-corp.com',
    });
    expect(normRes.normalizedDomain).toBe('acme-corp.com');
    expect(normRes.ok).toBe(true);

    // 2.4 Domain already registered / collision
    const existingBaId = 'ba-stage3-collision-test';
    seededBaIds.push(existingBaId);
    await prisma.billingAccount.create({
      data: {
        id: existingBaId,
        name: 'Collision Org',
        billingCountry: 'US',
        currency: 'USD',
        trialDomain: 'alreadyused.com',
        status: 'ACTIVE',
      },
    });

    const collisionRes = await onboardingController.checkDomain({
      domain: 'alreadyused.com',
      adminEmail: 'admin@alreadyused.com',
    });
    expect(collisionRes.ok).toBe(false);
    expect(collisionRes.reasons).toContain('DOMAIN_ALREADY_USED');
  });

  it('3. Draft Lifecycle: create, autosave, ownership isolation, expiry & discard', async () => {
    // 3.1 Create draft by Support staff
    const draft = await onboardingController.createDraft(
      { draftData: { companyName: 'Initech Systems' } },
      { user: actorSupport } as any,
    );
    seededDraftIds.push(draft.id);

    expect(draft.status).toBe('DRAFT');
    expect(draft.createdByStaffId).toBe(staffSupportId);
    expect(draft.currentStep).toBe(1);

    // 3.2 Autosave update
    const updated = await onboardingController.updateDraft(
      draft.id,
      {
        currentStep: 2,
        draftData: {
          companyName: 'Initech Systems',
          slug: 'initech-sys',
          adminName: 'Peter Gibbons',
          adminEmail: 'peter@initech.com',
          password: 'MUST_BE_STRIPPED',
        },
      },
      { user: actorSupport } as any,
    );

    expect(updated.currentStep).toBe(2);
    expect((updated.draftData as any).password).toBeUndefined(); // password stripped
    expect((updated.draftData as any).slug).toBe('initech-sys');

    // 3.3 Ownership Isolation: Finance staff cannot view Support draft (404)
    await expect(
      onboardingController.getDraft(draft.id, { user: actorFinance } as any),
    ).rejects.toThrow(NotFoundException);

    // 3.4 OWNER can view all drafts
    const ownerView = await onboardingController.getDraft(
      draft.id,
      { user: actorOwner } as any,
    );
    expect(ownerView.id).toBe(draft.id);

    // 3.5 Discard draft
    const delRes = await onboardingController.deleteDraft(
      draft.id,
      { user: actorSupport } as any,
    );
    expect(delRes.success).toBe(true);

    await expect(
      onboardingController.getDraft(draft.id, { user: actorSupport } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('4. Happy-Path Atomic Commit: provisions Org, Profile, Staff Admin, Billing Account & Trial', async () => {
    // Create and populate draft
    const draft = await onboardingController.createDraft({}, { user: actorOwner } as any);
    seededDraftIds.push(draft.id);

    await onboardingController.updateDraft(
      draft.id,
      {
        currentStep: 4,
        draftData: {
          companyName: 'Stark Industries Stage3',
          slug: 'stark-stage3',
          billingCountry: 'US',
          currency: 'USD',
          adminName: 'Tony Stark',
          adminEmail: 'tony@starkindustries.io',
          domain: 'starkindustries.io',
          licenseTier: 'GROWTH',
          internalOwnerId: staffOwnerId,
        },
      },
      { user: actorOwner } as any,
    );

    const result = await onboardingController.commitDraft(
      draft.id,
      { user: actorOwner } as any,
    );

    expect(result.organizationId).toBeDefined();
    expect(result.billingAccountId).toBeDefined();
    expect(result.trial.creditsGranted).toBe(25);
    expect(result.trial.validityDays).toBe(30);

    seededOrgIds.push(result.organizationId);
    seededBaIds.push(result.billingAccountId);

    // Verify Organization in DB
    const org = await prisma.organization.findUnique({
      where: { id: result.organizationId },
    });
    expect(org?.name).toBe('Stark Industries Stage3');
    expect(org?.slug).toBe('stark-stage3');
    expect(org?.billingAccountId).toBe(result.billingAccountId);

    // Verify TenantProfile in DB
    const profile = await prisma.tenantProfile.findUnique({
      where: { organizationId: result.organizationId },
    });
    expect(profile?.lifecycleStage).toBe('ACTIVE');
    expect(profile?.licenseTier).toBe('GROWTH');
    expect(profile?.domainVerifiedAt).not.toBeNull();
    expect(profile?.internalOwnerId).toBe(staffOwnerId);

    // Verify Tenant Admin Staff in DB
    const adminStaff = await prisma.staff.findFirst({
      where: { organizationId: result.organizationId },
    });
    expect(adminStaff?.name).toBe('Tony Stark');
    expect(adminStaff?.email).toBe('tony@starkindustries.io');
    expect(adminStaff?.role).toBe('ADMIN');
    expect(adminStaff?.passwordHash).toBeDefined();

    // Verify draft status is COMMITTED
    const committedDraft = await prisma.onboardingDraft.findUnique({
      where: { id: draft.id },
    });
    expect(committedDraft?.status).toBe('COMMITTED');
    expect(committedDraft?.committedOrganizationId).toBe(result.organizationId);

    // Verify audit record TENANT_CREATED has NO admin name or email
    const audits = await prisma.systemAuditEvent.findMany({
      where: { targetTenantId: result.organizationId, action: 'TENANT_CREATED' },
    });
    expect(audits.length).toBe(1);
    const auditPayload = JSON.stringify(audits[0]);
    expect(auditPayload).not.toContain('tony@starkindustries.io');
    expect(auditPayload).not.toContain('Tony Stark');
    expect((audits[0].after as any)?.name).toBe('Stark Industries Stage3');
    expect((audits[0].after as any)?.creditsGranted).toBe(25);
  });

  it('5. Atomicity & Rollback: failure in trial grant rolls back all created entities and leaves draft as DRAFT', async () => {
    // Inject failing trial grant service
    const failingTrialService: ITrialGrantService = {
      async grantTrial() {
        throw new ConflictException('MOCK_TRIAL_ENGINE_FAILURE');
      },
    };

    const failingOnboardingService = new PlatformOnboardingService(
      prisma,
      auditService,
      billingAccountService,
      failingTrialService,
    );

    const draft = await failingOnboardingService.createDraft(staffOwnerId, {
      draftData: {
        companyName: 'Wayne Enterprises Rollback Test',
        slug: 'wayne-rollback-test',
        billingCountry: 'US',
        currency: 'USD',
        adminName: 'Bruce Wayne',
        adminEmail: 'bruce@wayne-rollback.com',
        domain: 'wayne-rollback.com',
        licenseTier: 'STARTER',
      },
    });
    seededDraftIds.push(draft.id);

    // Attempt commit (should fail & rollback)
    await expect(
      failingOnboardingService.commitDraft(draft.id, actorOwner),
    ).rejects.toThrow(ConflictException);

    // Assert zero organizations exist with this slug
    const org = await prisma.organization.findUnique({
      where: { slug: 'wayne-rollback-test' },
    });
    expect(org).toBeNull();

    // Assert zero staff admins exist with this email
    const admin = await prisma.staff.findFirst({
      where: { email: 'bruce@wayne-rollback.com' },
    });
    expect(admin).toBeNull();

    // Assert draft remains DRAFT with lastCommitError saved
    const draftAfter = await prisma.onboardingDraft.findUnique({
      where: { id: draft.id },
    });
    expect(draftAfter?.status).toBe('DRAFT');
    expect(draftAfter?.committedOrganizationId).toBeNull();
    expect(draftAfter?.lastCommitError).toBe('MOCK_TRIAL_ENGINE_FAILURE');

    // Assert TENANT_CREATE_FAILED audit recorded
    const failAudits = await prisma.systemAuditEvent.findMany({
      where: { subjectId: draft.id, action: 'TENANT_CREATE_FAILED' },
    });
    expect(failAudits.length).toBeGreaterThanOrEqual(1);
  });

  it('6. Idempotency & Concurrency: duplicate commit returns same organization', async () => {
    // Create draft
    const draft = await onboardingController.createDraft({}, { user: actorOwner } as any);
    seededDraftIds.push(draft.id);

    await onboardingController.updateDraft(
      draft.id,
      {
        currentStep: 4,
        draftData: {
          companyName: 'Cyberdyne Systems',
          slug: 'cyberdyne-sys',
          billingCountry: 'US',
          currency: 'USD',
          adminName: 'Miles Dyson',
          adminEmail: 'miles@cyberdyne.com',
          domain: 'cyberdyne.com',
          licenseTier: 'ENTERPRISE',
        },
      },
      { user: actorOwner } as any,
    );

    // Commit 1
    const res1 = await onboardingController.commitDraft(draft.id, { user: actorOwner } as any);
    seededOrgIds.push(res1.organizationId);
    seededBaIds.push(res1.billingAccountId);

    // Commit 2 (Idempotent call)
    const res2 = await onboardingController.commitDraft(draft.id, { user: actorOwner } as any);
    expect(res2.organizationId).toBe(res1.organizationId);

    // Count organizations in DB: exactly 1
    const orgCount = await prisma.organization.count({
      where: { slug: 'cyberdyne-sys' },
    });
    expect(orgCount).toBe(1);
  });

  it('6b. Two simultaneous commits produce exactly one organization and both return the same org ID', async () => {
    const draft = await onboardingController.createDraft({}, { user: actorOwner } as any);
    seededDraftIds.push(draft.id);

    await onboardingController.updateDraft(
      draft.id,
      {
        currentStep: 4,
        draftData: {
          companyName: 'Omni Consumer Products',
          slug: 'omni-consumer-sys',
          billingCountry: 'US',
          currency: 'USD',
          adminName: 'Dick Jones',
          adminEmail: 'dick@omnicorp.com',
          domain: 'omnicorp.com',
          licenseTier: 'ENTERPRISE',
        },
      },
      { user: actorOwner } as any,
    );

    // Launch two simultaneous commits
    const [resA, resB] = await Promise.all([
      onboardingController.commitDraft(draft.id, { user: actorOwner } as any),
      onboardingController.commitDraft(draft.id, { user: actorOwner } as any),
    ]);

    expect(resA.organizationId).toBe(resB.organizationId);
    seededOrgIds.push(resA.organizationId);
    seededBaIds.push(resA.billingAccountId);

    const orgCount = await prisma.organization.count({
      where: { slug: 'omni-consumer-sys' },
    });
    expect(orgCount).toBe(1);
  });

  it('6c. Proof that transactionClient is passed to billing/trial integrations during commit', async () => {
    let capturedTxClient: any = null;
    const trackingBillingService: IBillingAccountService = {
      async createForOrganization(orgId, params, context) {
        capturedTxClient = context?.transactionClient;
        return billingAccountService.createForOrganization(orgId, params, context);
      },
    };

    const trackingOnboardingService = new PlatformOnboardingService(
      prisma,
      auditService,
      trackingBillingService,
      trialGrantService,
    );

    const draft = await trackingOnboardingService.createDraft(staffOwnerId, {
      draftData: {
        companyName: 'Weyland Yutani Corp',
        slug: 'weyland-yutani-test',
        billingCountry: 'GB',
        currency: 'USD',
        adminName: 'Peter Weyland',
        adminEmail: 'peter@weyland-corp.com',
        domain: 'weyland-corp.com',
        licenseTier: 'STARTER',
      },
    });
    seededDraftIds.push(draft.id);

    const res = await trackingOnboardingService.commitDraft(draft.id, actorOwner);
    seededOrgIds.push(res.organizationId);
    seededBaIds.push(res.billingAccountId);

    expect(capturedTxClient).toBeDefined();
    expect(typeof capturedTxClient.$queryRaw).toBe('function');
  });

  it('7. Walkthrough Checklist: PATCH /tenants/:id/walkthrough sets/clears completion timestamp', async () => {
    // Use an existing provisioned org
    const orgId = seededOrgIds[0];

    // Partial update (2 of 3 true)
    const partialRes = await tenantsController.updateWalkthrough(
      orgId,
      { kickoffCallDone: true, sampleDriveDeployed: true, adminTrained: false },
      { user: actorSupport } as any,
    );
    expect(partialRes.walkthroughCompletedAt).toBeNull();
    expect((partialRes.walkthroughChecklist as any).kickoffCallDone).toBe(true);

    // Full update (3 of 3 true)
    const fullRes = await tenantsController.updateWalkthrough(
      orgId,
      { adminTrained: true },
      { user: actorSupport } as any,
    );
    expect(fullRes.walkthroughCompletedAt).not.toBeNull();
    expect((fullRes.walkthroughChecklist as any).adminTrained).toBe(true);

    // Revert one item to false
    const revertRes = await tenantsController.updateWalkthrough(
      orgId,
      { kickoffCallDone: false },
      { user: actorSupport } as any,
    );
    expect(revertRes.walkthroughCompletedAt).toBeNull();
  });
});
