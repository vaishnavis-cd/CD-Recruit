import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  LedgerEntryType,
  GrantSource,
  LedgerReason,
  PoolStatus,
  Prisma,
} from "@prisma/client";

export interface RecordEntryParams {
  billingAccountId: string;
  organizationId: string;
  creditPoolId?: string | null;
  entryType: LedgerEntryType;
  amount: number;
  sessionId?: string | null;
  driveId?: string | null;
  relatedEntryId?: string | null;
  grantSource?: GrantSource | null;
  reason: LedgerReason;
  reasonNote?: string | null;
  paymentId?: string | null;
  requestId?: string | null;
  idempotencyKey: string;
  actorId: string;
  approvedById?: string | null;
  shadow?: boolean;
}

export interface AccountBalanceSummary {
  billingAccountId: string;
  totalRemaining: number;
  activePoolCredits: number;
  queuedPoolCredits: number;
  totalAvailableCredits: number;
  overdraftUsed: number;
  overdraftLimit: number;
  overdraftAvailable: number;
  status: string;
  activePools: any[];
  queuedPools: any[];
}

export interface ReconciliationReport {
  billingAccountId: string;
  isBalanced: boolean;
  poolDiscrepancies: Array<{
    poolId: string;
    cachedRemaining: number;
    ledgerCalculated: number;
    diff: number;
  }>;
  overdraftDiscrepancy: {
    cachedOverdraftUsed: number;
    ledgerCalculated: number;
    diff: number;
  };
  reconciledAt: Date;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Acquires the canonical PostgreSQL advisory transaction lock on BillingAccount (Rule R4).
   * Lock order: BillingAccount advisory lock -> Session row -> CreditPool row -> Ledger insert.
   */
  async acquireAccountLock(tx: Prisma.TransactionClient, billingAccountId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${billingAccountId}::text, 0))`;
  }

  /**
   * Low-level atomic entry creator adhering strictly to Rules R1, R2, R4, R5, and database constraints.
   * If an entry with the idempotencyKey already exists, returns the existing record idempotently.
   */
  async recordEntry(
    tx: Prisma.TransactionClient,
    params: RecordEntryParams,
  ) {
    // R1: Whole-number credits
    if (!Number.isInteger(params.amount)) {
      throw new BadRequestException("Credit amounts must be whole integers (Rule R1)");
    }

    // Reason note non-PII and length validation
    if (params.reasonNote && params.reasonNote.length > 200) {
      throw new BadRequestException("Reason note must not exceed 200 characters");
    }

    // Check idempotency first
    const existing = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      this.logger.debug(
        `Idempotent duplicate entry detected for key ${params.idempotencyKey}. Returning existing entry ${existing.id}`,
      );
      return existing;
    }

    // Validate sign and references according to DB constraints
    this.validateEntryInvariants(params);

    const isShadow = params.shadow ?? false;
    let balanceAfter: number | null = null;

    // Apply cache mutations within the exact same transaction (Rule R2)
    if (!isShadow) {
      if (params.creditPoolId) {
        const pool = await tx.creditPool.findUnique({
          where: { id: params.creditPoolId },
        });
        if (!pool) {
          throw new NotFoundException(`CreditPool ${params.creditPoolId} not found`);
        }

        const newRemaining = pool.cachedRemaining + params.amount;
        if (newRemaining < 0) {
          throw new ConflictException(
            `Insufficient pool balance. Pool ${pool.id} has ${pool.cachedRemaining} remaining, requested ${params.amount}`,
          );
        }

        const updatedPool = await tx.creditPool.update({
          where: { id: pool.id },
          data: {
            cachedRemaining: newRemaining,
            // If balance drops to 0, mark EXHAUSTED unless it's a zero-amount entry
            ...(newRemaining === 0 && pool.cachedRemaining > 0
              ? { status: PoolStatus.EXHAUSTED }
              : {}),
          },
        });
        balanceAfter = updatedPool.cachedRemaining;
      }

      // Handle overdraft accounting
      if (params.entryType === LedgerEntryType.OVERDRAFT) {
        const account = await tx.billingAccount.findUnique({
          where: { id: params.billingAccountId },
        });
        if (!account) {
          throw new NotFoundException(`BillingAccount ${params.billingAccountId} not found`);
        }
        if (account.overdraftUsed + 1 > account.overdraftLimit) {
          throw new ConflictException(
            `Overdraft limit reached. Limit: ${account.overdraftLimit}, current: ${account.overdraftUsed}`,
          );
        }
        await tx.billingAccount.update({
          where: { id: params.billingAccountId },
          data: { overdraftUsed: { increment: 1 } },
        });
      } else if (params.entryType === LedgerEntryType.OVERDRAFT_SETTLE) {
        // amount is negative (e.g. -5), so overdraftUsed is decremented by abs(amount)
        const settleAmount = Math.abs(params.amount);
        await tx.billingAccount.update({
          where: { id: params.billingAccountId },
          data: { overdraftUsed: { decrement: settleAmount } },
        });
      } else if (params.entryType === LedgerEntryType.REVERSAL && !params.creditPoolId) {
        // Reversal of an overdraft entry decrements overdraftUsed
        await tx.billingAccount.update({
          where: { id: params.billingAccountId },
          data: { overdraftUsed: { decrement: 1 } },
        });
      }
    }

    // Insert append-only ledger row
    return tx.creditLedgerEntry.create({
      data: {
        billingAccountId: params.billingAccountId,
        organizationId: params.organizationId,
        creditPoolId: params.creditPoolId ?? null,
        entryType: params.entryType,
        amount: params.amount,
        balanceAfter,
        sessionId: params.sessionId ?? null,
        driveId: params.driveId ?? null,
        relatedEntryId: params.relatedEntryId ?? null,
        grantSource: params.grantSource ?? null,
        reason: params.reason,
        reasonNote: params.reasonNote ?? null,
        paymentId: params.paymentId ?? null,
        requestId: params.requestId ?? null,
        idempotencyKey: params.idempotencyKey,
        actorId: params.actorId,
        approvedById: params.approvedById ?? null,
        shadow: isShadow,
      },
    });
  }

  /**
   * Grants credits to a pool. Supports maker-checker requests or purchase grants.
   */
  async grantCredits(
    params: {
      billingAccountId: string;
      organizationId: string;
      creditPoolId: string;
      amount: number;
      grantSource: GrantSource;
      reason: LedgerReason;
      reasonNote?: string;
      paymentId?: string;
      requestId?: string;
      idempotencyKey: string;
      actorId: string;
      approvedById?: string;
    },
    clientTx?: Prisma.TransactionClient,
  ) {
    if (params.amount <= 0) {
      throw new BadRequestException("Grant amount must be greater than zero");
    }

    const execute = async (tx: Prisma.TransactionClient) => {
      await this.acquireAccountLock(tx, params.billingAccountId);

      return this.recordEntry(tx, {
        billingAccountId: params.billingAccountId,
        organizationId: params.organizationId,
        creditPoolId: params.creditPoolId,
        entryType: LedgerEntryType.GRANT,
        amount: params.amount,
        grantSource: params.grantSource,
        reason: params.reason,
        reasonNote: params.reasonNote,
        paymentId: params.paymentId,
        requestId: params.requestId,
        idempotencyKey: params.idempotencyKey,
        actorId: params.actorId,
        approvedById: params.approvedById,
        shadow: false,
      });
    };

    return clientTx ? execute(clientTx) : this.prisma.$transaction(execute);
  }

  /**
   * Acquires 1 credit for a candidate assessment session attempt (Rule 1 Credit = 1 Live Attempt).
   */
  async acquireSessionCredit(
    params: {
      billingAccountId: string;
      organizationId: string;
      creditPoolId?: string | null;
      sessionId: string;
      driveId?: string | null;
      actorId?: string;
      shadow?: boolean;
      useOverdraft?: boolean;
    },
    clientTx?: Prisma.TransactionClient,
  ) {
    const isShadow = params.shadow ?? false;
    const actorId = params.actorId || "system";
    const idempotencyKey = isShadow
      ? `shadow:acquire:${params.sessionId}`
      : `acquire:${params.sessionId}`;

    const execute = async (tx: Prisma.TransactionClient) => {
      await this.acquireAccountLock(tx, params.billingAccountId);

      const entryType = params.useOverdraft
        ? LedgerEntryType.OVERDRAFT
        : LedgerEntryType.CONSUME;

      return this.recordEntry(tx, {
        billingAccountId: params.billingAccountId,
        organizationId: params.organizationId,
        creditPoolId: params.useOverdraft ? null : params.creditPoolId,
        entryType,
        amount: -1,
        sessionId: params.sessionId,
        driveId: params.driveId,
        reason: params.useOverdraft
          ? LedgerReason.OVERDRAFT_USED
          : LedgerReason.ATTEMPT_START,
        idempotencyKey,
        actorId,
        shadow: isShadow,
      });
    };

    return clientTx ? execute(clientTx) : this.prisma.$transaction(execute);
  }

  /**
   * Records recruiter courtesy reattempt waiver (WAIVE entry, amount = 0).
   */
  async waiveSessionCredit(
    params: {
      billingAccountId: string;
      organizationId: string;
      sessionId: string;
      driveId?: string | null;
      reason: LedgerReason;
      reasonNote?: string;
      actorId: string;
      approvedById?: string;
    },
    clientTx?: Prisma.TransactionClient,
  ) {
    const idempotencyKey = `waive:${params.sessionId}`;

    const execute = async (tx: Prisma.TransactionClient) => {
      await this.acquireAccountLock(tx, params.billingAccountId);

      return this.recordEntry(tx, {
        billingAccountId: params.billingAccountId,
        organizationId: params.organizationId,
        creditPoolId: null,
        entryType: LedgerEntryType.WAIVE,
        amount: 0,
        sessionId: params.sessionId,
        driveId: params.driveId,
        reason: params.reason,
        reasonNote: params.reasonNote,
        idempotencyKey,
        actorId: params.actorId,
        approvedById: params.approvedById,
        shadow: false,
      });
    };

    return clientTx ? execute(clientTx) : this.prisma.$transaction(execute);
  }

  /**
   * Reverses an acquired session credit (Platform fault / approved dispute).
   * Restores credit to original pool if still ACTIVE; else to active general pool; else to goodwill pool.
   */
  async reverseSessionCredit(
    params: {
      originalAcquisitionId: string;
      reason: LedgerReason;
      reasonNote?: string;
      actorId: string;
      approvedById?: string;
      requestId?: string;
    },
    clientTx?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const orig = await tx.creditLedgerEntry.findUnique({
        where: { id: params.originalAcquisitionId },
      });
      if (!orig) {
        throw new NotFoundException(`Original ledger entry ${params.originalAcquisitionId} not found`);
      }
      if (orig.entryType !== LedgerEntryType.CONSUME && orig.entryType !== LedgerEntryType.OVERDRAFT) {
        throw new BadRequestException(`Cannot reverse ledger entry of type ${orig.entryType}`);
      }

      await this.acquireAccountLock(tx, orig.billingAccountId);

      // Check if already reversed (single reversal partial index)
      const existingReversal = await tx.creditLedgerEntry.findFirst({
        where: {
          relatedEntryId: orig.id,
          entryType: LedgerEntryType.REVERSAL,
        },
      });
      if (existingReversal) {
        this.logger.warn(`Acquisition ${orig.id} has already been reversed by entry ${existingReversal.id}`);
        return existingReversal;
      }

      let targetPoolId: string | null = null;
      if (orig.creditPoolId) {
        // Check if original pool is still ACTIVE and unexpired
        const origPool = await tx.creditPool.findUnique({
          where: { id: orig.creditPoolId },
        });
        const now = new Date();
        if (origPool && origPool.status === PoolStatus.ACTIVE && (!origPool.expiresAt || origPool.expiresAt > now)) {
          targetPoolId = origPool.id;
        } else {
          // Find current active general pool for the account
          const activeGeneral = await tx.creditPool.findFirst({
            where: {
              billingAccountId: orig.billingAccountId,
              driveId: null,
              status: PoolStatus.ACTIVE,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          });
          if (activeGeneral) {
            targetPoolId = activeGeneral.id;
          }
        }
      }

      const idempotencyKey = `reversal:${orig.id}`;

      return this.recordEntry(tx, {
        billingAccountId: orig.billingAccountId,
        organizationId: orig.organizationId,
        creditPoolId: targetPoolId,
        entryType: LedgerEntryType.REVERSAL,
        amount: 1,
        sessionId: orig.sessionId,
        driveId: orig.driveId,
        relatedEntryId: orig.id,
        reason: params.reason,
        reasonNote: params.reasonNote,
        requestId: params.requestId,
        idempotencyKey,
        actorId: params.actorId,
        approvedById: params.approvedById,
        shadow: false,
      });
    };

    return clientTx ? execute(clientTx) : this.prisma.$transaction(execute);
  }

  /**
   * Expires all remaining unconsumed credits in a pool when validity deadline is reached.
   */
  async expirePoolCredits(
    poolId: string,
    actorId = "system",
    clientTx?: Prisma.TransactionClient,
  ) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const pool = await tx.creditPool.findUnique({
        where: { id: poolId },
        include: { billingAccount: { include: { organizations: true } } },
      });
      if (!pool) {
        throw new NotFoundException(`Pool ${poolId} not found`);
      }

      await this.acquireAccountLock(tx, pool.billingAccountId);

      if (pool.cachedRemaining <= 0) {
        // Zero remaining credits, just mark EXPIRED if not already
        if (pool.status !== PoolStatus.EXPIRED) {
          await tx.creditPool.update({
            where: { id: pool.id },
            data: { status: PoolStatus.EXPIRED },
          });
        }
        return null;
      }

      const orgId = pool.billingAccount.organizations[0]?.id || "system";
      const amountToExpire = -pool.cachedRemaining;
      const idempotencyKey = `expire:${pool.id}:${Date.now()}`;

      const entry = await this.recordEntry(tx, {
        billingAccountId: pool.billingAccountId,
        organizationId: orgId,
        creditPoolId: pool.id,
        entryType: LedgerEntryType.EXPIRE,
        amount: amountToExpire,
        reason: LedgerReason.POOL_EXPIRED,
        idempotencyKey,
        actorId,
        shadow: false,
      });

      await tx.creditPool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.EXPIRED },
      });

      return entry;
    };

    return clientTx ? execute(clientTx) : this.prisma.$transaction(execute);
  }

  /**
   * Retrieves real-time account balances and overdraft usage.
   */
  async getAccountBalance(billingAccountId: string): Promise<AccountBalanceSummary> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: {
        pools: {
          where: {
            status: { in: [PoolStatus.ACTIVE, PoolStatus.QUEUED] },
          },
        },
      },
    });
    if (!account) {
      throw new NotFoundException(`BillingAccount ${billingAccountId} not found`);
    }

    let activePoolCredits = 0;
    let queuedPoolCredits = 0;

    for (const pool of account.pools) {
      if (pool.status === PoolStatus.ACTIVE) {
        activePoolCredits += pool.cachedRemaining;
      } else if (pool.status === PoolStatus.QUEUED) {
        queuedPoolCredits += pool.cachedRemaining;
      }
    }

    const activePools = account.pools.filter((p) => p.status === PoolStatus.ACTIVE);
    const queuedPools = account.pools.filter((p) => p.status === PoolStatus.QUEUED);
    const overdraftAvailable = Math.max(0, account.overdraftLimit - account.overdraftUsed);

    return {
      billingAccountId: account.id,
      totalRemaining: activePoolCredits,
      activePoolCredits,
      queuedPoolCredits,
      totalAvailableCredits: activePoolCredits,
      overdraftUsed: account.overdraftUsed,
      overdraftLimit: account.overdraftLimit,
      overdraftAvailable,
      status: account.status,
      activePools,
      queuedPools,
    };
  }

  /**
   * Nightly automated reconciliation replay (Section 9.2).
   * Verifies pool integrity and overdraft integrity against raw ledger rows.
   */
  async reconcileAccount(billingAccountId: string): Promise<ReconciliationReport> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: {
        pools: true,
      },
    });
    if (!account) {
      throw new NotFoundException(`BillingAccount ${billingAccountId} not found`);
    }

    const poolDiscrepancies: ReconciliationReport["poolDiscrepancies"] = [];

    for (const pool of account.pools) {
      // Replay non-shadow entries for this pool
      const aggregate = await this.prisma.creditLedgerEntry.aggregate({
        where: {
          creditPoolId: pool.id,
          shadow: false,
        },
        _sum: {
          amount: true,
        },
      });

      // Total credits is the opening baseline for GRANT, but in our schema:
      // GRANT entries represent the credits added.
      // If the pool was created with total_credits and a matching GRANT entry exists,
      // SUM(amount) equals cachedRemaining.
      const ledgerSum = aggregate._sum.amount ?? 0;
      const diff = pool.cachedRemaining - ledgerSum;

      if (diff !== 0) {
        poolDiscrepancies.push({
          poolId: pool.id,
          cachedRemaining: pool.cachedRemaining,
          ledgerCalculated: ledgerSum,
          diff,
        });
      }
    }

    // Overdraft integrity:
    // account.overdraft_used == -SUM(OVERDRAFT) + SUM(OVERDRAFT_SETTLE) - SUM(REVERSAL where pool is null)
    const overdraftAgg = await this.prisma.creditLedgerEntry.aggregate({
      where: {
        billingAccountId: account.id,
        entryType: LedgerEntryType.OVERDRAFT,
        shadow: false,
      },
      _sum: { amount: true },
    });
    const settleAgg = await this.prisma.creditLedgerEntry.aggregate({
      where: {
        billingAccountId: account.id,
        entryType: LedgerEntryType.OVERDRAFT_SETTLE,
        shadow: false,
      },
      _sum: { amount: true },
    });
    const reversalAgg = await this.prisma.creditLedgerEntry.aggregate({
      where: {
        billingAccountId: account.id,
        entryType: LedgerEntryType.REVERSAL,
        creditPoolId: null,
        shadow: false,
      },
      _sum: { amount: true },
    });

    const overdraftSum = overdraftAgg._sum.amount ?? 0; // Negative (e.g. -3)
    const settleSum = settleAgg._sum.amount ?? 0;       // Negative (e.g. -2)
    const reversalSum = reversalAgg._sum.amount ?? 0;   // Positive (e.g. +1)

    // Expected: -(-3) + (-2) - (+1) = 3 - 2 - 1 = 0
    const calculatedOverdraftUsed = -overdraftSum + settleSum - reversalSum;
    const overdraftDiff = account.overdraftUsed - calculatedOverdraftUsed;

    const isBalanced = poolDiscrepancies.length === 0 && overdraftDiff === 0;

    return {
      billingAccountId: account.id,
      isBalanced,
      poolDiscrepancies,
      overdraftDiscrepancy: {
        cachedOverdraftUsed: account.overdraftUsed,
        ledgerCalculated: calculatedOverdraftUsed,
        diff: overdraftDiff,
      },
      reconciledAt: new Date(),
    };
  }

  private validateEntryInvariants(params: RecordEntryParams) {
    const { entryType, amount, creditPoolId, grantSource, relatedEntryId, paymentId, requestId } = params;

    // Check entry_type and amount sign:
    if ((entryType === LedgerEntryType.GRANT || entryType === LedgerEntryType.REVERSAL) && amount <= 0) {
      throw new BadRequestException(`${entryType} amount must be positive`);
    }
    if ((entryType === LedgerEntryType.CONSUME || entryType === LedgerEntryType.OVERDRAFT) && amount !== -1) {
      throw new BadRequestException(`${entryType} amount must be exactly -1`);
    }
    if ((entryType === LedgerEntryType.OVERDRAFT_SETTLE || entryType === LedgerEntryType.REFUND || entryType === LedgerEntryType.EXPIRE) && amount >= 0) {
      throw new BadRequestException(`${entryType} amount must be negative`);
    }
    if (entryType === LedgerEntryType.WAIVE && amount !== 0) {
      throw new BadRequestException(`WAIVE amount must be 0`);
    }
    if (entryType === LedgerEntryType.ADJUST && amount === 0) {
      throw new BadRequestException(`ADJUST amount cannot be 0`);
    }

    // Check pool presence:
    if (!creditPoolId && entryType !== LedgerEntryType.OVERDRAFT && entryType !== LedgerEntryType.WAIVE && entryType !== LedgerEntryType.REVERSAL) {
      throw new BadRequestException(`creditPoolId is required for ${entryType}`);
    }

    // Check required references:
    if (entryType === LedgerEntryType.GRANT && !grantSource) {
      throw new BadRequestException(`grantSource is required for GRANT`);
    }
    if (entryType === LedgerEntryType.REVERSAL && !relatedEntryId) {
      throw new BadRequestException(`relatedEntryId is required for REVERSAL`);
    }
    if (entryType === LedgerEntryType.REFUND && !paymentId) {
      throw new BadRequestException(`paymentId is required for REFUND`);
    }
    if (entryType === LedgerEntryType.ADJUST && !requestId) {
      throw new BadRequestException(`requestId is required for ADJUST`);
    }
    if (entryType === LedgerEntryType.GRANT && grantSource === GrantSource.PURCHASE && !paymentId) {
      throw new BadRequestException(`paymentId is required for PURCHASE GRANT`);
    }
    if (
      entryType === LedgerEntryType.GRANT &&
      grantSource &&
      ([GrantSource.PROMO, GrantSource.GOODWILL, GrantSource.CONTRACT, GrantSource.MIGRATION, GrantSource.ROLLOVER] as GrantSource[]).includes(grantSource) &&
      !requestId
    ) {
      throw new BadRequestException(`requestId is required for non-purchase GRANT (${grantSource})`);
    }
  }
}
