import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger/ledger.service";
import {
  PoolType,
  PoolStatus,
  GrantSource,
  LedgerEntryType,
  LedgerReason,
} from "@cd-recruit/shared-types";
import { Prisma } from "@prisma/client";

export interface CreatePoolDto {
  billingAccountId: string;
  organizationId?: string;
  poolType: PoolType;
  name?: string;
  source?: GrantSource;
  totalCredits: number;
  validityDays?: number;
  maxWaitDays?: number;
  driveId?: string | null;
  paymentId?: string | null;
  requestId?: string | null;
  unitPriceMinor?: number | null;
  currency?: string | null;
  actorId: string;
}

@Injectable()
export class PoolService {
  private readonly logger = new Logger(PoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Creates a new CreditPool and mints initial opening credits via a matching GRANT entry.
   * Adheres to Plan A (Drive Pass with 7-Day Makeup Window) or Plan B (Talent Reserve with Jio Model).
   */
  async createPool(dto: CreatePoolDto) {
    if (!Number.isInteger(dto.totalCredits) || dto.totalCredits < 0) {
      throw new BadRequestException("totalCredits must be a non-negative integer (Rule R1)");
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.acquireAccountLock(tx, dto.billingAccountId);

      const account = await tx.billingAccount.findUnique({
        where: { id: dto.billingAccountId },
        include: { organizations: true },
      });
      if (!account) {
        throw new NotFoundException(`BillingAccount ${dto.billingAccountId} not found`);
      }
      const organizationId = account.organizations[0]?.id || "system";

      let status = PoolStatus.QUEUED;
      let expiresAt: Date | null = null;
      let clockStartedAt: Date | null = null;
      let activatedAt: Date | null = null;
      let queueOrder: number | null = null;

      if (dto.poolType === PoolType.DRIVE_PASS) {
        if (!dto.driveId) {
          throw new BadRequestException("driveId is required for DRIVE_PASS pool");
        }
        const drive = await tx.drive.findUnique({
          where: { id: dto.driveId },
        });
        if (!drive) {
          throw new NotFoundException(`Drive ${dto.driveId} not found`);
        }

        // Section 1 / Section 6.1: 7-Day Makeup Window
        // expiresAt = drive.scheduleEnd + 7 days
        const baseDate = drive.scheduleEnd || new Date();
        expiresAt = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        status = PoolStatus.ACTIVE;
        activatedAt = new Date();
        clockStartedAt = new Date();
      } else {
        // Plan B: Talent Reserve / Enterprise
        // Check if there is already an ACTIVE general pool for the account
        const activeGeneral = await tx.creditPool.findFirst({
          where: {
            billingAccountId: dto.billingAccountId,
            driveId: null,
            status: PoolStatus.ACTIVE,
          },
        });

        if (!activeGeneral) {
          // No active pool -> promote immediately
          status = PoolStatus.ACTIVE;
          activatedAt = new Date();
          clockStartedAt = new Date();
          if (dto.validityDays) {
            expiresAt = new Date(Date.now() + dto.validityDays * 24 * 60 * 60 * 1000);
          }
        } else {
          // General pool already active -> queue it sequentially
          status = PoolStatus.QUEUED;
        }

        // Assign unique queue order under account lock
        const maxOrderPool = await tx.creditPool.findFirst({
          where: {
            billingAccountId: dto.billingAccountId,
            driveId: null,
            status: { in: [PoolStatus.QUEUED, PoolStatus.ACTIVE] },
          },
          orderBy: { queueOrder: "desc" },
        });
        queueOrder = (maxOrderPool?.queueOrder ?? 0) + 1;
      }

      // Create Pool record
      const pool = await tx.creditPool.create({
        data: {
          billingAccountId: dto.billingAccountId,
          driveId: dto.driveId ?? null,
          poolType: dto.poolType,
          name: dto.name || `${dto.poolType} Pool`,
          source: dto.source || (dto.paymentId ? GrantSource.PURCHASE : GrantSource.TRIAL),
          totalCredits: dto.totalCredits,
          cachedRemaining: 0, // LedgerService.recordEntry increments this to totalCredits via GRANT entry
          validityDays: dto.validityDays ?? null,
          maxWaitDays: dto.maxWaitDays ?? 365,
          queueOrder,
          status,
          clockStartedAt,
          activatedAt,
          expiresAt,
          unitPriceMinor: dto.unitPriceMinor ?? null,
          currency: dto.currency ?? account.currency,
          paymentId: dto.paymentId ?? null,
        },
      });

      // If initial credits > 0, write matching GRANT ledger entry
      if (dto.totalCredits > 0) {
        const source = dto.source || (dto.paymentId ? GrantSource.PURCHASE : GrantSource.TRIAL);
        const reason = source === GrantSource.PURCHASE ? LedgerReason.PAYMENT_CAPTURED : LedgerReason.TRIAL;
        const idempotencyKey = `grant:pool:${pool.id}:init`;
        await this.ledgerService.recordEntry(tx, {
          billingAccountId: dto.billingAccountId,
          organizationId,
          creditPoolId: pool.id,
          entryType: LedgerEntryType.GRANT,
          amount: dto.totalCredits,
          grantSource: source,
          reason,
          paymentId: dto.paymentId,
          requestId: dto.requestId,
          idempotencyKey,
          actorId: dto.actorId,
          shadow: false,
        });
      }

      return tx.creditPool.findUniqueOrThrow({ where: { id: pool.id } });
    });
  }

  /**
   * Promotes the next queued general pool to ACTIVE when current pool is exhausted or expired.
   * "The Jio Model" (Section 6).
   */
  async promoteNextPool(billingAccountId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.ledgerService.acquireAccountLock(tx, billingAccountId);

      // Check if there is already an ACTIVE general pool
      const currentActive = await tx.creditPool.findFirst({
        where: {
          billingAccountId,
          driveId: null,
          status: PoolStatus.ACTIVE,
        },
      });
      if (currentActive && currentActive.cachedRemaining > 0) {
        const now = new Date();
        if (!currentActive.expiresAt || currentActive.expiresAt > now) {
          this.logger.debug(`Pool ${currentActive.id} is still ACTIVE with balance ${currentActive.cachedRemaining}`);
          return currentActive;
        }
      }

      // Find lowest queueOrder QUEUED general pool
      const nextPool = await tx.creditPool.findFirst({
        where: {
          billingAccountId,
          driveId: null,
          status: PoolStatus.QUEUED,
        },
        orderBy: { queueOrder: "asc" },
      });

      if (!nextPool) {
        this.logger.debug(`No queued pools found for account ${billingAccountId}`);
        return null;
      }

      const now = new Date();
      const clockStartedAt = nextPool.clockStartedAt || now;
      const validityDays = nextPool.validityDays || 180;
      const expiresAt = new Date(clockStartedAt.getTime() + validityDays * 24 * 60 * 60 * 1000);

      const promoted = await tx.creditPool.update({
        where: { id: nextPool.id },
        data: {
          status: PoolStatus.ACTIVE,
          activatedAt: now,
          clockStartedAt,
          expiresAt,
        },
      });

      this.logger.log(`Promoted CreditPool ${promoted.id} to ACTIVE for account ${billingAccountId}`);
      return promoted;
    });
  }

  /**
   * Verifies whether a given drive pass is currently within its 7-day post-drive makeup window.
   */
  async isWithinMakeupWindow(driveId: string): Promise<boolean> {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });
    if (!drive || !drive.scheduleEnd) return false;

    const now = new Date();
    const makeupDeadline = new Date(drive.scheduleEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
    return now <= makeupDeadline;
  }

  /**
   * Retrieves all pools for a billing account.
   */
  async getPoolsForAccount(billingAccountId: string) {
    return this.prisma.creditPool.findMany({
      where: { billingAccountId },
      orderBy: [{ driveId: "asc" }, { queueOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Retrieves the active Drive Pass pool for a given drive.
   */
  async getActivePoolForDrive(driveId: string) {
    return this.prisma.creditPool.findFirst({
      where: {
        driveId,
        status: PoolStatus.ACTIVE,
      },
    });
  }

  /**
   * Retrieves the current active general pool for an account.
   */
  async getActiveGeneralPool(billingAccountId: string) {
    return this.prisma.creditPool.findFirst({
      where: {
        billingAccountId,
        driveId: null,
        status: PoolStatus.ACTIVE,
      },
    });
  }

  /**
   * Housekeeping job: sweeps all active pools whose expiresAt has passed.
   */
  async sweepExpiredPools(billingAccountId?: string) {
    const now = new Date();
    const expiredPools = await this.prisma.creditPool.findMany({
      where: {
        ...(billingAccountId ? { billingAccountId } : {}),
        status: PoolStatus.ACTIVE,
        expiresAt: { lte: now },
      },
    });

    const expiredEntries = [];
    for (const pool of expiredPools) {
      const entry = await this.ledgerService.expirePoolCredits(pool.id);
      if (entry) expiredEntries.push(entry);
    }
    return expiredEntries;
  }
}
