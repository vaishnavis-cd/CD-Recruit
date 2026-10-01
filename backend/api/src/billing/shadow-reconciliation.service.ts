import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  SessionStatus,
  SessionKind,
  LedgerEntryType,
  PoolStatus,
  DrivePoolFallthrough,
} from "@prisma/client";

export type ShadowDiscrepancyType =
  | "MISSING_SHADOW_ENTRY"
  | "ORPHANED_SHADOW_ENTRY"
  | "DUPLICATE_SHADOW_ENTRY"
  | "INCORRECT_CREDIT_QUANTITY"
  | "INCORRECT_POOL_SELECTION"
  | "OUTCOME_MISMATCH"
  | "BALANCE_CORRUPTION"
  | "EVALUATION_FAILURE";

export interface ShadowDiscrepancy {
  discrepancyType: ShadowDiscrepancyType;
  sessionId?: string | null;
  billingAccountId?: string | null;
  driveId?: string | null;
  ledgerEntryId?: string | null;
  details: string;
  detectedAt: Date;
}

export interface ShadowReconciliationReport {
  totalEligibleSessions: number;
  totalShadowEntries: number;
  matchedCount: number;
  discrepancyCount: number;
  accuracyPercentage: number;
  discrepancies: ShadowDiscrepancy[];
  reconciledAt: Date;
}

@Injectable()
export class ShadowReconciliationService {
  private readonly logger = new Logger(ShadowReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Performs an authoritative reconciliation comparing expected shadow acquisitions
   * against recorded shadow ledger entries.
   * Repeatable, idempotent, and non-destructive.
   */
  async reconcileShadowBilling(options?: {
    since?: Date;
    billingAccountId?: string;
  }): Promise<ShadowReconciliationReport> {
    const detectedAt = new Date();
    const discrepancies: ShadowDiscrepancy[] = [];

    // 1. Fetch eligible sessions (started LIVE sessions)
    const sessionWhere: any = {
      status: {
        in: [
          SessionStatus.IN_PROGRESS,
          SessionStatus.DISCONNECTED,
          SessionStatus.SUBMITTED,
          SessionStatus.AUTO_SUBMITTED,
          SessionStatus.CLOSED,
          SessionStatus.ABANDONED,
        ],
      },
      kind: SessionKind.LIVE,
    };

    if (options?.billingAccountId) {
      sessionWhere.organization = { billingAccountId: options.billingAccountId };
    }

    if (options?.since) {
      sessionWhere.startedAt = { gte: options.since };
    }

    const eligibleSessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        drive: true,
      },
    });

    // 2. Fetch all shadow ledger entries
    const ledgerWhere: any = {
      shadow: true,
    };
    if (options?.billingAccountId) {
      ledgerWhere.billingAccountId = options.billingAccountId;
    }
    if (options?.since) {
      ledgerWhere.createdAt = { gte: options.since };
    }

    const shadowEntries = await this.prisma.creditLedgerEntry.findMany({
      where: ledgerWhere,
    });

    // Index shadow entries by sessionId and by idempotencyKey
    const entriesBySessionId = new Map<string, typeof shadowEntries>();
    const sessionIdsWithEntries = new Set<string>();

    for (const entry of shadowEntries) {
      if (entry.sessionId) {
        sessionIdsWithEntries.add(entry.sessionId);
        const list = entriesBySessionId.get(entry.sessionId) || [];
        list.push(entry);
        entriesBySessionId.set(entry.sessionId, list);
      }
    }

    let matchedCount = 0;

    // 3. Evaluate each eligible session
    for (const session of eligibleSessions) {
      const entries = entriesBySessionId.get(session.id) || [];

      if (entries.length === 0) {
        discrepancies.push({
          discrepancyType: "MISSING_SHADOW_ENTRY",
          sessionId: session.id,
          billingAccountId: null,
          driveId: session.driveId,
          details: `Session ${session.id} is an eligible LIVE session started at ${session.startedAt?.toISOString()} but has no shadow ledger entry.`,
          detectedAt,
        });
        continue;
      }

      if (entries.length > 1) {
        discrepancies.push({
          discrepancyType: "DUPLICATE_SHADOW_ENTRY",
          sessionId: session.id,
          billingAccountId: entries[0].billingAccountId,
          driveId: session.driveId,
          details: `Session ${session.id} has ${entries.length} duplicate shadow ledger entries: ${entries.map((e) => e.id).join(", ")}`,
          detectedAt,
        });
        continue;
      }

      // Exactly 1 shadow entry exists for this session
      const entry = entries[0];

      // Check credit quantity
      if (entry.amount !== -1) {
        discrepancies.push({
          discrepancyType: "INCORRECT_CREDIT_QUANTITY",
          sessionId: session.id,
          billingAccountId: entry.billingAccountId,
          driveId: session.driveId,
          ledgerEntryId: entry.id,
          details: `Shadow entry ${entry.id} for session ${session.id} has invalid amount ${entry.amount} (expected -1).`,
          detectedAt,
        });
      }

      // Check pool selection
      if (session.driveId) {
        // If drive had an active Drive Pass pool at the time of entry, verify it was selected
        const drivePool = await this.prisma.creditPool.findFirst({
          where: {
            billingAccountId: entry.billingAccountId,
            driveId: session.driveId,
            status: PoolStatus.ACTIVE,
            cachedRemaining: { gte: 1 },
            createdAt: { lte: entry.createdAt },
          },
        });

        if (drivePool && entry.creditPoolId !== drivePool.id) {
          discrepancies.push({
            discrepancyType: "INCORRECT_POOL_SELECTION",
            sessionId: session.id,
            billingAccountId: entry.billingAccountId,
            driveId: session.driveId,
            ledgerEntryId: entry.id,
            details: `Drive Pass pool ${drivePool.id} was active for drive ${session.driveId}, but shadow entry used pool ${entry.creditPoolId ?? "NONE"}.`,
            detectedAt,
          });
        }
      }

      matchedCount++;
    }

    // 4. Check for orphaned shadow entries (entries without corresponding eligible session)
    const eligibleSessionIds = new Set(eligibleSessions.map((s) => s.id));

    for (const entry of shadowEntries) {
      if (!entry.sessionId || !eligibleSessionIds.has(entry.sessionId)) {
        // Check if session exists at all
        let sessionDetails = "Session does not exist";
        if (entry.sessionId) {
          const s = await this.prisma.session.findUnique({
            where: { id: entry.sessionId },
          });
          if (s) {
            sessionDetails = `Session exists with kind=${s.kind}, status=${s.status}`;
          }
        }

        discrepancies.push({
          discrepancyType: "ORPHANED_SHADOW_ENTRY",
          sessionId: entry.sessionId,
          billingAccountId: entry.billingAccountId,
          driveId: entry.driveId,
          ledgerEntryId: entry.id,
          details: `Shadow ledger entry ${entry.id} has no matching eligible LIVE session. ${sessionDetails}`,
          detectedAt,
        });
      }
    }

    // 5. Check for balance corruption (verify shadow entries did NOT mutate real pool balances)
    const poolWhere: any = {};
    if (options?.billingAccountId) {
      poolWhere.billingAccountId = options.billingAccountId;
    }
    const allPools = await this.prisma.creditPool.findMany({ where: poolWhere });
    for (const pool of allPools) {
      const realSumAgg = await this.prisma.creditLedgerEntry.aggregate({
        where: {
          creditPoolId: pool.id,
          shadow: false,
        },
        _sum: { amount: true },
      });
      const realSum = realSumAgg._sum.amount ?? 0;
      if (pool.cachedRemaining !== realSum) {
        discrepancies.push({
          discrepancyType: "BALANCE_CORRUPTION",
          billingAccountId: pool.billingAccountId,
          ledgerEntryId: null,
          details: `Credit pool ${pool.id} cachedRemaining (${pool.cachedRemaining}) does not match non-shadow ledger sum (${realSum}).`,
          detectedAt,
        });
      }
    }

    const totalEligible = eligibleSessions.length;
    const discrepancyCount = discrepancies.length;
    const accuracyPercentage =
      totalEligible === 0
        ? 100.0
        : Math.max(0, Math.round(((totalEligible - discrepancyCount) / totalEligible) * 10000) / 100);

    const report: ShadowReconciliationReport = {
      totalEligibleSessions: totalEligible,
      totalShadowEntries: shadowEntries.length,
      matchedCount,
      discrepancyCount,
      accuracyPercentage,
      discrepancies,
      reconciledAt: detectedAt,
    };

    // Store immutable audit event of this reconciliation run
    try {
      let accountId = options?.billingAccountId;
      if (!accountId && eligibleSessions[0]?.organizationId) {
        const org = await this.prisma.organization.findUnique({
          where: { id: eligibleSessions[0].organizationId },
        });
        accountId = org?.billingAccountId;
      }
      if (accountId) {
        await this.prisma.billingAuditEvent.create({
          data: {
            billingAccountId: accountId,
            subjectType: "SHADOW_RECONCILIATION",
            subjectId: `recon_${detectedAt.getTime()}`,
            action: "EXECUTE_SHADOW_RECONCILIATION",
            after: report as any,
            actorId: "system",
          },
        });
      }
    } catch (auditErr: any) {
      this.logger.warn(`Failed to record reconciliation audit event: ${auditErr.message}`);
    }

    return report;
  }
}
