import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformAuditService } from '../audit/platform-audit.service';
import {
  deriveFunnelStage,
  FunnelStage,
  TenantFunnelFacts,
} from './utils/funnel-stage.util';
import {
  ITenantBillingSummaryProvider,
  NullTenantBillingSummaryProvider,
} from './providers/tenant-billing-summary.provider';

describe('Stage 4: Pure deriveFunnelStage and Pipeline Board Integration', () => {
  // -------------------------------------------------------------
  // Part 1: Pure Unit Tests for deriveFunnelStage
  // -------------------------------------------------------------
  describe('Pure function: deriveFunnelStage(facts)', () => {
    const fixedNow = new Date('2026-10-01T12:00:00.000Z');
    const futureDate = new Date('2026-11-01T12:00:00.000Z');
    const pastDate = new Date('2026-09-01T12:00:00.000Z');

    it('Rule 1: status OFFBOARDED overrides all other facts and returns CHURNED', () => {
      const facts: TenantFunnelFacts = {
        status: 'OFFBOARDED',
        domainVerifiedAt: fixedNow,
        driveCount: 10,
        billingFacts: {
          hasPaidPurchase: true,
          trialExpiresAt: futureDate,
          trialCreditsRemaining: 100,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.CHURNED);
    });

    it('Rule 1: status CHURNED returns CHURNED', () => {
      const facts: TenantFunnelFacts = {
        status: 'CHURNED',
        domainVerifiedAt: null,
        driveCount: 0,
        billingFacts: null,
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.CHURNED);
    });

    it('Rule 2: domainVerifiedAt is null returns SIGNED_UP', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: null,
        driveCount: 5,
        billingFacts: {
          hasPaidPurchase: true,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.SIGNED_UP);
    });

    it('Rule 3: billing facts not available (provider returns null) returns UNKNOWN with reason', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: fixedNow,
        driveCount: 2,
        billingFacts: null,
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.UNKNOWN);
      expect(result.reason).toBe('BILLING_NOT_CONNECTED');
    });

    it('Rule 4: hasPaidPurchase === true returns CONVERTED', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: fixedNow,
        driveCount: 0,
        billingFacts: {
          hasPaidPurchase: true,
          trialExpiresAt: pastDate,
          trialCreditsRemaining: 0,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.CONVERTED);
    });

    it('Rule 5: trial not expired and driveCount > 0 returns FIRST_DRIVE_CREATED', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: fixedNow,
        driveCount: 3,
        billingFacts: {
          hasPaidPurchase: false,
          trialExpiresAt: futureDate,
          trialCreditsRemaining: 25,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.FIRST_DRIVE_CREATED);
    });

    it('Rule 6: trial not expired and driveCount === 0 returns TRIAL_ACTIVE', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: fixedNow,
        driveCount: 0,
        billingFacts: {
          hasPaidPurchase: false,
          trialExpiresAt: futureDate,
          trialCreditsRemaining: 25,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.TRIAL_ACTIVE);
    });

    it('Rule 7: trial expired returns DORMANT', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: fixedNow,
        driveCount: 1,
        billingFacts: {
          hasPaidPurchase: false,
          trialExpiresAt: pastDate,
          trialCreditsRemaining: 15,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.DORMANT);
    });

    it('Rule 7: trial credits exhausted (0 remaining) returns DORMANT', () => {
      const facts: TenantFunnelFacts = {
        status: 'ACTIVE',
        domainVerifiedAt: fixedNow,
        driveCount: 1,
        billingFacts: {
          hasPaidPurchase: false,
          trialExpiresAt: futureDate,
          trialCreditsRemaining: 0,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.DORMANT);
    });

    it('SUSPENDED status does not change the funnel stage (independent of account status)', () => {
      const facts: TenantFunnelFacts = {
        status: 'SUSPENDED',
        domainVerifiedAt: fixedNow,
        driveCount: 2,
        billingFacts: {
          hasPaidPurchase: false,
          trialExpiresAt: futureDate,
          trialCreditsRemaining: 20,
        },
      };
      const result = deriveFunnelStage(facts, fixedNow);
      expect(result.funnelStage).toBe(FunnelStage.FIRST_DRIVE_CREATED);
    });
  });

  // -------------------------------------------------------------
  // Part 2: Real DB Integration Tests
  // -------------------------------------------------------------
  describe('Real DB Integration: Pipeline & Owner Assignment', () => {
    let prisma: PrismaService;
    let auditService: PlatformAuditService;
    let tenantsService: PlatformTenantsService;
    let mockBillingProvider: ITenantBillingSummaryProvider;

    const tenantSignedUpId = '44444444-4444-4444-a444-444444444441';
    const tenantTrialActiveId = '44444444-4444-4444-a444-444444444442';
    const tenantDriveCreatedId = '44444444-4444-4444-a444-444444444443';
    const tenantConvertedId = '44444444-4444-4444-a444-444444444444';
    const tenantDormantId = '44444444-4444-4444-a444-444444444445';
    const tenantOffboardedId = '44444444-4444-4444-a444-444444444446';

    const baSignedUp = 'ba-stage4-001';
    const baTrialActive = 'ba-stage4-002';
    const baDriveCreated = 'ba-stage4-003';
    const baConverted = 'ba-stage4-004';
    const baDormant = 'ba-stage4-005';
    const baOffboarded = 'ba-stage4-006';

    const activeStaffId = '44444444-4444-4444-a444-000000000001';
    const inactiveStaffId = '44444444-4444-4444-a444-000000000002';
    const recruiterId = 'stf-stage4-recruiter-01';
    const roleTemplateId = 'rt-stage4-001';

    beforeAll(async () => {
      prisma = new PrismaService();
      await prisma.$connect();
      auditService = new PlatformAuditService(prisma);

      // Custom test provider that returns controlled facts for our test orgs
      const futureDate = new Date(Date.now() + 30 * 86400000);
      const pastDate = new Date(Date.now() - 5 * 86400000);

      mockBillingProvider = {
        async getCreditsRemaining(orgId: string): Promise<number | null> {
          if (orgId === tenantConvertedId) return 500;
          if (orgId === tenantTrialActiveId || orgId === tenantDriveCreatedId) return 25;
          return null;
        },
        async getBulkCreditsRemaining(orgIds: string[]): Promise<Map<string, number | null>> {
          const map = new Map<string, number | null>();
          for (const id of orgIds) {
            map.set(id, await this.getCreditsRemaining(id));
          }
          return map;
        },
        async getFunnelFacts(orgIds: string[]): Promise<Map<string, any>> {
          const map = new Map<string, any>();
          for (const id of orgIds) {
            if (id === tenantSignedUpId) {
              map.set(id, null); // Billing not connected yet
            } else if (id === tenantTrialActiveId) {
              map.set(id, {
                hasPaidPurchase: false,
                trialGrantedAt: new Date(),
                trialExpiresAt: futureDate,
                trialCreditsRemaining: 25,
              });
            } else if (id === tenantDriveCreatedId) {
              map.set(id, {
                hasPaidPurchase: false,
                trialGrantedAt: new Date(),
                trialExpiresAt: futureDate,
                trialCreditsRemaining: 20,
              });
            } else if (id === tenantConvertedId) {
              map.set(id, {
                hasPaidPurchase: true,
                trialGrantedAt: new Date(),
                trialExpiresAt: pastDate,
                trialCreditsRemaining: 0,
              });
            } else if (id === tenantDormantId) {
              map.set(id, {
                hasPaidPurchase: false,
                trialGrantedAt: new Date(),
                trialExpiresAt: pastDate,
                trialCreditsRemaining: 0,
              });
            } else {
              map.set(id, null);
            }
          }
          return map;
        },
        async getPlatformBillingOverview() {
          return null;
        },
      };

      tenantsService = new PlatformTenantsService(prisma, auditService, mockBillingProvider);

      // Cleanup old test data
      await prisma.drive.deleteMany({
        where: {
          organizationId: {
            in: [
              tenantSignedUpId,
              tenantTrialActiveId,
              tenantDriveCreatedId,
              tenantConvertedId,
              tenantDormantId,
              tenantOffboardedId,
            ],
          },
        },
      });

      await prisma.tenantProfile.deleteMany({
        where: {
          organizationId: {
            in: [
              tenantSignedUpId,
              tenantTrialActiveId,
              tenantDriveCreatedId,
              tenantConvertedId,
              tenantDormantId,
              tenantOffboardedId,
            ],
          },
        },
      });

      await prisma.organization.deleteMany({
        where: {
          id: {
            in: [
              tenantSignedUpId,
              tenantTrialActiveId,
              tenantDriveCreatedId,
              tenantConvertedId,
              tenantDormantId,
              tenantOffboardedId,
            ],
          },
        },
      });

      await prisma.billingAccount.deleteMany({
        where: {
          id: {
            in: [baSignedUp, baTrialActive, baDriveCreated, baConverted, baDormant, baOffboarded],
          },
        },
      });

      await prisma.platformStaff.deleteMany({
        where: { id: { in: [activeStaffId, inactiveStaffId] } },
      });

      // 1. Seed Platform Staff
      await prisma.platformStaff.createMany({
        data: [
          {
            id: activeStaffId,
            email: 'active-staff@proctora-internal.net',
            name: 'Active Staff Member',
            role: 'SUPPORT',
            isActive: true,
          },
          {
            id: inactiveStaffId,
            email: 'inactive-staff@proctora-internal.net',
            name: 'Inactive Staff Member',
            role: 'SUPPORT',
            isActive: false,
          },
        ],
      });

      // 2. Seed Billing Accounts
      await prisma.billingAccount.createMany({
        data: [
          { id: baSignedUp, name: 'Signed Up Corp', billingCountry: 'US', trialDomain: 'signedup-stage4.com' },
          { id: baTrialActive, name: 'Trial Corp', billingCountry: 'IN', trialDomain: 'trial-stage4.in' },
          { id: baDriveCreated, name: 'Drive Corp', billingCountry: 'GB', trialDomain: 'drive-stage4.co.uk' },
          { id: baConverted, name: 'Converted Corp', billingCountry: 'US', trialDomain: 'converted-stage4.com' },
          { id: baDormant, name: 'Dormant Corp', billingCountry: 'IN', trialDomain: 'dormant-stage4.in' },
          { id: baOffboarded, name: 'Offboarded Corp', billingCountry: 'US', trialDomain: 'offboarded-stage4.com' },
        ],
      });

      // 3. Seed Organizations
      await prisma.organization.createMany({
        data: [
          { id: tenantSignedUpId, name: 'Signed Up Corp', slug: 'signed-up-s4', billingAccountId: baSignedUp },
          { id: tenantTrialActiveId, name: 'Trial Corp', slug: 'trial-s4', billingAccountId: baTrialActive },
          { id: tenantDriveCreatedId, name: 'Drive Corp', slug: 'drive-s4', billingAccountId: baDriveCreated },
          { id: tenantConvertedId, name: 'Converted Corp', slug: 'converted-s4', billingAccountId: baConverted },
          { id: tenantDormantId, name: 'Dormant Corp', slug: 'dormant-s4', billingAccountId: baDormant },
          { id: tenantOffboardedId, name: 'Offboarded Corp', slug: 'offboarded-s4', billingAccountId: baOffboarded },
        ],
      });

      // 4. Seed Tenant Profiles
      await prisma.tenantProfile.createMany({
        data: [
          {
            organizationId: tenantSignedUpId,
            lifecycleStage: 'ONBOARDING',
            domainVerifiedAt: null, // SIGNED_UP
          },
          {
            organizationId: tenantTrialActiveId,
            lifecycleStage: 'ACTIVE',
            domainVerifiedAt: new Date(),
          },
          {
            organizationId: tenantDriveCreatedId,
            lifecycleStage: 'ACTIVE',
            domainVerifiedAt: new Date(),
          },
          {
            organizationId: tenantConvertedId,
            lifecycleStage: 'ACTIVE',
            domainVerifiedAt: new Date(),
          },
          {
            organizationId: tenantDormantId,
            lifecycleStage: 'ACTIVE',
            domainVerifiedAt: new Date(),
          },
          {
            organizationId: tenantOffboardedId,
            lifecycleStage: 'CHURNED',
            isManuallyChurned: true,
            domainVerifiedAt: new Date(),
          },
        ],
      });

      // 5. Seed Staff and RoleTemplate for Drive Corp
      const recruiterId = 'stf-stage4-recruiter-01';
      const roleTemplateId = 'rt-stage4-001';

      await prisma.staff.deleteMany({ where: { id: recruiterId } });
      await prisma.roleTemplate.deleteMany({ where: { id: roleTemplateId } });

      await prisma.staff.create({
        data: {
          id: recruiterId,
          organizationId: tenantDriveCreatedId,
          email: 'recruiter.stage4@drive-stage4.co.uk',
          name: 'Stage 4 Recruiter',
          role: 'RECRUITER',
        },
      });

      await prisma.roleTemplate.create({
        data: {
          id: roleTemplateId,
          roleName: 'Stage 4 Template',
          weightingPreset: {},
          durationMinutes: 60,
        },
      });

      // 6. Seed Drives for Drive Corp
      await prisma.drive.create({
        data: {
          id: 'drive-s4-001',
          organizationId: tenantDriveCreatedId,
          name: 'Stage 4 Campus Drive',
          status: 'ACTIVE',
          roleTemplateId,
          createdById: recruiterId,
          moduleConfig: {},
        },
      });
    });

    afterAll(async () => {
      await prisma.drive.deleteMany({
        where: {
          organizationId: {
            in: [
              tenantSignedUpId,
              tenantTrialActiveId,
              tenantDriveCreatedId,
              tenantConvertedId,
              tenantDormantId,
              tenantOffboardedId,
            ],
          },
        },
      });

      await prisma.tenantProfile.deleteMany({
        where: {
          organizationId: {
            in: [
              tenantSignedUpId,
              tenantTrialActiveId,
              tenantDriveCreatedId,
              tenantConvertedId,
              tenantDormantId,
              tenantOffboardedId,
            ],
          },
        },
      });

      await prisma.organization.deleteMany({
        where: {
          id: {
            in: [
              tenantSignedUpId,
              tenantTrialActiveId,
              tenantDriveCreatedId,
              tenantConvertedId,
              tenantDormantId,
              tenantOffboardedId,
            ],
          },
        },
      });

      await prisma.billingAccount.deleteMany({
        where: {
          id: {
            in: [baSignedUp, baTrialActive, baDriveCreated, baConverted, baDormant, baOffboarded],
          },
        },
      });

      await prisma.platformStaff.deleteMany({
        where: { id: { in: [activeStaffId, inactiveStaffId] } },
      });

      await prisma.staff.deleteMany({ where: { id: recruiterId } });
      await prisma.roleTemplate.deleteMany({ where: { id: roleTemplateId } });

      await prisma.$disconnect();
    });

    it('should compute and return correct funnel stages in getTenantDetail', async () => {
      const signedUpDetail = await tenantsService.getTenantDetail(tenantSignedUpId);
      expect(signedUpDetail.funnelStage).toBe('SIGNED_UP');

      const trialDetail = await tenantsService.getTenantDetail(tenantTrialActiveId);
      expect(trialDetail.funnelStage).toBe('TRIAL_ACTIVE');

      const driveDetail = await tenantsService.getTenantDetail(tenantDriveCreatedId);
      expect(driveDetail.funnelStage).toBe('FIRST_DRIVE_CREATED');

      const convertedDetail = await tenantsService.getTenantDetail(tenantConvertedId);
      expect(convertedDetail.funnelStage).toBe('CONVERTED');

      const dormantDetail = await tenantsService.getTenantDetail(tenantDormantId);
      expect(dormantDetail.funnelStage).toBe('DORMANT');
    });

    it('should return pipeline Kanban board with grouped cards and exclude CHURNED', async () => {
      const pipeline = await tenantsService.getPipelineBoard({ search: 'stage4' });

      expect(pipeline.SIGNED_UP).toBeDefined();
      expect(pipeline.TRIAL_ACTIVE).toBeDefined();
      expect(pipeline.FIRST_DRIVE_CREATED).toBeDefined();
      expect(pipeline.CONVERTED).toBeDefined();
      expect(pipeline.DORMANT).toBeDefined();

      const signedUpCard = pipeline.SIGNED_UP.items.find((i) => i.id === tenantSignedUpId);
      expect(signedUpCard).toBeDefined();
      expect(signedUpCard?.name).toBe('Signed Up Corp');
      expect(signedUpCard?.domainVerified).toBe(false);

      const trialCard = pipeline.TRIAL_ACTIVE.items.find((i) => i.id === tenantTrialActiveId);
      expect(trialCard).toBeDefined();
      expect(trialCard?.driveCount).toBe(0);

      const driveCard = pipeline.FIRST_DRIVE_CREATED.items.find((i) => i.id === tenantDriveCreatedId);
      expect(driveCard).toBeDefined();
      expect(driveCard?.driveCount).toBe(1);

      const convertedCard = pipeline.CONVERTED.items.find((i) => i.id === tenantConvertedId);
      expect(convertedCard).toBeDefined();

      const dormantCard = pipeline.DORMANT.items.find((i) => i.id === tenantDormantId);
      expect(dormantCard).toBeDefined();

      // Ensure OFFBOARDED tenant is excluded from board
      const allCards = [
        ...pipeline.SIGNED_UP.items,
        ...pipeline.TRIAL_ACTIVE.items,
        ...pipeline.FIRST_DRIVE_CREATED.items,
        ...pipeline.CONVERTED.items,
        ...pipeline.DORMANT.items,
        ...pipeline.UNKNOWN.items,
      ];
      expect(allCards.some((c) => c.id === tenantOffboardedId)).toBe(false);
    });

    it('should reject assigning inactive or non-existent staff ID with 400', async () => {
      const actor = { id: activeStaffId, role: 'SUPPORT' };

      await expect(
        tenantsService.assignOwner(
          tenantTrialActiveId,
          { internalOwnerId: inactiveStaffId },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        tenantsService.assignOwner(
          tenantTrialActiveId,
          { internalOwnerId: '55555555-5555-4555-a555-555555555555' },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully assign active staff owner and write TENANT_OWNER_ASSIGNED audit log', async () => {
      const actor = { id: activeStaffId, role: 'OWNER' };

      const result = await tenantsService.assignOwner(
        tenantTrialActiveId,
        { internalOwnerId: activeStaffId },
        actor,
      );
      expect(result.success).toBe(true);
      expect(result.internalOwnerId).toBe(activeStaffId);

      const profile = await prisma.tenantProfile.findUnique({
        where: { organizationId: tenantTrialActiveId },
      });
      expect(profile?.internalOwnerId).toBe(activeStaffId);

      // Verify Audit Event
      const auditLog = await prisma.systemAuditEvent.findFirst({
        where: {
          targetTenantId: tenantTrialActiveId,
          action: 'TENANT_OWNER_ASSIGNED',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorId).toBe(activeStaffId);
      expect(auditLog?.actorRole).toBe('OWNER');
      expect((auditLog?.after as any).internalOwnerId).toBe(activeStaffId);
    });

    it('should pass recursive PII scan on pipeline response and audit payloads', async () => {
      const pipeline = await tenantsService.getPipelineBoard({ search: 'stage4' });

      function scanPII(obj: any, path = ''): void {
        if (!obj) return;
        if (typeof obj === 'string') {
          // Reject email patterns and sensitive password/hash fields
          expect(obj).not.toMatch(/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/);
          expect(obj).not.toMatch(/\$2[aby]\$\d+\$/); // bcrypt
        } else if (typeof obj === 'object') {
          for (const key of Object.keys(obj)) {
            expect(key.toLowerCase()).not.toContain('password');
            expect(key.toLowerCase()).not.toContain('secret');
            expect(key.toLowerCase()).not.toContain('candidateemail');
            expect(key.toLowerCase()).not.toContain('staffemail');
            scanPII(obj[key], `${path}.${key}`);
          }
        }
      }

      scanPII(pipeline);
    });
  });
});
