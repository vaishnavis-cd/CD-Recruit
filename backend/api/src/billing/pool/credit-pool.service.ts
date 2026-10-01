import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { randomUUID } from "node:crypto";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { LedgerActor, LedgerEntryType, LedgerReason } from "../ledger/ledger.types";
import {
  PoolType,
  PoolStatus,
  PoolGrantSource,
  CreatePoolDto,
  CreditPoolContext,
  CreditPoolSummary,
  CreditPoolDetailDto,
} from "./credit-pool.types";
import { sanitizeAuditData } from "../../platform/audit/platform-audit.util";

@Injectable()
export class CreditPoolService {
  private readonly logger = new Logger(CreditPoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Authoritatively extracts actor identity for billing audit.
   * Rejects recruiter staff and unauthenticated client spoofing.
   */
  private extractActorInfo(actor?: LedgerActor): { actorId: string; actorRole: string } {
    if (!actor || actor === "system") {
      return { actorId: "system", actorRole: "system" };
    }

    if (typeof actor === "object") {
      if ((actor as any).isPlatformStaff !== true) {
        throw new ForbiddenException(
          "RECRUITER_IDENTITY_CANNOT_BE_PLATFORM_ACTOR: Only authenticated PlatformStaff or system can act on billing domain",
        );
      }

      const role = actor.platformRole || actor.role;
      if (!role || !Object.values(PlatformStaffRole).includes(role as PlatformStaffRole)) {
        throw new BadRequestException(`INVALID_PLATFORM_ROLE: Invalid role '${role}' for platform actor`);
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
  ): Promise<void> {
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
   * Creates a new CreditPool with full validation and immediate initial allocation.
   *
   * Invariants enforced:
   * - Total credits must be > 0 (chk_pool_total_positive).
   * - Pool type must be DRIVE_PASS, TALENT_RESERVE, or ENTERPRISE.
   * - DRIVE_PASS requires valid driveId; General pools forbid driveId.
   * - Exactly one ACTIVE general pool per billing account (uq_pool_one_active_general).
   * - Exactly one ACTIVE pass per drive (uq_pool_one_active_per_drive).
   * - Sequential queue orders for general pools (uq_pool_queue_order).
   * - Ledger is the source of truth: writes initial GRANT entry matching totalCredits.
   * - Atomicity via transaction and PostgreSQL advisory lock.
   */
  async createPool(params: CreatePoolDto, context?: CreditPoolContext) {
    if (!params.billingAccountId || typeof params.billingAccountId !== "string") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    if (!params.name || typeof params.name !== "string" || params.name.trim() === "") {
      throw new BadRequestException("INVALID_POOL_NAME: Pool name is required");
    }

    if (!params.totalCredits || !Number.isInteger(params.totalCredits) || params.totalCredits <= 0) {
      throw new BadRequestException("INVALID_TOTAL_CREDITS: Total credits must be a positive integer");
    }

    const validPoolTypes = Object.values(PoolType);
    if (!validPoolTypes.includes(params.poolType as PoolType)) {
      throw new BadRequestException(
        `INVALID_POOL_TYPE: Pool type '${params.poolType}' is not supported. Must be one of: ${validPoolTypes.join(", ")}`,
      );
    }

    const validSources = Object.values(PoolGrantSource);
    if (!validSources.includes(params.source as PoolGrantSource)) {
      throw new BadRequestException(
        `INVALID_POOL_SOURCE: Source '${params.source}' is not supported. Must be one of: ${validSources.join(", ")}`,
      );
    }

    // Drive pass validation
    if (params.poolType === PoolType.DRIVE_PASS) {
      if (!params.driveId || typeof params.driveId !== "string" || params.driveId.trim() === "") {
        throw new BadRequestException("DRIVE_ID_REQUIRED_FOR_DRIVE_PASS: Drive Pass pools require a valid driveId");
      }
    } else {
      if (params.driveId) {
        throw new BadRequestException("DRIVE_ID_FORBIDDEN: General credit pools cannot be linked to a specific driveId");
      }
    }

    if (params.validityDays !== undefined && params.validityDays !== null) {
      if (!Number.isInteger(params.validityDays) || params.validityDays <= 0) {
        throw new BadRequestException("INVALID_VALIDITY_DAYS: Validity days must be a positive integer");
      }
    }

    if (params.unitPriceMinor !== undefined && params.unitPriceMinor !== null) {
      if (!Number.isInteger(params.unitPriceMinor) || params.unitPriceMinor < 0) {
        throw new BadRequestException("INVALID_UNIT_PRICE: Unit price must be a non-negative integer in minor currency units");
      }
    }

    const client = context?.tx || this.prisma;

    // Resolve target BillingAccount
    const account = await client.billingAccount.findUnique({
      where: { id: params.billingAccountId },
      include: { organization: true },
    });

    if (!account) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${params.billingAccountId}' not found`);
    }

    if (account.status === "SUSPENDED") {
      throw new ForbiddenException("ACCOUNT_SUSPENDED: Cannot create credit pools for a suspended billing account");
    }

    const { actorId, actorRole } = this.extractActorInfo(context?.actor);
    const poolId = randomUUID();
    const currency = params.currency || account.currency || "INR";
    const now = new Date();

    const executeInTransaction = async (tx: any) => {
      // 1. Acquire advisory lock on billing account to prevent race conditions on topology & queue orders
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `pool_mgmt:${params.billingAccountId}`,
      );

      let status = params.status || PoolStatus.QUEUED;
      let activatedAt: Date | null = null;
      let clockStartedAt: Date | null = null;
      let expiresAt: Date | null = null;
      let queueOrder: number | null = null;

      // 2. Topology & Status logic
      if (params.poolType === PoolType.DRIVE_PASS) {
        // Lock drive pool namespace
        await tx.$executeRawUnsafe(
          "SELECT pg_advisory_xact_lock(hashtext($1))",
          `drive_pool:${params.driveId}`,
        );

        const activeDrivePass = await tx.creditPool.findFirst({
          where: {
            driveId: params.driveId,
            status: PoolStatus.ACTIVE,
          },
        });

        if (activeDrivePass) {
          throw new ConflictException(
            `ACTIVE_DRIVE_PASS_EXISTS: An active Drive Pass already exists for drive '${params.driveId}' (${activeDrivePass.id})`,
          );
        }

        status = PoolStatus.ACTIVE;
        activatedAt = now;
        clockStartedAt = now;
        queueOrder = null;

        if (params.expiresAt) {
          expiresAt = new Date(params.expiresAt);
        } else {
          // Check drive schedule end for 7-day makeup window
          const drive = await tx.drive.findUnique({
            where: { id: params.driveId! },
            select: { scheduleEnd: true },
          });

          if (drive?.scheduleEnd) {
            expiresAt = new Date(drive.scheduleEnd.getTime() + 7 * 86400000);
          } else if (params.validityDays) {
            expiresAt = new Date(now.getTime() + params.validityDays * 86400000);
          }
        }
      } else {
        // General Pool (TALENT_RESERVE / ENTERPRISE)
        const activeGeneralPool = await tx.creditPool.findFirst({
          where: {
            billingAccountId: params.billingAccountId,
            driveId: null,
            status: PoolStatus.ACTIVE,
          },
        });

        if (!activeGeneralPool) {
          // No active general pool -> Can start as ACTIVE
          status = params.status === PoolStatus.QUEUED ? PoolStatus.QUEUED : PoolStatus.ACTIVE;

          if (status === PoolStatus.ACTIVE) {
            activatedAt = now;
            queueOrder = 0;

            if (params.source === PoolGrantSource.TRIAL) {
              // Floating clock starts immediately for trial grant policy (Artifact 07 §2.2)
              const validityDays = params.validityDays || 30;
              clockStartedAt = now;
              expiresAt = params.expiresAt
                ? new Date(params.expiresAt)
                : new Date(now.getTime() + validityDays * 86400000);
            } else {
              clockStartedAt = params.clockStartedAt ? new Date(params.clockStartedAt) : null;
              expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;
            }
          } else {
            // Explicitly requested QUEUED
            queueOrder = 1;
          }
        } else {
          // Active general pool exists -> Must be QUEUED (Jio Model)
          if (params.status === PoolStatus.ACTIVE) {
            throw new ConflictException(
              `ACTIVE_GENERAL_POOL_ALREADY_EXISTS: Billing account already has an active general pool (${activeGeneralPool.id}). New general pool must be QUEUED.`,
            );
          }

          status = PoolStatus.QUEUED;

          const maxQueueOrderResult = await tx.creditPool.findFirst({
            where: {
              billingAccountId: params.billingAccountId,
              driveId: null,
              status: { in: [PoolStatus.QUEUED, PoolStatus.ACTIVE] },
              queueOrder: { not: null },
            },
            orderBy: { queueOrder: "desc" },
            select: { queueOrder: true },
          });

          queueOrder = (maxQueueOrderResult?.queueOrder ?? 0) + 1;
        }
      }

      // 3. Create pool record
      const pool = await tx.creditPool.create({
        data: {
          id: poolId,
          billingAccountId: params.billingAccountId,
          driveId: params.driveId || null,
          poolType: params.poolType,
          name: params.name.trim(),
          source: params.source,
          totalCredits: params.totalCredits,
          cachedRemaining: params.totalCredits,
          validityDays: params.validityDays || null,
          maxWaitDays: params.maxWaitDays || 365,
          queueOrder,
          status,
          purchasedAt: now,
          clockStartedAt,
          activatedAt,
          expiresAt,
          unitPriceMinor: params.unitPriceMinor ?? null,
          currency,
          paymentId: params.paymentId || null,
          termsVersion: params.termsVersion || null,
          termsAcceptedBy: params.termsAcceptedBy || null,
          termsAcceptedAt: params.termsAcceptedAt ? new Date(params.termsAcceptedAt) : null,
          createdAt: now,
        },
      });

      // 4. Create initial GRANT ledger entry (guarantees ledger sum == cachedRemaining)
      const idempotencyKey = `grant:pool:${poolId}`;
      const orgId = account.organization?.id || "";

      await tx.creditLedgerEntry.create({
        data: {
          billingAccountId: params.billingAccountId,
          organizationId: orgId,
          creditPoolId: poolId,
          entryType: LedgerEntryType.GRANT,
          amount: params.totalCredits,
          balanceAfter: params.totalCredits,
          grantSource: params.source,
          reason: params.reason || LedgerReason.PURCHASE_ALLOCATION,
          reasonNote: context?.reason || null,
          idempotencyKey,
          actorId,
          paymentId: params.paymentId || null,
          requestId: context?.requestId || null,
          shadow: false,
        },
      });

      // 5. Emit billing audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: poolId,
        action: "POOL_CREATED",
        after: {
          poolId,
          billingAccountId: params.billingAccountId,
          poolType: params.poolType,
          source: params.source,
          totalCredits: params.totalCredits,
          cachedRemaining: params.totalCredits,
          status,
          queueOrder,
          expiresAt,
        },
        ticketRef: context?.ticketRef,
        requestId: context?.requestId,
        reason: context?.reason || "Credit pool created with initial allocation",
      });

      this.logger.log(
        `[CreditPoolService] Created pool ${poolId} (${params.poolType}/${params.source}, ${params.totalCredits} cr, status: ${status}) for account ${params.billingAccountId}`,
      );

      return pool;
    };

    if (context?.tx) {
      return await executeInTransaction(context.tx);
    } else {
      return await this.prisma.$transaction(executeInTransaction);
    }
  }

  /**
   * Promotes the next sequential queued general pool under account advisory lock.
   *
   * Invariants enforced:
   * - Cannot promote if an existing active general pool still has balance and is not expired.
   * - Promotes the pool with the lowest queueOrder.
   * - Sets activatedAt and begins validity countdown clock.
   * - Emits billing audit event.
   */
  async promoteNextQueuedPool(billingAccountId: string, context?: CreditPoolContext) {
    if (!billingAccountId || typeof billingAccountId !== "string") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    const { actorId, actorRole } = this.extractActorInfo(context?.actor);
    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      // Advisory lock to serialize pool promotions per billing account
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `pool_mgmt:${billingAccountId}`,
      );

      const activeGeneralPool = await tx.creditPool.findFirst({
        where: {
          billingAccountId,
          driveId: null,
          status: PoolStatus.ACTIVE,
        },
      });

      if (activeGeneralPool) {
        const isExpired = activeGeneralPool.expiresAt && activeGeneralPool.expiresAt <= now;
        const isExhausted = activeGeneralPool.cachedRemaining <= 0;

        if (!isExhausted && !isExpired) {
          throw new ConflictException(
            `ACTIVE_GENERAL_POOL_ALREADY_EXISTS: Cannot promote next pool while active pool ${activeGeneralPool.id} has remaining credits and has not expired`,
          );
        }

        // Transition current active pool to terminal status if needed
        if (isExhausted && activeGeneralPool.status !== PoolStatus.EXHAUSTED) {
          await tx.creditPool.update({
            where: { id: activeGeneralPool.id },
            data: { status: PoolStatus.EXHAUSTED },
          });
        }
      }

      // Find the next queued pool with lowest queueOrder
      const nextQueuedPool = await tx.creditPool.findFirst({
        where: {
          billingAccountId,
          driveId: null,
          status: PoolStatus.QUEUED,
        },
        orderBy: [{ queueOrder: "asc" }, { createdAt: "asc" }],
      });

      if (!nextQueuedPool) {
        return null;
      }

      const clockStartedAt = nextQueuedPool.clockStartedAt || now;
      const expiresAt = nextQueuedPool.validityDays
        ? new Date(clockStartedAt.getTime() + nextQueuedPool.validityDays * 86400000)
        : null;

      const promoted = await tx.creditPool.update({
        where: { id: nextQueuedPool.id },
        data: {
          status: PoolStatus.ACTIVE,
          activatedAt: now,
          clockStartedAt,
          expiresAt,
        },
      });

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: promoted.id,
        action: "POOL_PROMOTED",
        before: {
          status: PoolStatus.QUEUED,
          queueOrder: nextQueuedPool.queueOrder,
        },
        after: {
          status: PoolStatus.ACTIVE,
          activatedAt: now,
          clockStartedAt,
          expiresAt,
        },
        ticketRef: context?.ticketRef,
        requestId: context?.requestId,
        reason: context?.reason || "Next queued pool promoted to ACTIVE",
      });

      this.logger.log(
        `[CreditPoolService] Promoted queued pool ${promoted.id} to ACTIVE for account ${billingAccountId}`,
      );

      return promoted;
    });
  }

  /**
   * Extends pool expiration date.
   *
   * Invariants enforced:
   * - Requires a valid, non-empty requestId (maker-checker requirement).
   * - Sets PostgreSQL session context `proctora.request_id` to satisfy trigger `guard_credit_pool_mutation`.
   * - New expiry date must be in the future and later than current expiry.
   * - Cannot extend an already expired or cancelled pool.
   * - Emits billing audit event.
   */
  async extendPoolExpiry(
    poolId: string,
    newExpiry: Date | string,
    requestId: string,
    context?: CreditPoolContext,
  ) {
    if (!poolId || typeof poolId !== "string") {
      throw new BadRequestException("INVALID_POOL_ID: Pool ID is required");
    }

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Extending pool expiry requires an authorized maker-checker requestId");
    }

    const targetExpiry = new Date(newExpiry);
    if (isNaN(targetExpiry.getTime())) {
      throw new BadRequestException("INVALID_EXPIRY_DATE: New expiry date must be a valid date");
    }

    if (targetExpiry <= new Date()) {
      throw new BadRequestException("EXPIRY_MUST_BE_IN_FUTURE: New expiry date must be in the future");
    }

    const { actorId, actorRole } = this.extractActorInfo(context?.actor);

    const executeInTransaction = async (tx: any) => {
      // Row lock the pool
      const pools = (await tx.$queryRawUnsafe(
        `SELECT id, expires_at, status, billing_account_id 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        poolId,
      )) as any[];

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool '${poolId}' does not exist`);
      }

      const pool = pools[0];

      if (pool.status === PoolStatus.EXPIRED || pool.status === PoolStatus.CANCELLED) {
        throw new BadRequestException(
          `CANNOT_EXTEND_TERMINAL_POOL: Cannot extend expiry of a pool in '${pool.status}' status`,
        );
      }

      if (pool.expires_at && targetExpiry <= new Date(pool.expires_at)) {
        throw new BadRequestException("NEW_EXPIRY_MUST_BE_LATER: New expiry must be later than current expiry date");
      }

      // Satisfy PostgreSQL trigger guard_credit_pool_mutation
      const sanitizedRequestId = requestId.replace(/'/g, "''");
      await tx.$executeRawUnsafe(`SET LOCAL proctora.request_id = '${sanitizedRequestId}'`);

      const updated = await tx.creditPool.update({
        where: { id: poolId },
        data: { expiresAt: targetExpiry },
      });

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: poolId,
        action: "POOL_EXPIRY_EXTENDED",
        before: { expiresAt: pool.expires_at },
        after: { expiresAt: targetExpiry },
        requestId,
        ticketRef: context?.ticketRef,
        reason: context?.reason || "Pool expiry date extended via authorized manual request",
      });

      this.logger.log(
        `[CreditPoolService] Pool ${poolId} expiry extended to ${targetExpiry.toISOString()} (requestId: ${requestId})`,
      );

      return updated;
    };

    if (context?.tx) {
      return await executeInTransaction(context.tx);
    }

    return await this.prisma.$transaction(executeInTransaction);
  }

  /**
   * Suspends a credit pool (e.g. chargeback dispute or administrative fraud stop).
   */
  async suspendPool(poolId: string, reason: string, context?: CreditPoolContext) {
    if (!poolId || typeof poolId !== "string") {
      throw new BadRequestException("INVALID_POOL_ID: Pool ID is required");
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      throw new BadRequestException("REASON_REQUIRED: A valid reason (min 3 chars) is required to suspend a pool");
    }

    const { actorId, actorRole } = this.extractActorInfo(context?.actor);

    return await this.prisma.$transaction(async (tx) => {
      const pools = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, status, billing_account_id 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        poolId,
      );

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool '${poolId}' does not exist`);
      }

      const pool = pools[0];

      if (
        pool.status === PoolStatus.EXPIRED ||
        pool.status === PoolStatus.EXHAUSTED ||
        pool.status === PoolStatus.CANCELLED
      ) {
        throw new BadRequestException(
          `INVALID_POOL_TRANSITION: Cannot suspend a pool in terminal status '${pool.status}'`,
        );
      }

      if (pool.status === PoolStatus.SUSPENDED) {
        return pool;
      }

      const updated = await tx.creditPool.update({
        where: { id: poolId },
        data: { status: PoolStatus.SUSPENDED },
      });

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: poolId,
        action: "POOL_SUSPENDED",
        before: { status: pool.status },
        after: { status: PoolStatus.SUSPENDED },
        reason,
        ticketRef: context?.ticketRef,
        requestId: context?.requestId,
      });

      this.logger.log(`[CreditPoolService] Pool ${poolId} SUSPENDED: ${reason}`);
      return updated;
    });
  }

  /**
   * Resumes a suspended credit pool once dispute/review is resolved.
   */
  async resumePool(poolId: string, reason?: string, context?: CreditPoolContext) {
    if (!poolId || typeof poolId !== "string") {
      throw new BadRequestException("INVALID_POOL_ID: Pool ID is required");
    }

    const { actorId, actorRole } = this.extractActorInfo(context?.actor);

    return await this.prisma.$transaction(async (tx) => {
      const pools = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, status, billing_account_id, drive_id 
           FROM "billing"."credit_pool" 
          WHERE id = $1 FOR UPDATE`,
        poolId,
      );

      if (!pools || pools.length === 0) {
        throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Pool '${poolId}' does not exist`);
      }

      const pool = pools[0];

      if (pool.status !== PoolStatus.SUSPENDED) {
        throw new BadRequestException(
          `POOL_NOT_SUSPENDED: Pool is currently in status '${pool.status}' and cannot be resumed`,
        );
      }

      // Check topology invariants before making ACTIVE
      if (pool.drive_id === null) {
        const activeGeneral = await tx.creditPool.findFirst({
          where: {
            billingAccountId: pool.billing_account_id,
            driveId: null,
            status: PoolStatus.ACTIVE,
          },
        });
        if (activeGeneral) {
          throw new ConflictException(
            `ACTIVE_GENERAL_POOL_ALREADY_EXISTS: Cannot resume general pool while another general pool (${activeGeneral.id}) is active`,
          );
        }
      } else {
        const activeDrive = await tx.creditPool.findFirst({
          where: {
            driveId: pool.drive_id,
            status: PoolStatus.ACTIVE,
          },
        });
        if (activeDrive) {
          throw new ConflictException(
            `ACTIVE_DRIVE_PASS_EXISTS: Cannot resume drive pool while another active pool exists for drive '${pool.drive_id}'`,
          );
        }
      }

      const updated = await tx.creditPool.update({
        where: { id: poolId },
        data: { status: PoolStatus.ACTIVE },
      });

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "POOL",
        subjectId: poolId,
        action: "POOL_RESUMED",
        before: { status: PoolStatus.SUSPENDED },
        after: { status: PoolStatus.ACTIVE },
        reason: reason || context?.reason || "Pool resumed to ACTIVE status",
        ticketRef: context?.ticketRef,
        requestId: context?.requestId,
      });

      this.logger.log(`[CreditPoolService] Pool ${poolId} RESUMED to ACTIVE`);
      return updated;
    });
  }

  /**
   * Expires unconsumed credits on a deadline.
   * Orchestrates the expiration by delegating directly to LedgerService.expirePoolCredits().
   */
  async expirePool(poolId: string, options?: { reason?: string; actor?: LedgerActor }) {
    if (!poolId || typeof poolId !== "string") {
      throw new BadRequestException("INVALID_POOL_ID: Pool ID is required");
    }

    const pool = await this.prisma.creditPool.findUnique({
      where: { id: poolId },
      select: { id: true, billingAccountId: true },
    });

    if (!pool) {
      throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Credit pool '${poolId}' not found`);
    }

    return await this.ledgerService.expirePoolCredits({
      billingAccountId: pool.billingAccountId,
      creditPoolId: pool.id,
      reason: options?.reason,
      actor: options?.actor,
    });
  }

  /**
   * Retrieves all pools for a billing account matching Artifact 05 API-H2-04.
   */
  async getAccountPools(billingAccountId: string): Promise<CreditPoolSummary[]> {
    if (!billingAccountId || typeof billingAccountId !== "string") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    const account = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
    });

    if (!account) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${billingAccountId}' not found`);
    }

    const pools = await this.prisma.creditPool.findMany({
      where: { billingAccountId },
      orderBy: [
        { status: "asc" },
        { createdAt: "desc" },
      ],
    });

    return pools.map((p) => ({
      id: p.id,
      billingAccountId: p.billingAccountId,
      driveId: p.driveId,
      poolType: p.poolType,
      name: p.name,
      source: p.source,
      totalCredits: p.totalCredits,
      cachedRemaining: p.cachedRemaining,
      validityDays: p.validityDays,
      maxWaitDays: p.maxWaitDays,
      queueOrder: p.queueOrder,
      status: p.status,
      purchasedAt: p.purchasedAt,
      clockStartedAt: p.clockStartedAt,
      activatedAt: p.activatedAt,
      expiresAt: p.expiresAt,
      unitPriceMinor: p.unitPriceMinor,
      currency: p.currency,
      paymentId: p.paymentId,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Retrieves comprehensive inspection details of a single pool matching Artifact 05 H2.2 / API-H2-05.
   */
  async getPoolById(poolId: string): Promise<CreditPoolDetailDto> {
    if (!poolId || typeof poolId !== "string") {
      throw new BadRequestException("INVALID_POOL_ID: Pool ID is required");
    }

    const pool = await this.prisma.creditPool.findUnique({
      where: { id: poolId },
      include: {
        billingAccount: true,
        payment: true,
        ledgerEntries: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            entryType: true,
            amount: true,
            balanceAfter: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException(`CREDIT_POOL_NOT_FOUND: Credit pool '${poolId}' not found`);
    }

    const now = new Date();
    const isExpired = pool.expiresAt ? pool.expiresAt <= now : false;
    let daysRemaining: number | null = null;
    if (pool.expiresAt) {
      daysRemaining = Math.max(0, Math.ceil((pool.expiresAt.getTime() - now.getTime()) / 86400000));
    }

    return {
      id: pool.id,
      billingAccountId: pool.billingAccountId,
      billingAccountName: pool.billingAccount.name,
      billingCountry: pool.billingAccount.billingCountry,
      currency: pool.currency || pool.billingAccount.currency || "INR",
      driveId: pool.driveId,
      poolType: pool.poolType,
      name: pool.name,
      source: pool.source,
      totalCredits: pool.totalCredits,
      cachedRemaining: pool.cachedRemaining,
      validityDays: pool.validityDays,
      maxWaitDays: pool.maxWaitDays,
      queueOrder: pool.queueOrder,
      status: pool.status,
      purchasedAt: pool.purchasedAt,
      clockStartedAt: pool.clockStartedAt,
      activatedAt: pool.activatedAt,
      expiresAt: pool.expiresAt,
      daysRemaining,
      isExpired,
      isGeneral: pool.driveId === null,
      unitPriceMinor: pool.unitPriceMinor,
      paymentId: pool.paymentId,
      paymentInvoiceNumber: pool.payment?.invoiceNumber || null,
      termsVersion: pool.termsVersion,
      termsAcceptedBy: pool.termsAcceptedBy,
      termsAcceptedAt: pool.termsAcceptedAt,
      createdAt: pool.createdAt,
      recentLedgerEntries: pool.ledgerEntries,
    };
  }
}
