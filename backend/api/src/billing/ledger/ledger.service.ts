import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  LedgerEntryType,
  LedgerGrantSource,
  LedgerReason,
  LedgerActor,
  GrantCreditParams,
  ConsumeCreditParams,
  ReverseCreditParams,
  AdjustCreditParams,
  ExpirePoolCreditsParams,
  BeginSessionOutcome,
  LedgerQueryFilter,
} from "./ledger.types";
import { sanitizeAuditData } from "../../platform/audit/platform-audit.util";

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authoritatively extracts actor identity for ledger and billing audit.
   * Rejects recruiter staff and unauthenticated client spoofing.
   */
  private extractActorInfo(actor: LedgerActor): { actorId: string; actorRole: string } {
    if (!actor) {
      throw new BadRequestException("LEDGER_ACTOR_REQUIRED: Actor must be specified for ledger operations");
    }

    if (actor === "system") {
      return { actorId: "system", actorRole: "system" };
    }

    if (typeof actor === "object") {
      if ((actor as any).isPlatformStaff !== true) {
        throw new ForbiddenException(
          "RECRUITER_IDENTITY_CANNOT_BE_LEDGER_ACTOR: Only authenticated PlatformStaff or system can act on ledger",
        );
      }

      const role = actor.platformRole || actor.role;
      if (!role || !Object.values(PlatformStaffRole).includes(role as PlatformStaffRole)) {
        throw new BadRequestException(`INVALID_PLATFORM_ROLE: Invalid role '${role}' for ledger actor`);
      }

      if (!actor.id || typeof actor.id !== "string" || actor.id.trim() === "") {
        throw new BadRequestException("INVALID_ACTOR_ID: Actor must have a valid ID");
      }

      return { actorId: actor.id, actorRole: role };
    }

    throw new BadRequestException("INVALID_ACTOR_TYPE: Actor must be PlatformStaff object or 'system'");
  }

  /**
   * Helper to write immutable billing audit events inside the enclosing transaction.
   */
  private async recordBillingAudit(
    tx: any,
    params: {
      actorId: string;
      actorRole: string;
      subjectType: string;
      subjectId: string;
      action: string;
      before?: any;
      after?: any;
      reason?: string | null;
      ticketRef?: string | null;
      requestId?: string | null;
    },
  ) {
    const sanitizedBefore = params.before ? sanitizeAuditData(params.before) : null;
    const sanitizedAfter = params.after ? sanitizeAuditData(params.after) : null;

    await tx.billingAuditEvent.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        action: params.action,
        before: sanitizedBefore,
        after: sanitizedAfter,
        reason: params.reason || null,
        ticketRef: params.ticketRef || null,
        requestId: params.requestId || null,
        executionResult: "SUCCESS",
      },
    });
  }

  /**
   * Grant credits into a credit pool.
   *
   * Invariants enforced:
   * - CreditLedgerEntry is the sole source of truth.
   * - Amount must be > 0 (chk_ledger_amount_sign).
   * - Grant source is mandatory (chk_ledger_required_refs).
   * - Deterministic idempotency key deduplication.
   * - Native PostgreSQL row locking (SELECT ... FOR UPDATE) on target credit_pool.
   * - Atomic cache update and billing audit emission.
   */
  async grantCredits(params: GrantCreditParams) {
    if (!params.amount || params.amount <= 0) {
      throw new BadRequestException("INVALID_GRANT_AMOUNT: Grant amount must be a positive integer");
    }

    if (!params.grantSource || typeof params.grantSource !== "string" || params.grantSource.trim() === "") {
      throw new BadRequestException("GRANT_SOURCE_REQUIRED: grantSource must be specified for GRANT entry");
    }

    if (!params.idempotencyKey || typeof params.idempotencyKey !== "string" || params.idempotencyKey.trim() === "") {
      throw new BadRequestException("IDEMPOTENCY_KEY_REQUIRED: An idempotencyKey must be supplied");
    }

    const { actorId, actorRole } = this.extractActorInfo(params.actor);

    // Idempotency check: if entry already exists
    const existing = await this.prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (
        existing.entryType === LedgerEntryType.GRANT &&
        existing.amount === params.amount &&
        existing.creditPoolId === params.creditPoolId &&
        existing.billingAccountId === params.billingAccountId
      ) {
        this.logger.log(`[LedgerService] Idempotent grant replay: ${params.idempotencyKey}`);
        return existing;
      }
      throw new ConflictException("IDEMPOTENCY_CONFLICT: Idempotency key already exists with different payload");
    }

    const executeInTransaction = async (tx: any) => {
      // 1. Acquire exclusive row lock on credit_pool
      const pools = (await tx.$queryRawUnsafe(
        `SELECT id, billing_account_id, cached_remaining, status, total_credits 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        params.creditPoolId,
      )) as any[];

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool ${params.creditPoolId} does not exist`);
      }

      const pool = pools[0];
      if (pool.billing_account_id !== params.billingAccountId) {
        throw new BadRequestException("POOL_ACCOUNT_MISMATCH: Pool does not belong to the specified billing account");
      }

      // 2. Authoritative balance calculation
      const balanceAfter = pool.cached_remaining + params.amount;

      // 3. Insert immutable ledger entry
      const entry = await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: params.billingAccountId,
          organizationId: params.organizationId,
          creditPoolId: params.creditPoolId,
          entryType: LedgerEntryType.GRANT,
          amount: params.amount,
          balanceAfter,
          grantSource: params.grantSource,
          reason: params.reason,
          reasonNote: params.reasonNote || null,
          paymentId: params.paymentId || null,
          requestId: params.requestId || null,
          idempotencyKey: params.idempotencyKey,
          actorId,
          shadow: false,
        },
      });

      // 4. Update cached pool projection
      await tx.creditPool.update({
        where: { id: params.creditPoolId },
        data: {
          cachedRemaining: balanceAfter,
        },
      });

      // 5. Emit billing audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: params.creditPoolId,
        action: "CREDIT_GRANT",
        before: { cachedRemaining: pool.cached_remaining },
        after: { cachedRemaining: balanceAfter, grantAmount: params.amount, ledgerEntryId: entry.id },
        reason: params.reason,
        ticketRef: params.ticketRef,
        requestId: params.requestId,
      });

      this.logger.log(
        `[LedgerService] GRANT recorded: +${params.amount} credits to pool ${params.creditPoolId} (new balance: ${balanceAfter})`,
      );

      return entry;
    };

    if (params.tx) {
      return await executeInTransaction(params.tx);
    }

    return await this.prisma.$transaction(executeInTransaction);
  }

  /**
   * Consume credits from a credit pool.
   *
   * Invariants enforced:
   * - CreditLedgerEntry is the sole source of truth.
   * - Amount must be -1 per chk_ledger_amount_sign.
   * - Insufficient balance rejected before row insertion.
   * - cached_remaining cannot become negative.
   * - Row locking prevents concurrent overdrafts.
   */
  async consumeCredit(params: ConsumeCreditParams) {
    const amount = params.amount ?? -1;
    if (amount !== -1) {
      throw new BadRequestException("INVALID_CONSUME_AMOUNT: Consumption amount must be exactly -1");
    }

    if (!params.creditPoolId) {
      throw new BadRequestException("CREDIT_POOL_REQUIRED: creditPoolId must be specified for CONSUME entry");
    }

    if (!params.idempotencyKey) {
      throw new BadRequestException("IDEMPOTENCY_KEY_REQUIRED: An idempotencyKey must be supplied");
    }

    const { actorId, actorRole } = this.extractActorInfo(params.actor);

    // Idempotency check
    const existing = await this.prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (
        existing.entryType === LedgerEntryType.CONSUME &&
        existing.creditPoolId === params.creditPoolId &&
        existing.amount === -1
      ) {
        return existing;
      }
      throw new ConflictException("IDEMPOTENCY_CONFLICT: Idempotency key already exists with different payload");
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive row lock on credit_pool
      const pools = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, billing_account_id, cached_remaining, status 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        params.creditPoolId,
      );

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool ${params.creditPoolId} does not exist`);
      }

      const pool = pools[0];
      if (pool.billing_account_id !== params.billingAccountId) {
        throw new BadRequestException("POOL_ACCOUNT_MISMATCH: Pool does not belong to specified billing account");
      }

      if (pool.cached_remaining < 1) {
        throw new BadRequestException("INSUFFICIENT_CREDITS: Credit pool balance is depleted");
      }

      const balanceAfter = pool.cached_remaining - 1;

      // 2. Insert immutable ledger entry
      const entry = await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: params.billingAccountId,
          organizationId: params.organizationId,
          creditPoolId: params.creditPoolId,
          entryType: LedgerEntryType.CONSUME,
          amount: -1,
          balanceAfter,
          reason: params.reason,
          reasonNote: params.reasonNote || null,
          sessionId: params.sessionId || null,
          driveId: params.driveId || null,
          idempotencyKey: params.idempotencyKey,
          actorId,
          shadow: false,
        },
      });

      // 3. Update cached projection
      await tx.creditPool.update({
        where: { id: params.creditPoolId },
        data: {
          cachedRemaining: balanceAfter,
          status: balanceAfter === 0 ? "EXHAUSTED" : pool.status,
        },
      });

      // 4. Emit billing audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: params.creditPoolId,
        action: "CREDIT_CONSUME",
        before: { cachedRemaining: pool.cached_remaining },
        after: { cachedRemaining: balanceAfter, ledgerEntryId: entry.id },
        reason: params.reason,
        ticketRef: params.ticketRef,
      });

      return entry;
    });
  }

  /**
   * Reverse a prior credit acquisition (CONSUME or OVERDRAFT).
   *
   * Invariants enforced:
   * - Identifies original entry via related_entry_id.
   * - Original entry remains immutable history.
   * - Only eligible entries (CONSUME, OVERDRAFT) may be reversed.
   * - Exact-once reversal enforced (uq_ledger_single_reversal).
   * - Balance restored to original pool or debt deducted from overdraft_used.
   * - Emits billing audit event.
   */
  async reverseCredit(params: ReverseCreditParams) {
    if (!params.relatedEntryId) {
      throw new BadRequestException("RELATED_ENTRY_REQUIRED: relatedEntryId must be specified for REVERSAL");
    }

    const { actorId, actorRole } = this.extractActorInfo(params.actor);
    const idempotencyKey = params.idempotencyKey || `reversal:${params.relatedEntryId}`;

    // Idempotency check
    const existing = await this.prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (existing.entryType === LedgerEntryType.REVERSAL && existing.relatedEntryId === params.relatedEntryId) {
        return existing;
      }
      throw new ConflictException("IDEMPOTENCY_CONFLICT: Reversal idempotency key already exists with different payload");
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Lock original entry
      const originalEntries = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "billing"."credit_ledger_entry" WHERE id = $1 FOR UPDATE`,
        params.relatedEntryId,
      );

      if (!originalEntries || originalEntries.length === 0) {
        throw new NotFoundException(`LEDGER_ENTRY_NOT_FOUND: Original ledger entry ${params.relatedEntryId} not found`);
      }

      const original = originalEntries[0];

      // 2. Validate eligibility
      if (original.entry_type !== LedgerEntryType.CONSUME && original.entry_type !== LedgerEntryType.OVERDRAFT) {
        throw new BadRequestException(
          `INELIGIBLE_FOR_REVERSAL: Entry type '${original.entry_type}' is not eligible for reversal (only CONSUME or OVERDRAFT)`,
        );
      }

      // 3. Exact-once reversal check
      const priorReversals = await tx.creditLedgerEntry.findMany({
        where: {
          relatedEntryId: original.id,
          entryType: LedgerEntryType.REVERSAL,
        },
      });

      if (priorReversals.length > 0) {
        throw new ConflictException("ALREADY_REVERSED: Ledger entry has already been reversed");
      }

      let balanceAfter: number | null = null;

      // 4. If original was pool CONSUME -> restore pool balance
      if (original.credit_pool_id) {
        const pools = await tx.$queryRawUnsafe<any[]>(
          `SELECT id, cached_remaining, status FROM "billing"."credit_pool" WHERE id = $1 FOR UPDATE`,
          original.credit_pool_id,
        );

        if (!pools || pools.length === 0) {
          throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool ${original.credit_pool_id} does not exist`);
        }

        const pool = pools[0];
        balanceAfter = pool.cached_remaining + 1;

        // Create reversal ledger entry
        const reversalEntry = await tx.creditLedgerEntry.create({
          data: {
            billingAccountId: original.billing_account_id,
            organizationId: original.organization_id,
            creditPoolId: original.credit_pool_id,
            entryType: LedgerEntryType.REVERSAL,
            amount: 1,
            balanceAfter,
            relatedEntryId: original.id,
            sessionId: original.session_id,
            driveId: original.drive_id,
            reason: params.reason,
            reasonNote: params.reasonNote || null,
            requestId: params.requestId || null,
            idempotencyKey,
            actorId,
            shadow: false,
          },
        });

        // Update pool balance and restore status if exhausted
        await tx.creditPool.update({
          where: { id: original.credit_pool_id },
          data: {
            cachedRemaining: balanceAfter,
            status: pool.status === "EXHAUSTED" ? "ACTIVE" : pool.status,
          },
        });

        // Emit billing audit event
        await this.recordBillingAudit(tx, {
          actorId,
          actorRole,
          subjectType: "LEDGER",
          subjectId: original.id,
          action: "CREDIT_REVERSAL",
          before: { cachedRemaining: pool.cached_remaining, originalEntryId: original.id },
          after: { cachedRemaining: balanceAfter, reversalEntryId: reversalEntry.id },
          reason: params.reason,
          ticketRef: params.ticketRef,
          requestId: params.requestId,
        });

        return reversalEntry;
      } else {
        // Original was OVERDRAFT -> reduce overdraft_used on billing_account
        const accounts = await tx.$queryRawUnsafe<any[]>(
          `SELECT id, overdraft_used FROM "billing"."billing_account" WHERE id = $1 FOR UPDATE`,
          original.billing_account_id,
        );

        if (!accounts || accounts.length === 0) {
          throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Account ${original.billing_account_id} not found`);
        }

        const account = accounts[0];
        const newOverdraftUsed = Math.max(0, account.overdraft_used - 1);

        const reversalEntry = await tx.creditLedgerEntry.create({
          data: {
            billingAccountId: original.billing_account_id,
            organizationId: original.organization_id,
            creditPoolId: null,
            entryType: LedgerEntryType.REVERSAL,
            amount: 1,
            balanceAfter: null,
            relatedEntryId: original.id,
            sessionId: original.session_id,
            driveId: original.drive_id,
            reason: params.reason,
            reasonNote: params.reasonNote || null,
            requestId: params.requestId || null,
            idempotencyKey,
            actorId,
            shadow: false,
          },
        });

        await tx.billingAccount.update({
          where: { id: original.billing_account_id },
          data: { overdraftUsed: newOverdraftUsed },
        });

        await this.recordBillingAudit(tx, {
          actorId,
          actorRole,
          subjectType: "ACCOUNT",
          subjectId: original.billing_account_id,
          action: "OVERDRAFT_REVERSAL",
          before: { overdraftUsed: account.overdraft_used, originalEntryId: original.id },
          after: { overdraftUsed: newOverdraftUsed, reversalEntryId: reversalEntry.id },
          reason: params.reason,
          ticketRef: params.ticketRef,
          requestId: params.requestId,
        });

        return reversalEntry;
      }
    });
  }

  /**
   * Execute an administrative adjustment on a credit pool.
   *
   * Invariants enforced:
   * - Actor must be authenticated PlatformStaff with FINANCE or OWNER role.
   * - Amount must be non-zero (positive or negative).
   * - Mandatory requestId and reason.
   * - Authoritative row locking and non-negative balance enforcement.
   * - Emits billing audit event.
   */
  async executeManualAdjustment(params: AdjustCreditParams) {
    if (!params.actor || (params.actor as any).isPlatformStaff !== true) {
      throw new ForbiddenException("AUTHENTICATED_PLATFORM_STAFF_REQUIRED: Adjustments require platform staff identity");
    }

    const role = params.actor.platformRole || params.actor.role;
    if (role !== PlatformStaffRole.FINANCE && role !== PlatformStaffRole.OWNER) {
      throw new ForbiddenException(
        `UNAUTHORIZED_ROLE_FOR_ADJUSTMENT: Only FINANCE or OWNER can execute adjustments (received '${role}')`,
      );
    }

    if (!params.amount || params.amount === 0) {
      throw new BadRequestException("INVALID_ADJUST_AMOUNT: Adjustment amount must be a non-zero integer");
    }

    if (!params.reason || typeof params.reason !== "string" || params.reason.trim() === "") {
      throw new BadRequestException("REASON_REQUIRED: A valid reason must be provided for manual adjustment");
    }

    if (!params.requestId || typeof params.requestId !== "string" || params.requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Manual adjustments must reference an approved requestId");
    }

    if (!params.idempotencyKey) {
      throw new BadRequestException("IDEMPOTENCY_KEY_REQUIRED: An idempotencyKey must be supplied");
    }

    const actorId = params.actor.id;
    const actorRole = role;

    // Idempotency check
    const existing = await this.prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      if (
        existing.entryType === LedgerEntryType.ADJUST &&
        existing.amount === params.amount &&
        existing.creditPoolId === params.creditPoolId
      ) {
        return existing;
      }
      throw new ConflictException("IDEMPOTENCY_CONFLICT: Idempotency key already exists with different payload");
    }

    const executeInTransaction = async (tx: any) => {
      // 1. Row lock target pool
      const pools = (await tx.$queryRawUnsafe(
        `SELECT id, billing_account_id, cached_remaining, status 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        params.creditPoolId,
      )) as any[];

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool ${params.creditPoolId} does not exist`);
      }

      const pool = pools[0];
      if (pool.billing_account_id !== params.billingAccountId) {
        throw new BadRequestException("POOL_ACCOUNT_MISMATCH: Pool does not belong to specified billing account");
      }

      const balanceAfter = pool.cached_remaining + params.amount;
      if (balanceAfter < 0) {
        throw new BadRequestException(
          `ADJUSTMENT_EXCEEDS_BALANCE: Adjustment would result in negative balance (${balanceAfter})`,
        );
      }

      // 2. Insert immutable ledger entry
      const entry = await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: params.billingAccountId,
          organizationId: params.organizationId,
          creditPoolId: params.creditPoolId,
          entryType: LedgerEntryType.ADJUST,
          amount: params.amount,
          balanceAfter,
          reason: params.reason,
          reasonNote: params.reasonNote || null,
          requestId: params.requestId,
          approvedById: params.approvedById || null,
          idempotencyKey: params.idempotencyKey,
          actorId,
          shadow: false,
        },
      });

      // 3. Update cached projection
      await tx.creditPool.update({
        where: { id: params.creditPoolId },
        data: {
          cachedRemaining: balanceAfter,
        },
      });

      // 4. Emit billing audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: params.creditPoolId,
        action: "ADMINISTRATIVE_ADJUSTMENT",
        before: { cachedRemaining: pool.cached_remaining },
        after: { cachedRemaining: balanceAfter, adjustmentAmount: params.amount, ledgerEntryId: entry.id },
        reason: params.reason,
        ticketRef: params.ticketRef,
        requestId: params.requestId,
      });

      this.logger.log(
        `[LedgerService] ADJUST recorded: ${params.amount > 0 ? "+" : ""}${params.amount} on pool ${params.creditPoolId} (new balance: ${balanceAfter})`,
      );

      return entry;
    };

    if (params.tx) {
      return await executeInTransaction(params.tx);
    }

    return await this.prisma.$transaction(executeInTransaction);
  }

  /**
   * Expire unconsumed credits on a deadline.
   *
   * Invariants enforced:
   * - Amount is negative: -cachedRemaining.
   * - Pool cached_remaining is set to 0.
   * - Pool status transitions to EXPIRED.
   */
  async expirePoolCredits(params: ExpirePoolCreditsParams): Promise<number> {
    const actorInfo = params.actor ? this.extractActorInfo(params.actor) : { actorId: "system", actorRole: "system" };
    const idempotencyKey =
      params.idempotencyKey || `expire:pool:${params.creditPoolId}:${new Date().toISOString().slice(0, 10)}`;

    const existing = await this.prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return Math.abs(existing.amount);
    }

    return await this.prisma.$transaction(async (tx) => {
      const pools = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, billing_account_id, cached_remaining, status 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        params.creditPoolId,
      );

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool ${params.creditPoolId} does not exist`);
      }

      const pool = pools[0];
      if (pool.cached_remaining <= 0) {
        return 0;
      }

      const expiredAmount = pool.cached_remaining;
      const amount = -expiredAmount; // negative integer per chk_ledger_amount_sign

      await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: pool.billing_account_id,
          organizationId: "", // resolved or empty snapshot
          creditPoolId: pool.id,
          entryType: LedgerEntryType.EXPIRE,
          amount,
          balanceAfter: 0,
          reason: params.reason || LedgerReason.POOL_EXPIRATION,
          idempotencyKey,
          actorId: actorInfo.actorId,
          shadow: false,
        },
      });

      await tx.creditPool.update({
        where: { id: pool.id },
        data: {
          cachedRemaining: 0,
          status: "EXPIRED",
        },
      });

      await this.recordBillingAudit(tx, {
        actorId: actorInfo.actorId,
        actorRole: actorInfo.actorRole,
        subjectType: "POOL",
        subjectId: pool.id,
        action: "CREDIT_EXPIRE",
        before: { cachedRemaining: pool.cached_remaining },
        after: { cachedRemaining: 0, expiredAmount },
        reason: params.reason || LedgerReason.POOL_EXPIRATION,
      });

      return expiredAmount;
    });
  }

  /**
   * Authoritative candidate session billing gateway integration.
   * Delegates directly to the billing.billing_begin() concurrency primitive in PostgreSQL.
   */
  async claimSessionCredit(
    sessionId: string,
    mode: "off" | "shadow" | "enforce" = "enforce",
  ): Promise<BeginSessionOutcome> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM billing.billing_begin($1, $2)`,
      sessionId,
      mode,
    );

    if (!rows || rows.length === 0) {
      throw new Error(`BILLING_BEGIN_EMPTY_RESPONSE: No response for session ${sessionId}`);
    }

    const row = rows[0];
    return {
      outcome: row.outcome,
      poolId: row.pool_id,
      balanceRemaining: Number(row.balance_remaining),
      overdraftUsed: Number(row.overdraft_used),
      evidenceId: row.evidence_id,
    };
  }

  /**
   * Reconcile pool balance: compares cachedRemaining with the authoritative SUM(amount) of ledger entries.
   */
  async reconcilePoolBalance(poolId: string): Promise<{
    poolId: string;
    cachedRemaining: number;
    ledgerSum: number;
    isConsistent: boolean;
  }> {
    const pool = await this.prisma.creditPool.findUnique({
      where: { id: poolId },
      select: { id: true, cachedRemaining: true },
    });

    if (!pool) {
      throw new NotFoundException(`Pool ${poolId} not found`);
    }

    const result = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(SUM(amount), 0)::integer AS "ledgerSum" 
         FROM "billing"."credit_ledger_entry" 
        WHERE credit_pool_id = $1`,
      poolId,
    );

    const ledgerSum = Number(result[0]?.ledgerSum ?? 0);
    return {
      poolId,
      cachedRemaining: pool.cachedRemaining,
      ledgerSum,
      isConsistent: pool.cachedRemaining === ledgerSum,
    };
  }

  /**
   * Query ledger entries with filters and pagination.
   */
  async getLedgerEntries(filter: LedgerQueryFilter = {}) {
    const where: any = {};
    if (filter.billingAccountId) where.billingAccountId = filter.billingAccountId;
    if (filter.creditPoolId) where.creditPoolId = filter.creditPoolId;
    if (filter.sessionId) where.sessionId = filter.sessionId;
    if (filter.driveId) where.driveId = filter.driveId;
    if (filter.entryType) where.entryType = filter.entryType;

    const entries = await this.prisma.creditLedgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filter.limit || 50,
      skip: filter.offset || 0,
      include: {
        relatedEntry: true,
      },
    });

    return entries;
  }

  /**
   * Get single ledger entry by UUID.
   */
  async getLedgerEntryById(id: string) {
    const entry = await this.prisma.creditLedgerEntry.findUnique({
      where: { id },
      include: {
        relatedEntry: true,
        reversedBy: true,
      },
    });

    if (!entry) {
      throw new NotFoundException(`Credit ledger entry ${id} not found`);
    }

    return entry;
  }
}
