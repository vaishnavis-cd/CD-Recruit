import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TENANT_BILLING_SUMMARY_PROVIDER,
  ITenantBillingSummaryProvider,
} from '../tenants/providers/tenant-billing-summary.provider';
import { deriveFunnelStage, FunnelStage } from '../tenants/utils/funnel-stage.util';
import {
  PlatformMetricsOverviewResponseDto,
  AttentionItemDto,
} from './dto/platform-metrics.dto';

@Injectable()
export class PlatformMetricsService {
  private readonly logger = new Logger(PlatformMetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_BILLING_SUMMARY_PROVIDER)
    private readonly billingSummaryProvider: ITenantBillingSummaryProvider,
  ) {}

  async getOverviewMetrics(): Promise<PlatformMetricsOverviewResponseDto> {
    const now = new Date();
    const nowIso = now.toISOString();

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Run parallel DB queries within budget (8 queries total)
    const [
      allOrganizations,
      driveGroups,
      drivesTotal,
      drivesActive,
      sessionsLiveNow,
      sessionsStarted24h,
      sessionsCompleted24h,
      draftsExpiringSoonCount,
      billingOverview,
    ] = await Promise.all([
      // 1. Fetch organization & profile summary for tenant metrics & attention
      this.prisma.organization.findMany({
        select: {
          id: true,
          createdAt: true,
          tenantProfile: {
            select: {
              lifecycleStage: true,
              isManuallySuspended: true,
              isManuallyChurned: true,
              domainVerifiedAt: true,
              walkthroughCompletedAt: true,
              internalOwnerId: true,
            },
          },
        },
      }),

      // 2. Drive counts by organization
      this.prisma.drive.groupBy({
        by: ['organizationId'],
        _count: { _all: true },
      }),

      // 3. Drives total
      this.prisma.drive.count(),

      // 4. Drives active
      this.prisma.drive.count({
        where: { status: 'ACTIVE' },
      }),

      // 5. Sessions live now (IN_PROGRESS)
      this.prisma.session.count({
        where: { status: 'IN_PROGRESS' },
      }),

      // 6. Sessions started last 24h
      this.prisma.session.count({
        where: { startedAt: { gte: twentyFourHoursAgo } },
      }),

      // 7. Sessions completed last 24h (submittedAt within 24h)
      this.prisma.session.count({
        where: {
          submittedAt: { gte: twentyFourHoursAgo },
        },
      }),

      // 8. Onboarding drafts expiring soon (status DRAFT, expires_at between now and now + 3d)
      this.prisma.onboardingDraft.count({
        where: {
          status: 'DRAFT',
          expiresAt: {
            gte: now,
            lte: threeDaysFromNow,
          },
        },
      }),

      // 9. Billing provider overview
      this.billingSummaryProvider.getPlatformBillingOverview(),
    ]);

    // Map drive counts
    const driveCountMap = new Map<string, number>();
    for (const group of driveGroups) {
      if (group.organizationId) {
        driveCountMap.set(group.organizationId, group._count._all);
      }
    }

    // Tenant status counts & attention calculation
    let totalTenants = allOrganizations.length;
    let createdLast7Days = 0;
    let createdLast30Days = 0;

    const byStatus = {
      PROVISIONING: 0,
      ACTIVE: 0,
      SUSPENDED: 0,
      OFFBOARDED: 0,
    };

    let suspendedTenantsCount = 0;
    let unverifiedDomainOver7dCount = 0;
    let noOwnerAssignedCount = 0;
    let walkthroughPendingOver14dCount = 0;

    const orgIds: string[] = [];

    for (const org of allOrganizations) {
      orgIds.push(org.id);
      const profile = org.tenantProfile;

      if (org.createdAt >= sevenDaysAgo) {
        createdLast7Days++;
      }
      if (org.createdAt >= thirtyDaysAgo) {
        createdLast30Days++;
      }

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

      byStatus[status]++;

      // Attention conditions
      if (status === 'SUSPENDED') {
        suspendedTenantsCount++;
      }

      if (status !== 'OFFBOARDED') {
        // Unverified domain > 7d (signed up / created > 7 days ago and domainVerifiedAt is null)
        if (!profile?.domainVerifiedAt && org.createdAt <= sevenDaysAgo) {
          unverifiedDomainOver7dCount++;
        }

        // No owner assigned
        if (!profile?.internalOwnerId) {
          noOwnerAssignedCount++;
        }

        // Walkthrough pending > 14d (domain verified > 14 days ago and walkthroughCompletedAt is null)
        if (
          profile?.domainVerifiedAt &&
          profile.domainVerifiedAt <= fourteenDaysAgo &&
          !profile.walkthroughCompletedAt
        ) {
          walkthroughPendingOver14dCount++;
        }
      }
    }

    // Process funnel stages in chunks of 500 to avoid N+1
    const byFunnelStage = {
      SIGNED_UP: 0,
      TRIAL_ACTIVE: 0,
      FIRST_DRIVE_CREATED: 0,
      CONVERTED: 0,
      DORMANT: 0,
      UNKNOWN: 0,
    };

    const BATCH_SIZE = 500;
    for (let i = 0; i < orgIds.length; i += BATCH_SIZE) {
      const batchIds = orgIds.slice(i, i + BATCH_SIZE);
      const funnelFactsMap = await this.billingSummaryProvider.getFunnelFacts(batchIds);

      for (const orgId of batchIds) {
        const org = allOrganizations.find((o) => o.id === orgId)!;
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

        switch (funnelResult.funnelStage) {
          case FunnelStage.SIGNED_UP:
            byFunnelStage.SIGNED_UP++;
            break;
          case FunnelStage.TRIAL_ACTIVE:
            byFunnelStage.TRIAL_ACTIVE++;
            break;
          case FunnelStage.FIRST_DRIVE_CREATED:
            byFunnelStage.FIRST_DRIVE_CREATED++;
            break;
          case FunnelStage.CONVERTED:
            byFunnelStage.CONVERTED++;
            break;
          case FunnelStage.DORMANT:
            byFunnelStage.DORMANT++;
            break;
          case FunnelStage.CHURNED:
          case FunnelStage.UNKNOWN:
          default:
            byFunnelStage.UNKNOWN++;
            break;
        }
      }
    }

    // Build attention list (only items with count > 0)
    const attention: AttentionItemDto[] = [];

    if (suspendedTenantsCount > 0) {
      attention.push({
        kind: 'SUSPENDED_TENANTS',
        severity: 'HIGH',
        count: suspendedTenantsCount,
        label: 'Suspended tenants',
        link: '/tenants?status=SUSPENDED',
      });
    }

    if (unverifiedDomainOver7dCount > 0) {
      attention.push({
        kind: 'UNVERIFIED_DOMAIN_OVER_7D',
        severity: 'MEDIUM',
        count: unverifiedDomainOver7dCount,
        label: 'Unverified domains (>7 days)',
        link: '/pipeline',
      });
    }

    if (noOwnerAssignedCount > 0) {
      attention.push({
        kind: 'NO_OWNER_ASSIGNED',
        severity: 'LOW',
        count: noOwnerAssignedCount,
        label: 'Tenants without assigned owner',
        link: '/tenants',
      });
    }

    if (walkthroughPendingOver14dCount > 0) {
      attention.push({
        kind: 'WALKTHROUGH_PENDING_OVER_14D',
        severity: 'MEDIUM',
        count: walkthroughPendingOver14dCount,
        label: 'Walkthrough pending (>14 days)',
        link: '/pipeline',
      });
    }

    if (draftsExpiringSoonCount > 0) {
      attention.push({
        kind: 'DRAFTS_EXPIRING_SOON',
        severity: 'HIGH',
        count: draftsExpiringSoonCount,
        label: 'Onboarding drafts expiring soon (<3 days)',
        link: '/onboarding',
      });
    }

    // Billing representation
    const billing = billingOverview
      ? {
          connected: true,
          pendingApprovals: billingOverview.pendingApprovals,
          trialsExpiringSoon: billingOverview.trialsExpiringSoon,
          reconciliationStatus: billingOverview.reconciliationStatus,
          lastReconciledAt: billingOverview.lastReconciledAt,
        }
      : {
          connected: false,
        };

    return {
      tenants: {
        total: totalTenants,
        byStatus,
        byFunnelStage,
        createdLast7Days,
        createdLast30Days,
      },
      drives: {
        active: drivesActive,
        total: drivesTotal,
      },
      sessions: {
        liveNow: sessionsLiveNow,
        startedLast24h: sessionsStarted24h,
        completedLast24h: sessionsCompleted24h,
      },
      attention,
      billing,
      infrastructure: {
        connected: false,
      },
      generatedAt: nowIso,
    };
  }
}
