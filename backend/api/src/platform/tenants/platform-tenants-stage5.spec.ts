import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { NullTenantBillingSummaryProvider } from './providers/tenant-billing-summary.provider';
import { LicenseTierEnum } from './dto/platform-tenants.dto';

describe('Stage 5: Real Postgres DB Integration - License Tier Mutation and Audit', () => {
  let prisma: PrismaService;
  let auditService: PlatformAuditService;
  let tenantsService: PlatformTenantsService;

  const testTenantId = '55555555-5555-4555-a555-555555555551';
  const testBillingAcctId = 'ba-stage5-001';

  const staffOwnerId = '55555555-5555-4555-a555-000000000001';
  const staffFinanceId = '55555555-5555-4555-a555-000000000002';
  const staffSupportId = '55555555-5555-4555-a555-000000000003';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    auditService = new PlatformAuditService(prisma);
    const billingProvider = new NullTenantBillingSummaryProvider();
    tenantsService = new PlatformTenantsService(prisma, auditService, billingProvider);

    // Clean up test data
    await prisma.tenantProfile.deleteMany({
      where: { organizationId: testTenantId },
    });
    await prisma.organization.deleteMany({
      where: { id: testTenantId },
    });
    await prisma.billingAccount.deleteMany({
      where: { id: testBillingAcctId },
    });
    await prisma.platformStaff.deleteMany({
      where: { id: { in: [staffOwnerId, staffFinanceId, staffSupportId] } },
    });

    // Seed Staff
    await prisma.platformStaff.createMany({
      data: [
        {
          id: staffOwnerId,
          email: 'stage5-owner@proctora-internal.net',
          name: 'Stage5 Owner',
          role: 'OWNER',
          isActive: true,
        },
        {
          id: staffFinanceId,
          email: 'stage5-finance@proctora-internal.net',
          name: 'Stage5 Finance',
          role: 'FINANCE',
          isActive: true,
        },
        {
          id: staffSupportId,
          email: 'stage5-support@proctora-internal.net',
          name: 'Stage5 Support',
          role: 'SUPPORT',
          isActive: true,
        },
      ],
    });

    // Seed Billing Account & Organization
    await prisma.billingAccount.create({
      data: {
        id: testBillingAcctId,
        name: 'Stage 5 Tenant Org',
        billingCountry: 'IN',
        trialDomain: 'stage5-tier-test.com',
      },
    });

    await prisma.organization.create({
      data: {
        id: testTenantId,
        name: 'Stage 5 Tenant Org',
        slug: 'stage5-tier-test',
        billingAccountId: testBillingAcctId,
      },
    });

    await prisma.tenantProfile.create({
      data: {
        organizationId: testTenantId,
        lifecycleStage: 'ACTIVE',
        licenseTier: 'STARTER',
      },
    });
  });

  afterAll(async () => {
    await prisma.tenantProfile.deleteMany({
      where: { organizationId: testTenantId },
    });
    await prisma.organization.deleteMany({
      where: { id: testTenantId },
    });
    await prisma.billingAccount.deleteMany({
      where: { id: testBillingAcctId },
    });
    await prisma.platformStaff.deleteMany({
      where: { id: { in: [staffOwnerId, staffFinanceId, staffSupportId] } },
    });
    await prisma.$disconnect();
  });

  it('should reject tier change with 404 if tenant does not exist', async () => {
    const actor = { id: staffOwnerId, role: 'OWNER' };
    await expect(
      tenantsService.updateLicenseTier(
        '99999999-9999-4999-a999-999999999999',
        {
          licenseTier: LicenseTierEnum.GROWTH,
          reason: 'Valid justification reason for non-existent org',
        },
        actor,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should successfully update license tier from STARTER to GROWTH and record LICENSE_TIER_CHANGED audit log', async () => {
    const actor = { id: staffOwnerId, role: 'OWNER' };
    const reason = 'Upgraded contract edition to Growth plan for Q4';
    const ticketRef = 'DEAL-9981';

    const result = await tenantsService.updateLicenseTier(
      testTenantId,
      {
        licenseTier: LicenseTierEnum.GROWTH,
        reason,
        ticketRef,
      },
      actor,
    );

    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.licenseTier).toBe('GROWTH');

    // Verify DB update
    const profile = await prisma.tenantProfile.findUnique({
      where: { organizationId: testTenantId },
    });
    expect(profile?.licenseTier).toBe('GROWTH');

    // Verify Audit Trail
    const auditLog = await prisma.systemAuditEvent.findFirst({
      where: {
        targetTenantId: testTenantId,
        action: 'LICENSE_TIER_CHANGED',
      },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.actorId).toBe(staffOwnerId);
    expect(auditLog?.actorRole).toBe('OWNER');
    expect((auditLog?.before as any).licenseTier).toBe('STARTER');
    expect((auditLog?.after as any).licenseTier).toBe('GROWTH');
    expect(auditLog?.reason).toBe(reason);
    expect(auditLog?.ticketRef).toBe(ticketRef);
  });

  it('should return changed: false and write NO audit row when updating to the SAME tier', async () => {
    const actor = { id: staffFinanceId, role: 'FINANCE' };
    const auditCountBefore = await prisma.systemAuditEvent.count({
      where: {
        targetTenantId: testTenantId,
        action: 'LICENSE_TIER_CHANGED',
      },
    });

    const result = await tenantsService.updateLicenseTier(
      testTenantId,
      {
        licenseTier: LicenseTierEnum.GROWTH,
        reason: 'Attempting to re-apply Growth tier',
      },
      actor,
    );

    expect(result.success).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.licenseTier).toBe('GROWTH');

    const auditCountAfter = await prisma.systemAuditEvent.count({
      where: {
        targetTenantId: testTenantId,
        action: 'LICENSE_TIER_CHANGED',
      },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it('should allow FINANCE and SUPPORT roles to change tier', async () => {
    // 1. FINANCE changes GROWTH -> ENTERPRISE
    const financeActor = { id: staffFinanceId, role: 'FINANCE' };
    const resFinance = await tenantsService.updateLicenseTier(
      testTenantId,
      {
        licenseTier: LicenseTierEnum.ENTERPRISE,
        reason: 'Finance approved Enterprise upgrade',
      },
      financeActor,
    );
    expect(resFinance.changed).toBe(true);
    expect(resFinance.licenseTier).toBe('ENTERPRISE');

    // 2. SUPPORT changes ENTERPRISE -> STARTER
    const supportActor = { id: staffSupportId, role: 'SUPPORT' };
    const resSupport = await tenantsService.updateLicenseTier(
      testTenantId,
      {
        licenseTier: LicenseTierEnum.STARTER,
        reason: 'Support adjusted tier per customer request',
      },
      supportActor,
    );
    expect(resSupport.changed).toBe(true);
    expect(resSupport.licenseTier).toBe('STARTER');
  });

  it('should pass recursive PII scan on license tier mutation response and audit logs', async () => {
    const detail = await tenantsService.getTenantDetail(testTenantId);
    const auditEvents = await prisma.systemAuditEvent.findMany({
      where: { targetTenantId: testTenantId },
    });

    function scanPII(obj: any, path = ''): void {
      if (!obj) return;
      if (typeof obj === 'string') {
        expect(obj).not.toMatch(/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/);
        expect(obj).not.toMatch(/\$2[aby]\$\d+\$/);
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

    scanPII(detail);
    scanPII(auditEvents);
  });
});
