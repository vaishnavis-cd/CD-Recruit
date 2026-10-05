import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger.service";
import { PoolService } from "./pool.service";
import {
  Prisma,
  SessionKind,
  SessionStatus,
  LedgerEntryType,
  LedgerReason,
  PoolStatus,
} from "@prisma/client";
import { DrivePoolFallthrough, HoldReason } from "@cd-recruit/shared-types";

export interface CreditEnforcementResult {
  outcome: "STARTED" | "HELD" | "ALREADY_PROCESSED" | "WAIVED_NON_LIVE" | "FAILED";
  poolId?: string | null;
  balanceRemaining?: number | null;
  ledgerEntryId?: string | null;
  heldAt?: Date | null;
  holdReason?: HoldReason | null;
  message?: string;
  useOverdraft?: boolean;
}

export interface DriveCapacityStatus {
  driveId: string;
  billingAccountId: string;
  hasActiveDrivePass: boolean;
  drivePassRemaining: number;
  drivePassExpiresAt: Date | null;
  fallthroughMode: DrivePoolFallthrough;
  activeTalentReserveRemaining: number;
  queuedPoolCount: number;
  heldCandidateCount: number;
  canAcceptCandidates: boolean;
  statusSummary: "AVAILABLE" | "LOW_BALANCE" | "CAPACITY_EXHAUSTED";
}

@Injectable()
export class CreditEnforcementService {
  private readonly logger = new Logger(CreditEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly poolService: PoolService,
  ) {}

  /**
   * Authoritative Phase 3 Session Credit Enforcement Gateway.
   * Executes Two-Tier High-Concurrency Begin Engine (Section 4 & Section 7.3):
   * 1. Fast Path: Single SQL roundtrip conditional pool decrement (sub-2ms).
   * 2. Slow Path: Executed on pool boundary under BillingAccount advisory lock.
   * 3. HELD Flow: Placed in CAPACITY hold when pools and overdraft are exhausted.
   */
  async evaluateAndAcquireCredit(
    sessionId: string,
    externalTx?: Prisma.TransactionClient,
  ): Promise<CreditEnforcementResult> {
    const db = externalTx || this.prisma;

    // Step 1: Fetch session and verify eligibility
    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: { drive: true, organization: true },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Step 2: Non-LIVE sessions (PREVIEW / SANDBOX) are 100% free / waived
    if (session.kind !== SessionKind.LIVE) {
      this.logger.log(`Session ${sessionId} is kind ${session.kind} — starting with zero charge.`);
      return {
        outcome: "WAIVED_NON_LIVE",
        message: "Preview or Sandbox session started with zero charge",
      };
    }

    // Step 3: Check idempotency — if an acquisition entry already exists, do not double-bill
    const idempotencyKey = `acquire:${sessionId}`;
    const existingEntry = await db.creditLedgerEntry.findUnique({
      where: { idempotencyKey },
    });

    if (existingEntry) {
      this.logger.log(`Session ${sessionId} already processed with ledger entry ${existingEntry.id}.`);
      return {
        outcome: "ALREADY_PROCESSED",
        poolId: existingEntry.creditPoolId,
        balanceRemaining: existingEntry.balanceAfter,
        ledgerEntryId: existingEntry.id,
      };
    }

    // Step 4: Resolve organization and billing account
    const billingAccountId = session.organization?.billingAccountId;
    if (!billingAccountId) {
      throw new ConflictException(
        `Organization ${session.organizationId} does not have an attached BillingAccount.`,
      );
    }

    // Step 5: Execute Fast Path via PostgreSQL billing_begin function or direct fast-path query
    try {
      const fastResult = await this.executeFastPath(sessionId, db);
      if (fastResult.outcome === "STARTED") {
        return fastResult;
      }
    } catch (fastErr: any) {
      // If error code is P0001 (NEEDS_SLOW_PATH), escalate to slow path
      const msg = fastErr.message || "";
      if (!msg.includes("NEEDS_SLOW_PATH") && !msg.includes("P0001")) {
        this.logger.warn(`Unexpected Fast Path error for session ${sessionId}: ${msg}`);
      }
    }

    // Step 6: Execute Slow Path under BillingAccount advisory lock
    return this.executeSlowPath(session, billingAccountId, externalTx);
  }

  /**
   * Fast Path: Uncontended pool decrement via direct SQL atomic claim.
   */
  private async executeFastPath(
    sessionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CreditEnforcementResult> {
    const results = await tx.$queryRaw<
      Array<{ outcome: string; pool_id: string | null; balance_remaining: number }>
    >`SELECT * FROM billing_begin(${sessionId}::uuid, 'enforce'::text)`;

    const first = results[0];
    if (first && first.outcome === "STARTED") {
      return {
        outcome: "STARTED",
        poolId: first.pool_id,
        balanceRemaining: first.balance_remaining,
      };
    } else if (first && first.outcome === "ALREADY_STARTED") {
      return {
        outcome: "ALREADY_PROCESSED",
      };
    }

    throw new Error("NEEDS_SLOW_PATH");
  }

  /**
   * Slow Path: Evaluates pool promotion, Talent Reserve fallthrough, overdraft,
   * or transitions session to HELD state under BillingAccount advisory lock.
   */
  private async executeSlowPath(
    session: any,
    billingAccountId: string,
    externalTx?: Prisma.TransactionClient,
  ): Promise<CreditEnforcementResult> {
    const execute = async (tx: Prisma.TransactionClient): Promise<CreditEnforcementResult> => {
      // 1. Acquire account-level transaction lock (Rule R4)
      await this.ledgerService.acquireAccountLock(tx, billingAccountId);

      const now = new Date();

      // 2. Housekeeping: expire any expired pools
      const expiredPools = await tx.creditPool.findMany({
        where: {
          billingAccountId,
          status: PoolStatus.ACTIVE,
          expiresAt: { lte: now },
        },
      });

      for (const expPool of expiredPools) {
        if (expPool.cachedRemaining > 0) {
          await this.ledgerService.recordEntry(tx, {
            billingAccountId,
            organizationId: session.organizationId,
            creditPoolId: expPool.id,
            entryType: LedgerEntryType.EXPIRE,
            amount: -expPool.cachedRemaining,
            reason: LedgerReason.POOL_EXPIRED,
            idempotencyKey: `expire:pool:${expPool.id}:${now.getTime()}`,
            actorId: "system",
            shadow: false,
          });
        }
        await tx.creditPool.update({
          where: { id: expPool.id },
          data: { status: PoolStatus.EXPIRED },
        });
      }

      // 3. Priority Tier 1: Drive Pass Pool bound to this drive
      let selectedPool: any = null;
      if (session.driveId) {
        selectedPool = await tx.creditPool.findFirst({
          where: {
            billingAccountId,
            driveId: session.driveId,
            status: PoolStatus.ACTIVE,
            cachedRemaining: { gte: 1 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        });
      }

      // 4. Priority Tier 2: General Talent Reserve / Enterprise Fallthrough
      const allowFallthrough =
        !session.driveId ||
        !session.drive ||
        session.drive.fallthrough === DrivePoolFallthrough.ALLOW;

      if (!selectedPool && allowFallthrough) {
        // Check for existing ACTIVE general pool with balance
        selectedPool = await tx.creditPool.findFirst({
          where: {
            billingAccountId,
            driveId: null,
            status: PoolStatus.ACTIVE,
            cachedRemaining: { gte: 1 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: [{ queueOrder: "asc" }, { createdAt: "asc" }],
        });

        // If no active pool with balance, try auto-promoting the next queued pool (Jio Model)
        if (!selectedPool) {
          const nextQueued = await tx.creditPool.findFirst({
            where: {
              billingAccountId,
              driveId: null,
              status: PoolStatus.QUEUED,
              cachedRemaining: { gte: 1 },
            },
            orderBy: [{ queueOrder: "asc" }, { createdAt: "asc" }],
          });

          if (nextQueued) {
            const clockStartedAt = nextQueued.clockStartedAt || now;
            let expiresAt = nextQueued.expiresAt;
            if (!expiresAt && nextQueued.validityDays) {
              expiresAt = new Date(clockStartedAt.getTime() + nextQueued.validityDays * 24 * 60 * 60 * 1000);
            }

            selectedPool = await tx.creditPool.update({
              where: { id: nextQueued.id },
              data: {
                status: PoolStatus.ACTIVE,
                activatedAt: now,
                clockStartedAt,
                expiresAt,
              },
            });
            this.logger.log(`Promoted queued pool ${selectedPool.id} to ACTIVE.`);
          }
        }
      }

      // 5. If a funded pool is selected, acquire credit and return STARTED
      if (selectedPool) {
        const idempotencyKey = `acquire:${session.id}`;
        const ledgerEntry = await this.ledgerService.recordEntry(tx, {
          billingAccountId,
          organizationId: session.organizationId,
          creditPoolId: selectedPool.id,
          entryType: LedgerEntryType.CONSUME,
          amount: -1,
          sessionId: session.id,
          driveId: session.driveId,
          reason: LedgerReason.ATTEMPT_START,
          idempotencyKey,
          actorId: "system",
          shadow: false,
        });

        // Set session status to IN_PROGRESS
        await tx.session.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.IN_PROGRESS,
            startedAt: now,
            lastHeartbeatAt: now,
            lastActivityAt: now,
            heldAt: null,
            holdReason: null,
          },
        });

        return {
          outcome: "STARTED",
          poolId: selectedPool.id,
          balanceRemaining: ledgerEntry.balanceAfter,
          ledgerEntryId: ledgerEntry.id,
        };
      }

      // 6. Priority Tier 3: Pre-contracted Overdraft Exception
      const account = await tx.billingAccount.findUniqueOrThrow({
        where: { id: billingAccountId },
      });

      if (account.overdraftLimit > 0 && account.overdraftUsed < account.overdraftLimit) {
        const idempotencyKey = `acquire:${session.id}`;
        const ledgerEntry = await this.ledgerService.recordEntry(tx, {
          billingAccountId,
          organizationId: session.organizationId,
          creditPoolId: null,
          entryType: LedgerEntryType.OVERDRAFT,
          amount: -1,
          sessionId: session.id,
          driveId: session.driveId,
          reason: LedgerReason.OVERDRAFT_USED,
          idempotencyKey,
          actorId: "system",
          shadow: false,
        });

        await tx.session.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.IN_PROGRESS,
            startedAt: now,
            lastHeartbeatAt: now,
            lastActivityAt: now,
            heldAt: null,
            holdReason: null,
          },
        });

        return {
          outcome: "STARTED",
          useOverdraft: true,
          poolId: null,
          balanceRemaining: null,
          ledgerEntryId: ledgerEntry.id,
        };
      }

      // 7. Priority Tier 4: Capacity Exhaustion & HELD Lifecycle (Section 7.3)
      await tx.session.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.NOT_STARTED,
          heldAt: now,
          holdReason: HoldReason.CAPACITY,
        },
      });

      // Record Capacity Hold Audit Event
      await tx.billingAuditEvent.create({
        data: {
          billingAccountId,
          subjectType: "SESSION",
          subjectId: session.id,
          action: "SESSION_HELD_CAPACITY",
          after: {
            sessionId: session.id,
            driveId: session.driveId,
            candidateId: session.candidateId,
            heldAt: now.toISOString(),
            holdReason: "CAPACITY",
          },
          actorId: "system",
        },
      });

      this.logger.warn(
        `[CapacityExhausted] Session ${session.id} placed in HELD state. Notification dispatched to recruiter.`,
      );

      return {
        outcome: "HELD",
        heldAt: now,
        holdReason: HoldReason.CAPACITY,
        message:
          "There is a brief delay starting your assessment session. Your recruiter has been notified. Your timer has not started and you will not lose any time.",
      };
    };

    return externalTx ? execute(externalTx) : this.prisma.$transaction(execute);
  }

  /**
   * Administrative Capacity Visibility: Returns drive capacity, active pools, and held queue.
   */
  async getDriveCapacityStatus(driveId: string): Promise<DriveCapacityStatus> {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: { organization: true },
    });

    if (!drive) {
      throw new NotFoundException(`Drive ${driveId} not found`);
    }

    const billingAccountId = drive.organization.billingAccountId;
    if (!billingAccountId) {
      throw new NotFoundException(`Organization for drive ${driveId} has no billing account.`);
    }

    const now = new Date();

    // Drive pass
    const drivePass = await this.prisma.creditPool.findFirst({
      where: {
        billingAccountId,
        driveId,
        status: PoolStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    // Active reserve
    const activeReserve = await this.prisma.creditPool.findFirst({
      where: {
        billingAccountId,
        driveId: null,
        status: PoolStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    // Queued pools
    const queuedCount = await this.prisma.creditPool.count({
      where: {
        billingAccountId,
        driveId: null,
        status: PoolStatus.QUEUED,
      },
    });

    // Held candidate sessions
    const heldCount = await this.prisma.session.count({
      where: {
        driveId,
        status: SessionStatus.NOT_STARTED,
        holdReason: HoldReason.CAPACITY,
      },
    });

    const dpRemaining = drivePass?.cachedRemaining ?? 0;
    const trRemaining = activeReserve?.cachedRemaining ?? 0;
    const fallthrough = drive.fallthrough;

    const totalUsable = dpRemaining + (fallthrough === DrivePoolFallthrough.ALLOW ? trRemaining : 0);
    const canAccept = totalUsable > 0;

    let summary: DriveCapacityStatus["statusSummary"] = "AVAILABLE";
    if (totalUsable === 0) {
      summary = "CAPACITY_EXHAUSTED";
    } else if (totalUsable < 10) {
      summary = "LOW_BALANCE";
    }

    return {
      driveId,
      billingAccountId,
      hasActiveDrivePass: !!drivePass,
      drivePassRemaining: dpRemaining,
      drivePassExpiresAt: drivePass?.expiresAt ?? null,
      fallthroughMode: fallthrough as DrivePoolFallthrough,
      activeTalentReserveRemaining: trRemaining,
      queuedPoolCount: queuedCount,
      heldCandidateCount: heldCount,
      canAcceptCandidates: canAccept,
      statusSummary: summary,
    };
  }

  /**
   * Release Held Sessions: Releases HELD candidates in FIFO order when credits are replenished.
   */
  async releaseHeldSessions(driveId: string): Promise<{ releasedCount: number }> {
    const heldSessions = await this.prisma.session.findMany({
      where: {
        driveId,
        status: SessionStatus.NOT_STARTED,
        holdReason: HoldReason.CAPACITY,
      },
      orderBy: { heldAt: "asc" },
    });

    let releasedCount = 0;
    for (const s of heldSessions) {
      const result = await this.evaluateAndAcquireCredit(s.id);
      if (result.outcome === "STARTED") {
        releasedCount++;
      } else {
        // Stop releasing if capacity is exhausted again
        break;
      }
    }

    this.logger.log(`Released ${releasedCount} held sessions for drive ${driveId}.`);
    return { releasedCount };
  }
}
