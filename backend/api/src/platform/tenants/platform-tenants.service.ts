import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import {
  ListPlatformTenantsQueryDto,
  ListPlatformTenantsResponseDto,
  PlatformTenantListItemDto,
  PlatformTenantStatusFilter,
  PlatformTenantSortField,
  PlatformSortOrder,
  TenantDetailResponseDto,
  TenantBriefResponseDto,
  SuspendTenantDto,
  RestoreTenantDto,
  WalkthroughUpdateDto,
  AssignTenantOwnerDto,
  PipelineQueryDto,
  PipelineBoardResponseDto,
  PipelineCardDto,
  UpdateLicenseTierDto,
} from './dto/platform-tenants.dto';
import {
  TENANT_BILLING_SUMMARY_PROVIDER,
  ITenantBillingSummaryProvider,
} from './providers/tenant-billing-summary.provider';
import { deriveFunnelStage } from './utils/funnel-stage.util';

@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: PlatformAuditService,
    @Inject(TENANT_BILLING_SUMMARY_PROVIDER)
    private readonly billingSummaryProvider: ITenantBillingSummaryProvider,
  ) {}

  /**
   * PII-blind, paginated list of tenants for Super Admin console.
   * Returns metadata, active status, license tier, drive counts, and credits remaining.
   */
  async listTenants(query: ListPlatformTenantsQueryDto): Promise<ListPlatformTenantsResponseDto> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const sortField = query.sort || PlatformTenantSortField.createdAt;
    const sortOrder = query.order || PlatformSortOrder.desc;

    // Construct Prisma where clause
    const whereConditions: any[] = [];

    // Search filter (name, slug, verified domain)
    if (query.search && query.search.trim().length > 0) {
      const searchTerm = query.search.trim();
      whereConditions.push({
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { slug: { contains: searchTerm, mode: 'insensitive' } },
          {
            billingAccount: {
              trialDomain: { contains: searchTerm, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    // Status filter
    if (query.status) {
      switch (query.status) {
        case PlatformTenantStatusFilter.PROVISIONING:
          whereConditions.push({
            OR: [
              { tenantProfile: { is: null } },
              {
                tenantProfile: {
                  lifecycleStage: 'ONBOARDING',
                  isManuallySuspended: false,
                  isManuallyChurned: false,
                },
              },
            ],
          });
          break;
        case PlatformTenantStatusFilter.ACTIVE:
          whereConditions.push({
            tenantProfile: {
              lifecycleStage: { in: ['ACTIVE', 'TRIAL', 'DORMANT'] },
              isManuallySuspended: false,
              isManuallyChurned: false,
            },
          });
          break;
        case PlatformTenantStatusFilter.SUSPENDED:
          whereConditions.push({
            tenantProfile: {
              OR: [
                { isManuallySuspended: true },
                { lifecycleStage: 'SUSPENDED' },
              ],
            },
          });
          break;
        case PlatformTenantStatusFilter.OFFBOARDED:
          whereConditions.push({
            tenantProfile: {
              OR: [
                { isManuallyChurned: true },
                { lifecycleStage: 'CHURNED' },
              ],
            },
          });
          break;
      }
    }

    // Tier filter
    if (query.tier) {
      whereConditions.push({
        tenantProfile: {
          licenseTier: query.tier,
        },
      });
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Execute paginated find and count in parallel transaction
    const [total, rawOrgs] = await this.prisma.$transaction([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: {
          [sortField]: sortOrder,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          billingAccount: {
            select: {
              trialDomain: true,
            },
          },
          tenantProfile: {
            select: {
              lifecycleStage: true,
              licenseTier: true,
              isManuallySuspended: true,
              isManuallyChurned: true,
              domainVerifiedAt: true,
              walkthroughCompletedAt: true,
            },
          },
        },
      }),
    ]);

    const orgIds = rawOrgs.map((org) => org.id);

    // Grouped drive count query (Zero N+1)
    let driveCountMap = new Map<string, number>();
    if (orgIds.length > 0) {
      const driveGroups = await this.prisma.drive.groupBy({
        by: ['organizationId'],
        where: {
          organizationId: { in: orgIds },
        },
        _count: {
          _all: true,
        },
      });

      for (const group of driveGroups) {
        if (group.organizationId) {
          driveCountMap.set(group.organizationId, group._count._all);
        }
      }
    }

    // Batch resolution via injectable provider (zero N+1)
    const [creditsMap, funnelFactsMap] = await Promise.all([
      this.billingSummaryProvider.getBulkCreditsRemaining(orgIds),
      this.billingSummaryProvider.getFunnelFacts(orgIds),
    ]);

    // Strictly whitelist map response fields
    const items: PlatformTenantListItemDto[] = rawOrgs.map((org) => {
      const profile = org.tenantProfile;
      let status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED' = 'PROVISIONING';
      let licenseTier = 'STARTER';

      if (profile) {
        licenseTier = profile.licenseTier || 'STARTER';
        if (profile.isManuallySuspended || profile.lifecycleStage === 'SUSPENDED') {
          status = 'SUSPENDED';
        } else if (profile.isManuallyChurned || profile.lifecycleStage === 'CHURNED') {
          status = 'OFFBOARDED';
        } else if (profile.lifecycleStage === 'ONBOARDING') {
          status = 'PROVISIONING';
        } else {
          status = 'ACTIVE';
        }
      }

      const driveCount = driveCountMap.get(org.id) || 0;
      const funnelResult = deriveFunnelStage({
        status,
        domainVerifiedAt: profile?.domainVerifiedAt || null,
        walkthroughCompletedAt: profile?.walkthroughCompletedAt || null,
        driveCount,
        billingFacts: funnelFactsMap.get(org.id),
      });

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.billingAccount?.trialDomain || null,
        status,
        licenseTier,
        createdAt: org.createdAt.toISOString(),
        driveCount,
        creditsRemaining: creditsMap.get(org.id) ?? null,
        funnelStage: funnelResult.funnelStage,
        funnelReason: funnelResult.reason || null,
      };
    });

    return {
      items,
      page,
      pageSize,
      total,
    };
  }

  /**
   * PII-blind full tenant details: overview, aggregated drives (max 50),
   * billing connection status, licensing, and retention overrides.
   */
  async getTenantDetail(id: string): Promise<TenantDetailResponseDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        appealWindowDaysOverride: true,
        billingAccount: {
          select: {
            trialDomain: true,
          },
        },
        tenantProfile: {
          select: {
            lifecycleStage: true,
            licenseTier: true,
            isManuallySuspended: true,
            isManuallyChurned: true,
            suspensionReason: true,
            suspendedAt: true,
            internalOwnerId: true,
            domainVerifiedAt: true,
            walkthroughCompletedAt: true,
            walkthroughChecklist: true,
            appealWindowDaysOverride: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('TENANT_NOT_FOUND');
    }

    const profile = org.tenantProfile;
    let status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED' = 'PROVISIONING';
    let licenseTier = 'STARTER';

    if (profile) {
      licenseTier = profile.licenseTier || 'STARTER';
      if (profile.isManuallySuspended || profile.lifecycleStage === 'SUSPENDED') {
        status = 'SUSPENDED';
      } else if (profile.isManuallyChurned || profile.lifecycleStage === 'CHURNED') {
        status = 'OFFBOARDED';
      } else if (profile.lifecycleStage === 'ONBOARDING') {
        status = 'PROVISIONING';
      } else {
        status = 'ACTIVE';
      }
    }

    // Drives query: count + newest 50 drives
    const [driveCount, drives] = await this.prisma.$transaction([
      this.prisma.drive.count({ where: { organizationId: id } }),
      this.prisma.drive.findMany({
        where: { organizationId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          status: true,
        },
      }),
    ]);

    const driveIds = drives.map((d) => d.id);
    const inviteMap = new Map<string, number>();
    const startedMap = new Map<string, number>();
    const completedMap = new Map<string, number>();

    if (driveIds.length > 0) {
      const [inviteGroups, startedGroups, completedGroups] = await Promise.all([
        this.prisma.invite.groupBy({
          by: ['driveId'],
          where: { driveId: { in: driveIds } },
          _count: { _all: true },
        }),
        this.prisma.session.groupBy({
          by: ['driveId'],
          where: {
            driveId: { in: driveIds },
            OR: [
              { status: { not: 'NOT_STARTED' } },
              { startedAt: { not: null } },
            ],
          },
          _count: { _all: true },
        }),
        this.prisma.session.groupBy({
          by: ['driveId'],
          where: {
            driveId: { in: driveIds },
            status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'CLOSED'] },
          },
          _count: { _all: true },
        }),
      ]);


      for (const g of inviteGroups) {
        if (g.driveId) inviteMap.set(g.driveId, g._count._all);
      }
      for (const g of startedGroups) {
        if (g.driveId) startedMap.set(g.driveId, g._count._all);
      }
      for (const g of completedGroups) {
        if (g.driveId) completedMap.set(g.driveId, g._count._all);
      }
    }

    const driveItems = drives.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      invitesSent: inviteMap.get(d.id) || 0,
      sessionsStarted: startedMap.get(d.id) || 0,
      sessionsCompleted: completedMap.get(d.id) || 0,
    }));

    // Billing summary lookup via provider
    const [billingCredits, funnelFactsMap] = await Promise.all([
      this.billingSummaryProvider.getCreditsRemaining(id),
      this.billingSummaryProvider.getFunnelFacts([id]),
    ]);

    const billingSection =
      billingCredits === null
        ? { connected: false }
        : { connected: true, summary: { creditsRemaining: billingCredits } };

    const funnelResult = deriveFunnelStage({
      status,
      domainVerifiedAt: profile?.domainVerifiedAt || null,
      walkthroughCompletedAt: profile?.walkthroughCompletedAt || null,
      driveCount,
      billingFacts: funnelFactsMap.get(id),
    });

    const appealWindow = profile?.appealWindowDaysOverride ?? org.appealWindowDaysOverride ?? null;

    return {
      overview: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        domain: org.billingAccount?.trialDomain || null,
        status,
        licenseTier,
        createdAt: org.createdAt.toISOString(),
        suspendedAt:
          status === 'SUSPENDED' && profile?.suspendedAt ? profile.suspendedAt.toISOString() : null,
        suspendedReason: status === 'SUSPENDED' ? profile?.suspensionReason || null : null,
        internalOwnerId: profile?.internalOwnerId || null,
        domainVerifiedAt: profile?.domainVerifiedAt ? profile.domainVerifiedAt.toISOString() : null,
        walkthroughCompletedAt: profile?.walkthroughCompletedAt
          ? profile.walkthroughCompletedAt.toISOString()
          : null,
        walkthroughChecklist: (profile?.walkthroughChecklist as Record<string, any>) || null,
      },
      drives: {
        driveCount,
        items: driveItems,
      },
      billing: billingSection,
      licensing: {
        licenseTier,
      },
      retention: {
        appealWindowDaysOverride: appealWindow,
      },
      funnelStage: funnelResult.funnelStage,
      funnelReason: funnelResult.reason || null,
    };
  }

  /**
   * Cross-team contract brief endpoint.
   * Returns exactly { id, name, slug, lifecycleStage, licenseTier, createdAt }.
   */
  async getTenantBrief(id: string): Promise<TenantBriefResponseDto> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        tenantProfile: {
          select: {
            lifecycleStage: true,
            licenseTier: true,
            isManuallySuspended: true,
            isManuallyChurned: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('TENANT_NOT_FOUND');
    }

    const profile = org.tenantProfile;
    let lifecycleStage = 'PROVISIONING';
    let licenseTier = 'STARTER';

    if (profile) {
      licenseTier = profile.licenseTier || 'STARTER';
      if (profile.isManuallySuspended || profile.lifecycleStage === 'SUSPENDED') {
        lifecycleStage = 'SUSPENDED';
      } else if (profile.isManuallyChurned || profile.lifecycleStage === 'CHURNED') {
        lifecycleStage = 'OFFBOARDED';
      } else if (profile.lifecycleStage === 'ONBOARDING') {
        lifecycleStage = 'PROVISIONING';
      } else {
        lifecycleStage = 'ACTIVE';
      }
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      lifecycleStage,
      licenseTier,
      createdAt: org.createdAt.toISOString(),
    };
  }

  /**
   * Suspend an ACTIVE tenant.
   * Atomic row lock (SELECT FOR UPDATE) prevents race conditions.
   * State rule: Only ACTIVE -> SUSPENDED (409 INVALID_STATUS_TRANSITION on any other state).
   */
  async suspendTenant(
    id: string,
    dto: SuspendTenantDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; status: string }> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT organization_id, lifecycle_stage, is_manually_suspended, is_manually_churned
        FROM platform.tenant_profile
        WHERE organization_id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        // Check if organization exists in public schema
        const org = await tx.organization.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!org) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }
        // Org without tenant_profile is in PROVISIONING state
        throw new ConflictException('INVALID_STATUS_TRANSITION');
      }

      const profile = rows[0];
      const isSuspended =
        profile.is_manually_suspended ||
        profile.lifecycle_stage === 'SUSPENDED';
      const isOffboarded =
        profile.is_manually_churned ||
        profile.lifecycle_stage === 'CHURNED';
      const isProvisioning = profile.lifecycle_stage === 'ONBOARDING';

      if (isSuspended || isOffboarded || isProvisioning) {
        throw new ConflictException('INVALID_STATUS_TRANSITION');
      }

      await tx.tenantProfile.update({
        where: { organizationId: id },
        data: {
          lifecycleStage: 'SUSPENDED',
          isManuallySuspended: true,
          suspendedAt: now,
          suspensionReason: dto.reason,
          suspendedById: actor.id,
        },
      });
    });

    // Audit TENANT_SUSPENDED outside the transaction
    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'TENANT',
      subjectId: id,
      targetTenantId: id,
      action: 'TENANT_SUSPENDED',
      before: { status: 'ACTIVE' },
      after: {
        status: 'SUSPENDED',
        suspendedAt: now.toISOString(),
        suspendedReason: dto.reason,
      },
      reason: dto.reason,
      ticketRef: dto.ticketRef,
      executionResult: 'SUCCESS',
    });

    return { success: true, status: 'SUSPENDED' };
  }

  /**
   * Restore a SUSPENDED tenant to ACTIVE.
   * Atomic row lock (SELECT FOR UPDATE) prevents race conditions.
   * State rule: Only SUSPENDED -> ACTIVE (409 INVALID_STATUS_TRANSITION on any other state).
   */
  async restoreTenant(
    id: string,
    dto: RestoreTenantDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; status: string }> {
    await this.prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT organization_id, lifecycle_stage, is_manually_suspended, is_manually_churned
        FROM platform.tenant_profile
        WHERE organization_id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        const org = await tx.organization.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!org) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }
        throw new ConflictException('INVALID_STATUS_TRANSITION');
      }

      const profile = rows[0];
      const isSuspended =
        profile.is_manually_suspended ||
        profile.lifecycle_stage === 'SUSPENDED';

      if (!isSuspended) {
        throw new ConflictException('INVALID_STATUS_TRANSITION');
      }

      await tx.tenantProfile.update({
        where: { organizationId: id },
        data: {
          lifecycleStage: 'ACTIVE',
          isManuallySuspended: false,
          suspendedAt: null,
          suspensionReason: null,
          suspendedById: null,
        },
      });
    });

    // Audit TENANT_RESTORED outside the transaction
    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'TENANT',
      subjectId: id,
      targetTenantId: id,
      action: 'TENANT_RESTORED',
      before: { status: 'SUSPENDED' },
      after: { status: 'ACTIVE' },
      reason: dto.reason,
      ticketRef: dto.ticketRef,
      executionResult: 'SUCCESS',
    });

    return { success: true, status: 'ACTIVE' };
  }

  /**
   * Update onboarding walkthrough checklist.
   * When all 3 checklist items are true, sets walkthroughCompletedAt to now.
   */
  async updateWalkthrough(
    tenantId: string,
    dto: WalkthroughUpdateDto,
    actor: { id: string; role: string },
  ) {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { organizationId: tenantId },
    });

    if (!profile) {
      throw new NotFoundException('TENANT_NOT_FOUND');
    }

    const currentChecklist =
      (profile.walkthroughChecklist as Record<string, boolean>) || {};

    const updatedChecklist = {
      kickoffCallDone:
        dto.kickoffCallDone !== undefined
          ? dto.kickoffCallDone
          : !!currentChecklist.kickoffCallDone,
      sampleDriveDeployed:
        dto.sampleDriveDeployed !== undefined
          ? dto.sampleDriveDeployed
          : !!currentChecklist.sampleDriveDeployed,
      adminTrained:
        dto.adminTrained !== undefined
          ? dto.adminTrained
          : !!currentChecklist.adminTrained,
    };

    const isAllCompleted =
      updatedChecklist.kickoffCallDone &&
      updatedChecklist.sampleDriveDeployed &&
      updatedChecklist.adminTrained;

    const walkthroughCompletedAt = isAllCompleted ? new Date() : null;

    const updatedProfile = await this.prisma.tenantProfile.update({
      where: { organizationId: tenantId },
      data: {
        walkthroughChecklist: updatedChecklist,
        walkthroughCompletedAt,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'TENANT',
      subjectId: tenantId,
      targetTenantId: tenantId,
      action: 'WALKTHROUGH_UPDATED',
      before: {
        checklist: currentChecklist,
        completedAt: profile.walkthroughCompletedAt?.toISOString() || null,
      },
      after: {
        checklist: updatedChecklist,
        completedAt: walkthroughCompletedAt?.toISOString() || null,
      },
      executionResult: 'SUCCESS',
    });

    return {
      walkthroughChecklist: updatedProfile.walkthroughChecklist,
      walkthroughCompletedAt: updatedProfile.walkthroughCompletedAt,
    };
  }

  /**
   * Assign or unassign internal platform staff owner for a tenant.
   * Validates staff ID belongs to an active staff member.
   */
  async assignOwner(
    tenantId: string,
    dto: AssignTenantOwnerDto,
    actor: { id: string; role: string },
  ) {
    if (dto.internalOwnerId) {
      const staff = await this.prisma.platformStaff.findUnique({
        where: { id: dto.internalOwnerId },
        select: { id: true, isActive: true },
      });
      if (!staff || !staff.isActive) {
        throw new BadRequestException('INVALID_STAFF_ID');
      }
    }

    const profile = await this.prisma.tenantProfile.findUnique({
      where: { organizationId: tenantId },
    });

    if (!profile) {
      const org = await this.prisma.organization.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!org) {
        throw new NotFoundException('TENANT_NOT_FOUND');
      }
      await this.prisma.tenantProfile.create({
        data: {
          organizationId: tenantId,
          internalOwnerId: dto.internalOwnerId || null,
        },
      });
    } else {
      await this.prisma.tenantProfile.update({
        where: { organizationId: tenantId },
        data: {
          internalOwnerId: dto.internalOwnerId || null,
        },
      });
    }

    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'TENANT',
      subjectId: tenantId,
      targetTenantId: tenantId,
      action: 'TENANT_OWNER_ASSIGNED',
      before: { internalOwnerId: profile?.internalOwnerId || null },
      after: { internalOwnerId: dto.internalOwnerId || null },
      executionResult: 'SUCCESS',
    });

    return { success: true, internalOwnerId: dto.internalOwnerId || null };
  }

  /**
   * Pipeline Kanban board grouping organizations by pure deriveFunnelStage.
   * Excludes CHURNED / OFFBOARDED organizations.
   * Batch queries, no N+1. Max 50 items per column.
   */
  async getPipelineBoard(query: PipelineQueryDto): Promise<PipelineBoardResponseDto> {
    const whereConditions: any[] = [];

    // Exclude offboarded / churned
    whereConditions.push({
      OR: [
        { tenantProfile: { is: null } },
        {
          tenantProfile: {
            isManuallyChurned: false,
            lifecycleStage: { not: 'CHURNED' },
          },
        },
      ],
    });

    if (query.owner) {
      whereConditions.push({
        tenantProfile: {
          internalOwnerId: query.owner,
        },
      });
    }

    if (query.country) {
      whereConditions.push({
        billingAccount: {
          billingCountry: query.country,
        },
      });
    }

    if (query.search && query.search.trim().length > 0) {
      const searchTerm = query.search.trim();
      whereConditions.push({
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { slug: { contains: searchTerm, mode: 'insensitive' } },
          {
            billingAccount: {
              trialDomain: { contains: searchTerm, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    const where = { AND: whereConditions };

    const orgs = await this.prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        billingAccount: {
          select: {
            trialDomain: true,
          },
        },
        tenantProfile: {
          select: {
            lifecycleStage: true,
            isManuallySuspended: true,
            isManuallyChurned: true,
            internalOwnerId: true,
            domainVerifiedAt: true,
            walkthroughCompletedAt: true,
          },
        },
      },
    });

    const orgIds = orgs.map((o) => o.id);

    let driveCountMap = new Map<string, number>();
    if (orgIds.length > 0) {
      const driveGroups = await this.prisma.drive.groupBy({
        by: ['organizationId'],
        where: { organizationId: { in: orgIds } },
        _count: { _all: true },
      });
      for (const g of driveGroups) {
        if (g.organizationId) {
          driveCountMap.set(g.organizationId, g._count._all);
        }
      }
    }

    const funnelFactsMap = await this.billingSummaryProvider.getFunnelFacts(orgIds);

    const columns: Record<string, { count: number; items: PipelineCardDto[] }> = {
      SIGNED_UP: { count: 0, items: [] },
      TRIAL_ACTIVE: { count: 0, items: [] },
      FIRST_DRIVE_CREATED: { count: 0, items: [] },
      CONVERTED: { count: 0, items: [] },
      DORMANT: { count: 0, items: [] },
      UNKNOWN: { count: 0, items: [] },
    };

    for (const org of orgs) {
      const profile = org.tenantProfile;
      let status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED' = 'PROVISIONING';
      if (profile) {
        if (profile.isManuallySuspended || profile.lifecycleStage === 'SUSPENDED') {
          status = 'SUSPENDED';
        } else if (profile.isManuallyChurned || profile.lifecycleStage === 'CHURNED') {
          status = 'OFFBOARDED';
        } else if (profile.lifecycleStage === 'ONBOARDING') {
          status = 'PROVISIONING';
        } else {
          status = 'ACTIVE';
        }
      }

      const driveCount = driveCountMap.get(org.id) || 0;
      const funnelResult = deriveFunnelStage({
        status,
        domainVerifiedAt: profile?.domainVerifiedAt || null,
        walkthroughCompletedAt: profile?.walkthroughCompletedAt || null,
        driveCount,
        billingFacts: funnelFactsMap.get(org.id),
      });

      if (funnelResult.funnelStage === 'CHURNED') {
        continue;
      }

      const card: PipelineCardDto = {
        id: org.id,
        name: org.name,
        domain: org.billingAccount?.trialDomain || null,
        domainVerified: !!profile?.domainVerifiedAt,
        internalOwnerId: profile?.internalOwnerId || null,
        createdAt: org.createdAt.toISOString(),
        driveCount,
        walkthroughDone: !!profile?.walkthroughCompletedAt,
      };

      const targetColumn = columns[funnelResult.funnelStage] || columns.UNKNOWN;
      targetColumn.count++;
      if (targetColumn.items.length < 50) {
        targetColumn.items.push(card);
      }
    }

    return {
      SIGNED_UP: columns.SIGNED_UP,
      TRIAL_ACTIVE: columns.TRIAL_ACTIVE,
      FIRST_DRIVE_CREATED: columns.FIRST_DRIVE_CREATED,
      CONVERTED: columns.CONVERTED,
      DORMANT: columns.DORMANT,
      UNKNOWN: columns.UNKNOWN,
    };
  }

  /**
   * Update license tier label.
   * Read-modify-write in one transaction with row lock.
   * If unchanged: returns changed: false and writes no audit log.
   */
  async updateLicenseTier(
    id: string,
    dto: UpdateLicenseTierDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; changed: boolean; licenseTier: string }> {
    let changed = false;
    let beforeTier = 'STARTER';

    await this.prisma.$transaction(async (tx) => {
      const rows: any[] = await tx.$queryRaw`
        SELECT organization_id, license_tier
        FROM platform.tenant_profile
        WHERE organization_id = ${id}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        const org = await tx.organization.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!org) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }
        beforeTier = 'STARTER';
        if (dto.licenseTier !== beforeTier) {
          changed = true;
          await tx.tenantProfile.create({
            data: {
              organizationId: id,
              licenseTier: dto.licenseTier as any,
            },
          });
        }
      } else {
        beforeTier = rows[0].license_tier || 'STARTER';
        if (beforeTier !== dto.licenseTier) {
          changed = true;
          await tx.tenantProfile.update({
            where: { organizationId: id },
            data: {
              licenseTier: dto.licenseTier as any,
            },
          });
        }
      }
    });

    if (changed) {
      await this.auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: 'TENANT',
        subjectId: id,
        targetTenantId: id,
        action: 'LICENSE_TIER_CHANGED',
        before: { licenseTier: beforeTier },
        after: { licenseTier: dto.licenseTier },
        reason: dto.reason,
        ticketRef: dto.ticketRef,
        executionResult: 'SUCCESS',
      });
    }

    return {
      success: true,
      changed,
      licenseTier: dto.licenseTier,
    };
  }
}

