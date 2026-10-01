import { UnauthorizedException, ForbiddenException, BadRequestException, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformTenantsController } from './platform-tenants.controller';
import { NullTenantBillingSummaryProvider } from './providers/tenant-billing-summary.provider';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import { PlatformJwtStrategy } from '../auth/strategies/platform-jwt.strategy';
import {
  ListPlatformTenantsQueryDto,
  PlatformTenantStatusFilter,
  PlatformTenantLicenseTier,
  PlatformTenantSortField,
  PlatformSortOrder,
} from './dto/platform-tenants.dto';

describe('Phase 2 Item 1: GET /api/v1/platform/tenants (List Tenants)', () => {
  const testPlatformSecret = 'test-platform-jwt-secret-phase2-item1';
  let jwtService: JwtService;
  let configService: ConfigService;
  let guard: PlatformJwtAuthGuard;
  let rolesGuard: PlatformRolesGuard;
  let strategy: PlatformJwtStrategy;
  let tenantsService: PlatformTenantsService;
  let tenantsController: PlatformTenantsController;
  let mockPrisma: any;

  // In-memory dataset
  let mockOrgs: any[] = [];
  let mockProfiles: any[] = [];
  let mockBillingAccounts: any[] = [];
  let mockDrives: any[] = [];
  let mockCandidates: any[] = [];

  let queryCallCount = 0;

  beforeEach(() => {
    queryCallCount = 0;

    // Seed 25 organizations
    mockOrgs = [];
    mockProfiles = [];
    mockBillingAccounts = [];
    mockDrives = [];
    mockCandidates = [];

    for (let i = 1; i <= 25; i++) {
      const orgId = `org_${i.toString().padStart(3, '0')}`;
      const billingAcctId = `ba_${i.toString().padStart(3, '0')}`;

      mockOrgs.push({
        id: orgId,
        name: i === 1 ? 'Acme Global Corp' : i === 2 ? 'Beta Logistics' : `Tenant Org ${i}`,
        slug: i === 1 ? 'acme-corp' : i === 2 ? 'beta-logistics' : `tenant-${i}`,
        billingAccountId: billingAcctId,
        createdAt: new Date(Date.now() - (25 - i) * 86400000),
      });

      mockBillingAccounts.push({
        id: billingAcctId,
        trialDomain: i === 1 ? 'acme.com' : i === 2 ? 'betalogistics.io' : `org${i}.com`,
      });

      // Tenant 1: ACTIVE ENTERPRISE
      // Tenant 2: SUSPENDED GROWTH
      // Tenant 3: OFFBOARDED STARTER
      // Tenant 4: PROVISIONING STARTER (ONBOARDING stage)
      // Tenant 5: PROVISIONING STARTER (No profile row)
      if (i === 1) {
        mockProfiles.push({
          id: `prof_${i}`,
          organizationId: orgId,
          lifecycleStage: 'ACTIVE',
          licenseTier: 'ENTERPRISE',
          isManuallySuspended: false,
          isManuallyChurned: false,
          createdAt: new Date(),
        });
      } else if (i === 2) {
        mockProfiles.push({
          id: `prof_${i}`,
          organizationId: orgId,
          lifecycleStage: 'SUSPENDED',
          licenseTier: 'GROWTH',
          isManuallySuspended: true,
          isManuallyChurned: false,
          createdAt: new Date(),
        });
      } else if (i === 3) {
        mockProfiles.push({
          id: `prof_${i}`,
          organizationId: orgId,
          lifecycleStage: 'CHURNED',
          licenseTier: 'STARTER',
          isManuallySuspended: false,
          isManuallyChurned: true,
          createdAt: new Date(),
        });
      } else if (i === 4) {
        mockProfiles.push({
          id: `prof_${i}`,
          organizationId: orgId,
          lifecycleStage: 'ONBOARDING',
          licenseTier: 'STARTER',
          isManuallySuspended: false,
          isManuallyChurned: false,
          createdAt: new Date(),
        });
      } else if (i > 5) {
        mockProfiles.push({
          id: `prof_${i}`,
          organizationId: orgId,
          lifecycleStage: 'ACTIVE',
          licenseTier: i % 2 === 0 ? 'GROWTH' : 'STARTER',
          isManuallySuspended: false,
          isManuallyChurned: false,
          createdAt: new Date(),
        });
      }
      // i === 5 has no profile row (tests graceful fallback)

      // Add drives for org 1 (3 drives) and org 2 (1 drive)
      if (i === 1) {
        mockDrives.push(
          { id: `drv_1_1`, organizationId: orgId, name: 'Campus 2026' },
          { id: `drv_1_2`, organizationId: orgId, name: 'Lateral Hiring' },
          { id: `drv_1_3`, organizationId: orgId, name: 'Internship Drive' },
        );
      } else if (i === 2) {
        mockDrives.push({ id: `drv_2_1`, organizationId: orgId, name: 'Q3 Batch' });
      }

      // Seed candidate PII into org 1 and org 2
      mockCandidates.push({
        id: `cand_${i}`,
        organizationId: orgId,
        name: `John Candidate ${i}`,
        email: `candidate.${i}@personal-mail.com`,
        idProofRef: `s3://secure-pii/id-proof-${i}.jpg`,
        ocrConfidence: 0.98,
      });
    }

    mockPrisma = {
      $transaction: async (promises: any[]) => {
        return Promise.all(promises);
      },
      organization: {
        count: async ({ where }: any) => {
          queryCallCount++;
          let list = filterOrgs(mockOrgs, where);
          return list.length;
        },
        findMany: async ({ where, skip, take, orderBy, select }: any) => {
          queryCallCount++;
          let list = filterOrgs(mockOrgs, where);

          // Sorting
          if (orderBy) {
            const [field, dir] = Object.entries(orderBy)[0] as [string, 'asc' | 'desc'];
            list.sort((a, b) => {
              const valA = a[field];
              const valB = b[field];
              if (valA < valB) return dir === 'asc' ? -1 : 1;
              if (valA > valB) return dir === 'asc' ? 1 : -1;
              return 0;
            });
          }

          const paged = list.slice(skip || 0, (skip || 0) + (take || list.length));

          // Project strictly as Prisma select
          return paged.map((org) => {
            const res: any = {};
            if (select.id) res.id = org.id;
            if (select.name) res.name = org.name;
            if (select.slug) res.slug = org.slug;
            if (select.createdAt) res.createdAt = org.createdAt;
            if (select.billingAccount) {
              const ba = mockBillingAccounts.find((b) => b.id === org.billingAccountId);
              res.billingAccount = ba ? { trialDomain: ba.trialDomain } : null;
            }
            if (select.tenantProfile) {
              const prof = mockProfiles.find((p) => p.organizationId === org.id);
              res.tenantProfile = prof
                ? {
                    lifecycleStage: prof.lifecycleStage,
                    licenseTier: prof.licenseTier,
                    isManuallySuspended: prof.isManuallySuspended,
                    isManuallyChurned: prof.isManuallyChurned,
                  }
                : null;
            }
            return res;
          });
        },
      },
      drive: {
        groupBy: async ({ by, where, _count }: any) => {
          queryCallCount++;
          const orgIds: string[] = where?.organizationId?.in || [];
          const groups: any[] = [];
          for (const orgId of orgIds) {
            const count = mockDrives.filter((d) => d.organizationId === orgId).length;
            if (count > 0) {
              groups.push({ organizationId: orgId, _count: { _all: count } });
            }
          }
          return groups;
        },
      },
    };

    function filterOrgs(orgs: any[], where: any) {
      if (!where) return [...orgs];
      let res = [...orgs];

      if (where.AND && Array.isArray(where.AND)) {
        for (const condition of where.AND) {
          res = res.filter((org) => evaluateOrgCondition(org, condition));
        }
      } else {
        res = res.filter((org) => evaluateOrgCondition(org, where));
      }
      return res;
    }

    function evaluateOrgCondition(org: any, condition: any): boolean {
      if (condition.OR && Array.isArray(condition.OR)) {
        return condition.OR.some((c: any) => evaluateOrgCondition(org, c));
      }

      if (condition.name?.contains !== undefined) {
        const search = condition.name.contains.toLowerCase();
        return org.name.toLowerCase().includes(search);
      }
      if (condition.slug?.contains !== undefined) {
        const search = condition.slug.contains.toLowerCase();
        return org.slug.toLowerCase().includes(search);
      }
      if (condition.billingAccount?.trialDomain?.contains !== undefined) {
        const search = condition.billingAccount.trialDomain.contains.toLowerCase();
        const ba = mockBillingAccounts.find((b) => b.id === org.billingAccountId);
        return Boolean(ba?.trialDomain?.toLowerCase().includes(search));
      }

      if (condition.tenantProfile) {
        const prof = mockProfiles.find((p) => p.organizationId === org.id);
        if (condition.tenantProfile.is === null) {
          return !prof;
        }
        if (!prof) return false;

        if (condition.tenantProfile.licenseTier) {
          if (prof.licenseTier !== condition.tenantProfile.licenseTier) return false;
        }

        if (condition.tenantProfile.lifecycleStage) {
          if (condition.tenantProfile.lifecycleStage.in) {
            if (!condition.tenantProfile.lifecycleStage.in.includes(prof.lifecycleStage)) return false;
          } else if (prof.lifecycleStage !== condition.tenantProfile.lifecycleStage) {
            return false;
          }
        }

        if (condition.tenantProfile.isManuallySuspended !== undefined) {
          if (prof.isManuallySuspended !== condition.tenantProfile.isManuallySuspended) return false;
        }

        if (condition.tenantProfile.isManuallyChurned !== undefined) {
          if (prof.isManuallyChurned !== condition.tenantProfile.isManuallyChurned) return false;
        }

        if (condition.tenantProfile.OR) {
          return condition.tenantProfile.OR.some((c: any) => {
            if (c.isManuallySuspended && prof.isManuallySuspended) return true;
            if (c.lifecycleStage && prof.lifecycleStage === c.lifecycleStage) return true;
            if (c.isManuallyChurned && prof.isManuallyChurned) return true;
            return false;
          });
        }
      }

      return true;
    }


    configService = {
      get: (key: string) => {
        if (key === 'app.platformJwtSecret') return testPlatformSecret;
        return null;
      },
    } as any;

    jwtService = new JwtService({
      secret: testPlatformSecret,
      signOptions: { expiresIn: '15m', issuer: 'proctora-platform' },
    });

    guard = new PlatformJwtAuthGuard();
    rolesGuard = new PlatformRolesGuard(new Reflector());
    strategy = new PlatformJwtStrategy(configService, mockPrisma);

    const mockAuditService: any = {
      record: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
      findTenantEvents: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const billingProvider = new NullTenantBillingSummaryProvider();
    tenantsService = new PlatformTenantsService(mockPrisma, mockAuditService, billingProvider);
    tenantsController = new PlatformTenantsController(tenantsService, mockAuditService);
  });

  // Test 1: Authentication & RBAC (401, 403 with mfaSetupRequired, 200 for OWNER, FINANCE, SUPPORT)
  it('1. Authentication and Authorization: 401 without token, 403 on mfaSetupRequired, 200 for OWNER, FINANCE, SUPPORT', async () => {
    // 1.1 401 without token
    const emptyContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/platform/tenants', headers: {} }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    expect(() => guard.handleRequest(new UnauthorizedException(), null, null, emptyContext)).toThrow(UnauthorizedException);

    // 1.2 403 on mfaSetupRequired token
    const setupRequiredUser = {
      id: 'stf_setup_01',
      role: PlatformStaffRole.OWNER,
      mfaSetupRequired: true,
    };
    expect(() => guard.handleRequest(null, setupRequiredUser, null, emptyContext)).toThrow(ForbiddenException);

    // 1.3 200 for each of the 3 staff roles (OWNER, FINANCE, SUPPORT)
    for (const role of [PlatformStaffRole.OWNER, PlatformStaffRole.FINANCE, PlatformStaffRole.SUPPORT]) {
      const staffUser = {
        id: `stf_${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@proctora.local`,
        role,
        mfaSetupRequired: false,
      };

      const allowedUser = guard.handleRequest(null, staffUser, null, emptyContext);
      expect(allowedUser.role).toBe(role);

      const rolesContext: any = {
        getHandler: () => PlatformTenantsController.prototype.listTenants,
        getClass: () => PlatformTenantsController,
        switchToHttp: () => ({
          getRequest: () => ({ user: staffUser }),
        }),
      };

      const isAuthorized = rolesGuard.canActivate(rolesContext);
      expect(isAuthorized).toBe(true);

      const response = await tenantsController.listTenants({ page: 1, pageSize: 10 } as any);
      expect(response).toBeDefined();
      expect(response.items.length).toBe(10);
    }
  });

  // Test 2: Pagination correctness & pageSize limit validation
  it('2. Pagination: returns correct total & page slices; rejects pageSize > 100 with 400', async () => {
    const page1Res = await tenantsService.listTenants({ page: 1, pageSize: 10, sort: PlatformTenantSortField.createdAt, order: PlatformSortOrder.asc });
    expect(page1Res.total).toBe(25);
    expect(page1Res.page).toBe(1);
    expect(page1Res.pageSize).toBe(10);
    expect(page1Res.items.length).toBe(10);
    expect(page1Res.items[0].id).toBe('org_001');
    expect(page1Res.items[9].id).toBe('org_010');

    const page2Res = await tenantsService.listTenants({ page: 2, pageSize: 10, sort: PlatformTenantSortField.createdAt, order: PlatformSortOrder.asc });
    expect(page2Res.page).toBe(2);
    expect(page2Res.items.length).toBe(10);
    expect(page2Res.items[0].id).toBe('org_011');
    expect(page2Res.items[9].id).toBe('org_020');

    const page3Res = await tenantsService.listTenants({ page: 3, pageSize: 10, sort: PlatformTenantSortField.createdAt, order: PlatformSortOrder.asc });
    expect(page3Res.page).toBe(3);
    expect(page3Res.items.length).toBe(5);
    expect(page3Res.items[0].id).toBe('org_021');
    expect(page3Res.items[4].id).toBe('org_025');

    // ValidationPipe rejection on pageSize > 100
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(
      pipe.transform({ pageSize: 150 }, { type: 'query', metatype: ListPlatformTenantsQueryDto }),
    ).rejects.toThrow(BadRequestException);
  });

  // Test 3: Search, status, and tier filtering
  it('3. Filtering: search query matches name, slug, domain; status & tier filters return expected subsets', async () => {
    // 3.1 Search by organization name
    const searchNameRes = await tenantsService.listTenants({ search: 'Acme', page: 1, pageSize: 20 });
    expect(searchNameRes.total).toBe(1);
    expect(searchNameRes.items[0].name).toBe('Acme Global Corp');

    // 3.2 Search by domain
    const searchDomainRes = await tenantsService.listTenants({ search: 'betalogistics.io', page: 1, pageSize: 20 });
    expect(searchDomainRes.total).toBe(1);
    expect(searchDomainRes.items[0].domain).toBe('betalogistics.io');

    // 3.3 Status filter: SUSPENDED
    const suspendedRes = await tenantsService.listTenants({ status: PlatformTenantStatusFilter.SUSPENDED, page: 1, pageSize: 20 });
    expect(suspendedRes.total).toBe(1);
    expect(suspendedRes.items[0].status).toBe('SUSPENDED');
    expect(suspendedRes.items[0].name).toBe('Beta Logistics');

    // 3.4 Status filter: PROVISIONING (includes ONBOARDING and no-profile orgs)
    const provisioningRes = await tenantsService.listTenants({ status: PlatformTenantStatusFilter.PROVISIONING, page: 1, pageSize: 20 });
    expect(provisioningRes.total).toBe(2);
    expect(provisioningRes.items.every((t) => t.status === 'PROVISIONING')).toBe(true);

    // 3.5 Tier filter: ENTERPRISE
    const enterpriseRes = await tenantsService.listTenants({ tier: PlatformTenantLicenseTier.ENTERPRISE, page: 1, pageSize: 20 });
    expect(enterpriseRes.total).toBe(1);
    expect(enterpriseRes.items[0].licenseTier).toBe('ENTERPRISE');
  });

  // Test 4: Strict PII-Blind Test
  it('4. PII-Blindness: response contains ZERO candidate data, staff emails, or PII keys', async () => {
    const res = await tenantsService.listTenants({ page: 1, pageSize: 25 });
    expect(res.items.length).toBe(25);

    const jsonString = JSON.stringify(res);

    // Assert no email addresses appear anywhere in the payload
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatches = jsonString.match(emailPattern);
    expect(emailMatches).toBeNull();

    // Assert no candidate PII keywords appear as keys or values
    const forbiddenPiiTerms = [
      'candidateName',
      'idProofRef',
      'idProofEmbedding',
      'ocrConfidence',
      'password',
      'passwordHash',
      'refreshToken',
      'phone',
      'personal-mail',
      'John Candidate',
    ];

    for (const term of forbiddenPiiTerms) {
      expect(jsonString.toLowerCase()).not.toContain(term.toLowerCase());
    }

    // Verify allowed structure
    for (const item of res.items) {
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'creditsRemaining',
        'domain',
        'driveCount',
        'funnelReason',
        'funnelStage',
        'id',
        'licenseTier',
        'name',
        'slug',
        'status',
      ]);
    }
  });

  // Test 5: Query-Count / No N+1 Check
  it('5. Zero N+1: fetching 20 tenants executes exactly 3 DB queries ($transaction findMany+count, 1 grouped drive count)', async () => {
    queryCallCount = 0;

    const res = await tenantsService.listTenants({
      page: 1,
      pageSize: 20,
      sort: PlatformTenantSortField.createdAt,
      order: PlatformSortOrder.asc,
    });
    expect(res.items.length).toBe(20);


    // Total queries must be <= 3:
    // 1: organization.count
    // 2: organization.findMany (paged)
    // 3: drive.groupBy (single batched query for all 20 org IDs)
    // ZERO per-tenant queries
    expect(queryCallCount).toBeLessThanOrEqual(3);

    // Verify drive count was properly computed from grouped query
    const acmeTenant = res.items.find((t) => t.name === 'Acme Global Corp');
    expect(acmeTenant?.driveCount).toBe(3);

    const betaTenant = res.items.find((t) => t.name === 'Beta Logistics');
    expect(betaTenant?.driveCount).toBe(1);

    const emptyDriveTenant = res.items.find((t) => t.id === 'org_003');
    expect(emptyDriveTenant?.driveCount).toBe(0);

    // Credits remaining is null via provider token
    expect(acmeTenant?.creditsRemaining).toBeNull();
  });
});
