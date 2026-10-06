import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Prisma, PoolStatus } from "@prisma/client";
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
  RefundCreditParams,
  ExpirePoolCreditsParams,
  BeginSessionOutcome,
  LedgerQueryFilter,
  DeclareIncidentWindowDto,
  IncidentWindowResultDto,
  RecordEntryParams,
  AccountBalanceSummary,
  ReconciliationReport,
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
  private extractActorInfo(actor?: LedgerActor, actorIdFallback?: string): { actorId: string; actorRole: string } {
    if (!actor && actorIdFallback) {
      return { actorId: actorIdFallback, actorRole: "system" };
    }

    if (!actor) {
      throw new BadRequestException("LEDGER_ACTOR_REQUIRED: Actor must be specified for ledger operations");
    }

    if (actor === "system" || (typeof actor === "string" && actor === "system")) {
      return { actorId: "system", actorRole: "system" };
    }

    if (typeof actor === "string") {
      return { actorId: actor, actorRole: "system" };
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

    const { actorId, actorRole } = this.extractActorInfo(params.actor, params.actorId);

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
          approvedById: params.approvedById || null,
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
          reason: params.reason as any,
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
            reason: params.reason as any,
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
            reason: params.reason as any,
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
   * Authoritatively refund unconsumed credits from a credit pool.
   *
   * Invariants enforced:
   * - Amount must be > 0 (will be negated for REFUND entry per chk_ledger_amount_sign).
   * - Payment ID is mandatory (chk_ledger_required_refs).
   * - Authoritative row locking (SELECT ... FOR UPDATE) on target credit_pool.
   * - Unconsumed balance boundary check (cached_remaining >= amount).
   * - Never creates overdraft debt.
   * - If pool balance reaches 0, status transitions to CANCELLED per Artifact 06 Â§1.4.
   * - Emits billing audit event.
   */
  async refundCredits(params: RefundCreditParams) {
    if (!params.amount || params.amount <= 0 || !Number.isInteger(params.amount)) {
      throw new BadRequestException("INVALID_REFUND_AMOUNT: Refund amount must be a positive integer");
    }

    if (!params.paymentId || typeof params.paymentId !== "string" || params.paymentId.trim() === "") {
      throw new BadRequestException("PAYMENT_ID_REQUIRED: A valid paymentId is mandatory for REFUND entries");
    }

    if (!params.creditPoolId || typeof params.creditPoolId !== "string" || params.creditPoolId.trim() === "") {
      throw new BadRequestException("CREDIT_POOL_ID_REQUIRED: A valid creditPoolId is required for REFUND entries");
    }

    const { actorId, actorRole } = this.extractActorInfo(params.actor);
    const idempotencyKey =
      params.idempotencyKey ||
      `refund:payment:${params.paymentId}:${params.creditPoolId}:${params.amount}:${Date.now()}`;

    // Idempotency check: if entry already exists
    const existing = await this.prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.entryType === LedgerEntryType.REFUND &&
        Math.abs(existing.amount) === params.amount &&
        existing.creditPoolId === params.creditPoolId &&
        existing.paymentId === params.paymentId
      ) {
        return existing;
      }
      throw new ConflictException("IDEMPOTENCY_CONFLICT: Idempotency key already exists with different payload");
    }

    const executeInTransaction = async (tx: any) => {
      // 1. Authoritative row lock on target credit pool
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
        throw new BadRequestException("POOL_ACCOUNT_MISMATCH: Pool does not belong to specified billing account");
      }

      // 2. Enforce cash refund boundary (Artifact 02 Â§6.3: cached_remaining >= refund_credits)
      if (pool.cached_remaining < params.amount) {
        throw new BadRequestException(
          `REFUND_EXCEEDS_UNCONSUMED_BALANCE: Cannot refund ${params.amount} credits; pool only has ${pool.cached_remaining} unconsumed credits`,
        );
      }

      const balanceAfter = pool.cached_remaining - params.amount;

      // 3. Resolve organizationId
      let orgId = params.organizationId;
      if (!orgId) {
        const ba = await tx.billingAccount.findUnique({
          where: { id: params.billingAccountId },
          include: { organizations: true },
        });
        orgId = ba?.organization?.id || "";
      }

      // 4. Insert immutable REFUND ledger entry (amount < 0 per chk_ledger_amount_sign)
      const entry = await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: params.billingAccountId,
          organizationId: orgId,
          creditPoolId: params.creditPoolId,
          entryType: LedgerEntryType.REFUND,
          amount: -params.amount,
          balanceAfter,
          reason: params.reason || "CASH_REFUND",
          reasonNote: params.reasonNote || null,
          paymentId: params.paymentId,
          requestId: params.requestId || null,
          idempotencyKey,
          actorId,
          shadow: false,
        },
      });

      // 5. Update cachedRemaining and pool status if fully unconsumed refunded
      const poolUpdates: any = {
        cachedRemaining: balanceAfter,
      };
      if (balanceAfter === 0) {
        poolUpdates.status = "CANCELLED";
      }

      await tx.creditPool.update({
        where: { id: params.creditPoolId },
        data: poolUpdates,
      });

      // 6. Emit billing audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: params.creditPoolId,
        action: "CREDIT_REFUND",
        before: { cachedRemaining: pool.cached_remaining, status: pool.status },
        after: {
          cachedRemaining: balanceAfter,
          refundedCredits: params.amount,
          status: poolUpdates.status || pool.status,
          ledgerEntryId: entry.id,
          paymentId: params.paymentId,
        },
        reason: params.reason,
        ticketRef: params.ticketRef,
        requestId: params.requestId,
      });

      this.logger.log(
        `[LedgerService] REFUND recorded: -${params.amount} on pool ${params.creditPoolId} for payment ${params.paymentId} (new balance: ${balanceAfter})`,
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
  async expirePoolCredits(
    paramsOrPoolId: ExpirePoolCreditsParams | string,
    legacyActorId = "system",
    legacyClientTx?: Prisma.TransactionClient,
  ): Promise<any> {
    if (typeof paramsOrPoolId === "string") {
      const poolId = paramsOrPoolId;
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
          reason: LedgerReason.POOL_EXPIRED as any,
          idempotencyKey,
          actorId: legacyActorId,
          shadow: false,
        });

        await tx.creditPool.update({
          where: { id: pool.id },
          data: { status: PoolStatus.EXPIRED },
        });

        return entry;
      };

      return legacyClientTx ? execute(legacyClientTx) : this.prisma.$transaction(execute);
    }

    const params = paramsOrPoolId;
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

      const isKnownReason = Object.values(LedgerReason).includes(params.reason as any);
      const entryReason: LedgerReason = isKnownReason
        ? (params.reason as LedgerReason)
        : LedgerReason.POOL_EXPIRED;
      const entryReasonNote = !isKnownReason && typeof params.reason === "string" ? params.reason : undefined;

      const org = await tx.organization.findFirst({
        where: { billingAccountId: pool.billing_account_id },
        select: { id: true },
      });
      const orgId = org?.id || "00000000-0000-0000-0000-000000000000";

      await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: pool.billing_account_id,
          organizationId: orgId,
          creditPoolId: pool.id,
          entryType: LedgerEntryType.EXPIRE,
          amount,
          balanceAfter: 0,
          reason: entryReason,
          reasonNote: entryReasonNote,
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
    if (filter.reason) where.reason = filter.reason;

    if (filter.includeShadow !== true) {
      where.shadow = false;
    }

    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) where.createdAt.gte = new Date(filter.startDate);
      if (filter.endDate) where.createdAt.lte = new Date(filter.endDate);
    }

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
   * Generates a pseudonymous CSV export string matching Artifact 05 API-H2-07.
   * Strictly UUIDs and financial identifiers â€” zero candidate PII.
   */
  async exportLedgerCsv(filter: LedgerQueryFilter = {}): Promise<string> {
    const entries = await this.getLedgerEntries({
      ...filter,
      limit: 10000,
      offset: 0,
    });

    const headers = [
      "id",
      "createdAt",
      "entryType",
      "amount",
      "balanceAfter",
      "billingAccountId",
      "creditPoolId",
      "sessionId",
      "driveId",
      "reason",
      "actorId",
      "idempotencyKey",
      "shadow",
    ];

    const rows = entries.map((e) => [
      e.id,
      e.createdAt.toISOString(),
      e.entryType,
      e.amount,
      e.balanceAfter !== null ? e.balanceAfter : "",
      e.billingAccountId,
      e.creditPoolId || "",
      e.sessionId || "",
      e.driveId || "",
      e.reason,
      e.actorId,
      e.idempotencyKey,
      e.shadow ? "true" : "false",
    ]);

    const csvLines = [headers.join(",")];
    for (const row of rows) {
      csvLines.push(
        row
          .map((val) => {
            const str = String(val);
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(","),
      );
    }

    return csvLines.join("\n");
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

  /**
   * List declared incident windows (API-H2-23).
   */
  async listIncidentWindows() {
    return this.prisma.incidentWindow.findMany({
      orderBy: { startedAt: "desc" },
    });
  }

  /**
   * Declares an incident window and triggers automated T3 session credit reversals (API-H2-24).
   *
   * Invariants enforced (Artifact 02 Â§9.3, Artifact 05 API-H2-24, Artifact 06 Â§3.2):
   * - Platform staff authentication: FINANCE or OWNER role required.
   * - Validated non-PII title and reason (min 10 chars).
   * - Mandatory ticket reference.
   * - Identifies candidate sessions running during [startedAt, endedAt] with infrastructure fault.
   * - Reverses eligible CONSUME credit ledger entries with reason INCIDENT_WINDOW.
   * - Audited in billing.billing_audit_event.
   */
  async declareIncidentWindow(
    actor: LedgerActor,
    dto: DeclareIncidentWindowDto,
  ): Promise<IncidentWindowResultDto> {
    const actorInfo = this.extractActorInfo(actor);
    if (
      actorInfo.actorRole !== PlatformStaffRole.FINANCE &&
      actorInfo.actorRole !== PlatformStaffRole.OWNER
    ) {
      throw new ForbiddenException(
        `UNAUTHORIZED_ROLE_FOR_INCIDENT: Only FINANCE or OWNER can declare incident windows (received '${actorInfo.actorRole}')`,
      );
    }

    if (!dto || typeof dto !== "object") {
      throw new BadRequestException("INVALID_DTO: Incident payload is required");
    }

    if (!dto.title || typeof dto.title !== "string" || dto.title.trim().length < 3) {
      throw new BadRequestException("INVALID_TITLE: A title of at least 3 characters is required");
    }

    if (!dto.ticketRef || typeof dto.ticketRef !== "string" || dto.ticketRef.trim().length < 3) {
      throw new BadRequestException("INVALID_TICKET_REF: A valid ticket reference is mandatory");
    }

    if (!dto.reason || typeof dto.reason !== "string" || dto.reason.trim().length < 10) {
      throw new BadRequestException("INVALID_REASON: A descriptive reason of at least 10 characters is mandatory");
    }

    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
    if (emailRegex.test(dto.title) || emailRegex.test(dto.reason)) {
      throw new BadRequestException("CANDIDATE_PII_PROHIBITED: Candidate PII is strictly prohibited in incident declarations");
    }

    const startedAt = new Date(dto.startedAt);
    if (isNaN(startedAt.getTime())) {
      throw new BadRequestException("INVALID_START_DATE: startedAt must be a valid date");
    }

    let endedAt: Date | null = null;
    if (dto.endedAt) {
      endedAt = new Date(dto.endedAt);
      if (isNaN(endedAt.getTime()) || endedAt <= startedAt) {
        throw new BadRequestException("INVALID_END_DATE: endedAt must be after startedAt");
      }
    }

    const affectedDrives = Array.isArray(dto.affectedDrives) ? dto.affectedDrives : [];

    // 1. Create incident window record
    const incident = await this.prisma.incidentWindow.create({
      data: {
        title: dto.title.trim(),
        reason: dto.reason.trim(),
        ticketRef: dto.ticketRef.trim(),
        startedAt,
        endedAt,
        affectedDrives,
        reversalStatus: "PENDING",
        createdBy: actorInfo.actorId,
      },
    });

    // 2. Identify candidate sessions running in the window
    const sessionEvidenceWhere: any = {
      startedAt: { gte: startedAt },
    };
    if (endedAt) {
      sessionEvidenceWhere.startedAt.lte = endedAt;
    }
    if (affectedDrives.length > 0) {
      sessionEvidenceWhere.driveId = { in: affectedDrives };
    }

    const eligibleEvidence = await this.prisma.sessionBillingEvidence.findMany({
      where: sessionEvidenceWhere,
      select: { sessionId: true },
    });

    const sessionIds = eligibleEvidence.map((e) => e.sessionId);

    // 3. Find unreversed CONSUME ledger entries for these sessions
    let reversalsTriggered = 0;
    if (sessionIds.length > 0) {
      const consumeEntries = await this.prisma.creditLedgerEntry.findMany({
        where: {
          sessionId: { in: sessionIds },
          entryType: LedgerEntryType.CONSUME,
          shadow: false,
          reversedBy: { none: {} },
        },
      });

      for (const entry of consumeEntries) {
        try {
          await this.reverseCredit({
            relatedEntryId: entry.id,
            reason: LedgerReason.INCIDENT_WINDOW,
            reasonNote: `Automated reversal for incident: ${incident.title}`,
            ticketRef: incident.ticketRef,
            idempotencyKey: `incident:${incident.id}:reversal:${entry.id}`,
            actor,
          });
          reversalsTriggered++;
        } catch (err) {
          this.logger.warn(
            `[LedgerService] Failed to reverse entry ${entry.id} during incident ${incident.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    // 4. Mark incident window as EXECUTED
    const updatedIncident = await this.prisma.incidentWindow.update({
      where: { id: incident.id },
      data: { reversalStatus: "EXECUTED" },
    });

    await this.recordBillingAudit(this.prisma, {
      actorId: actorInfo.actorId,
      actorRole: actorInfo.actorRole,
      subjectType: "INCIDENT",
      subjectId: incident.id,
      action: "INCIDENT_WINDOW_DECLARED",
      after: {
        title: updatedIncident.title,
        startedAt: updatedIncident.startedAt,
        endedAt: updatedIncident.endedAt,
        reversalsTriggered,
      },
      reason: dto.reason.trim(),
      ticketRef: dto.ticketRef.trim(),
    });

    return {
      id: updatedIncident.id,
      title: updatedIncident.title,
      reason: updatedIncident.reason,
      ticketRef: updatedIncident.ticketRef,
      startedAt: updatedIncident.startedAt,
      endedAt: updatedIncident.endedAt,
      affectedDrives: updatedIncident.affectedDrives,
      reversalStatus: updatedIncident.reversalStatus,
      reversalsTriggered,
      createdBy: updatedIncident.createdBy,
      createdAt: updatedIncident.createdAt,
    };
  }

  /**
   * Acquires the canonical PostgreSQL advisory transaction lock on BillingAccount (Rule R4).
   * Lock order: BillingAccount advisory lock -> Session row -> CreditPool row -> Ledger insert.
   */
  async acquireAccountLock(tx: any, billingAccountId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${billingAccountId}::text, 0))`;
  }

  /**
   * Low-level atomic entry creator adhering strictly to Rules R1, R2, R4, R5, and database constraints.
   * If an entry with the idempotencyKey already exists, returns the existing record idempotently.
   */
  async recordEntry(
    tx: any,
    params: RecordEntryParams,
  ) {
    if (!Number.isInteger(params.amount)) {
      throw new BadRequestException("Credit amounts must be whole integers (Rule R1)");
    }

    if (params.reasonNote && params.reasonNote.length > 200) {
      throw new BadRequestException("Reason note must not exceed 200 characters");
    }

    const existing = await tx.creditLedgerEntry.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      this.logger.debug(
        `Idempotent duplicate entry detected for key ${params.idempotencyKey}. Returning existing entry ${existing.id}`,
      );
      return existing;
    }

    this.validateEntryInvariants(params);

    const isShadow = params.shadow ?? false;
    let balanceAfter: number | null = null;

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
            ...(newRemaining === 0 && pool.cachedRemaining > 0
              ? { status: "EXHAUSTED" }
              : {}),
          },
        });
        balanceAfter = updatedPool.cachedRemaining;
      }

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
        const settleAmount = Math.abs(params.amount);
        await tx.billingAccount.update({
          where: { id: params.billingAccountId },
          data: { overdraftUsed: { decrement: settleAmount } },
        });
      } else if (params.entryType === LedgerEntryType.REVERSAL && !params.creditPoolId) {
        await tx.billingAccount.update({
          where: { id: params.billingAccountId },
          data: { overdraftUsed: { decrement: 1 } },
        });
      }
    }

    return tx.creditLedgerEntry.create({
      data: {
        billingAccountId: params.billingAccountId,
        organizationId: params.organizationId,
        creditPoolId: params.creditPoolId ?? null,
        entryType: params.entryType as any,
        amount: params.amount,
        balanceAfter,
        sessionId: params.sessionId ?? null,
        driveId: params.driveId ?? null,
        relatedEntryId: params.relatedEntryId ?? null,
        grantSource: (params.grantSource as any) ?? null,
        reason: params.reason as any,
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
   * Retrieves real-time account balances and overdraft usage.
   */
  async getAccountBalance(billingAccountId: string): Promise<AccountBalanceSummary> {
    const account = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: {
        pools: {
          where: {
            status: { in: ["ACTIVE", "QUEUED"] as any },
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
      if (pool.status === "ACTIVE") {
        activePoolCredits += pool.cachedRemaining;
      } else if (pool.status === "QUEUED") {
        queuedPoolCredits += pool.cachedRemaining;
      }
    }

    const activePools = account.pools.filter((p) => p.status === "ACTIVE");
    const queuedPools = account.pools.filter((p) => p.status === "QUEUED");
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
      const aggregate = await this.prisma.creditLedgerEntry.aggregate({
        where: {
          creditPoolId: pool.id,
          shadow: false,
        },
        _sum: {
          amount: true,
        },
      });

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

    const overdraftAgg = await this.prisma.creditLedgerEntry.aggregate({
      where: {
        billingAccountId: account.id,
        entryType: LedgerEntryType.OVERDRAFT as any,
        shadow: false,
      },
      _sum: { amount: true },
    });
    const settleAgg = await this.prisma.creditLedgerEntry.aggregate({
      where: {
        billingAccountId: account.id,
        entryType: LedgerEntryType.OVERDRAFT_SETTLE as any,
        shadow: false,
      },
      _sum: { amount: true },
    });
    const reversalAgg = await this.prisma.creditLedgerEntry.aggregate({
      where: {
        billingAccountId: account.id,
        entryType: LedgerEntryType.REVERSAL as any,
        creditPoolId: null,
        shadow: false,
      },
      _sum: { amount: true },
    });

    const overdraftSum = overdraftAgg._sum.amount ?? 0;
    const settleSum = settleAgg._sum.amount ?? 0;
    const reversalSum = reversalAgg._sum.amount ?? 0;

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

  /**
   * Acquires a candidate session credit under the BillingAccount lock.
   * Backward-compatible entrypoint used by legacy recruiter pipeline and tests.
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

  private validateEntryInvariants(params: RecordEntryParams) {
    const { entryType, amount, creditPoolId, grantSource, relatedEntryId, paymentId, requestId } = params;

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

    if (!creditPoolId && entryType !== LedgerEntryType.OVERDRAFT && entryType !== LedgerEntryType.WAIVE && entryType !== LedgerEntryType.REVERSAL) {
      throw new BadRequestException(`creditPoolId is required for ${entryType}`);
    }

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
  }
}

