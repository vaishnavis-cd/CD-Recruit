import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  Prisma,
  SessionKind,
  LedgerEntryType,
  LedgerReason,
  PoolStatus,
} from "@prisma/client";
import { DrivePoolFallthrough } from "@cd-recruit/shared-types";

export interface ShadowAcquisitionResult {
  outcome:
    | "FUNDED_DRIVE_PASS"
    | "FUNDED_TALENT_RESERVE"
    | "UNFUNDED_NO_BALANCE"
    | "WAIVED_NON_LIVE"
    | "ALREADY_PROCESSED"
    | "SHADOW_ERROR";
  poolId?: string | null;
  simulatedBalanceAfter?: number | null;
  ledgerEntryId?: string | null;
  error?: string;
  latencyMs: number;
}

@Injectable()
export class ShadowBillingService {
  private readonly logger = new Logger(ShadowBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates and records a shadow billing acquisition for a candidate session.
   * Runs inside a PostgreSQL SAVEPOINT when an external transaction is provided,
   * guaranteeing that shadow simulation failures NEVER fail the real session start.
   */
  async processShadowSession(
    sessionId: string,
    externalTx?: Prisma.TransactionClient,
  ): Promise<ShadowAcquisitionResult> {
    const startTime = Date.now();
    const db = externalTx || this.prisma;

    const execute = async (tx: Prisma.TransactionClient): Promise<ShadowAcquisitionResult> => {
      let savepointCreated = false;
      try {
        // Step 1: Establish SAVEPOINT if inside an interactive transaction
        if (externalTx) {
          await tx.$executeRaw`SAVEPOINT shadow_billing`;
          savepointCreated = true;
        }

        // Step 2: Fetch Session, Drive, Organization, and Billing Account
        const session = await tx.session.findUnique({
          where: { id: sessionId },
          include: { drive: true },
        });

        if (!session) {
          this.logger.warn(`[ShadowBilling] Session ${sessionId} not found.`);
          return {
            outcome: "SHADOW_ERROR",
            error: `Session ${sessionId} not found`,
            latencyMs: Date.now() - startTime,
          };
        }

        // Rule: Non-LIVE sessions (PREVIEW / SANDBOX) are waived from credit acquisition
        if (session.kind !== SessionKind.LIVE) {
          if (savepointCreated) {
            await tx.$executeRaw`RELEASE SAVEPOINT shadow_billing`;
          }
          return {
            outcome: "WAIVED_NON_LIVE",
            latencyMs: Date.now() - startTime,
          };
        }

        const org = await tx.organization.findUnique({
          where: { id: session.organizationId },
        });

        if (!org || !org.billingAccountId) {
          this.logger.warn(
            `[ShadowBilling] Organization ${session.organizationId} has no billing account.`,
          );
          if (savepointCreated) {
            await tx.$executeRaw`RELEASE SAVEPOINT shadow_billing`;
          }
          return {
            outcome: "SHADOW_ERROR",
            error: "No billing account found for organization",
            latencyMs: Date.now() - startTime,
          };
        }

        const billingAccountId = org.billingAccountId;
        const idempotencyKey = `shadow:acquire:${sessionId}`;

        // Step 3: Check idempotency
        const existingEntry = await tx.creditLedgerEntry.findUnique({
          where: { idempotencyKey },
        });

        if (existingEntry) {
          if (savepointCreated) {
            await tx.$executeRaw`RELEASE SAVEPOINT shadow_billing`;
          }
          return {
            outcome: "ALREADY_PROCESSED",
            poolId: existingEntry.creditPoolId,
            simulatedBalanceAfter: existingEntry.balanceAfter,
            ledgerEntryId: existingEntry.id,
            latencyMs: Date.now() - startTime,
          };
        }

        // Step 4: Simulate Pool Selection according to Authoritative Spec (Rule R4 / Section 4.1)
        // 4A: Check for active Drive Pass bound to this drive
        let selectedPool: any = null;
        let poolOutcome: "FUNDED_DRIVE_PASS" | "FUNDED_TALENT_RESERVE" | "UNFUNDED_NO_BALANCE" =
          "UNFUNDED_NO_BALANCE";

        const now = new Date();

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

          if (selectedPool) {
            poolOutcome = "FUNDED_DRIVE_PASS";
          }
        }

        // 4B: If no Drive Pass, check general Talent Reserve / Enterprise active pools
        // Allowed if drive fallthrough == 'ALLOW' OR no active drive pool was configured
        if (!selectedPool) {
          const allowFallthrough =
            !session.driveId ||
            !session.drive ||
            session.drive.fallthrough === DrivePoolFallthrough.ALLOW;

          if (allowFallthrough) {
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

            if (selectedPool) {
              poolOutcome = "FUNDED_TALENT_RESERVE";
            }
          }
        }

        // Step 5: Record Shadow Ledger Entry (shadow = true, zero balance mutations)
        let createdEntry: any;

        if (selectedPool) {
          createdEntry = await tx.creditLedgerEntry.create({
            data: {
              billingAccountId,
              organizationId: session.organizationId,
              creditPoolId: selectedPool.id,
              entryType: LedgerEntryType.CONSUME,
              amount: -1,
              balanceAfter: selectedPool.cachedRemaining - 1,
              sessionId: session.id,
              driveId: session.driveId,
              reason: LedgerReason.ATTEMPT_START,
              idempotencyKey,
              actorId: "system",
              shadow: true,
            },
          });
        } else {
          // Unbacked / Overdraft simulation in shadow mode
          createdEntry = await tx.creditLedgerEntry.create({
            data: {
              billingAccountId,
              organizationId: session.organizationId,
              creditPoolId: null,
              entryType: LedgerEntryType.OVERDRAFT,
              amount: -1,
              balanceAfter: null,
              sessionId: session.id,
              driveId: session.driveId,
              reason: LedgerReason.OVERDRAFT_USED,
              idempotencyKey,
              actorId: "system",
              shadow: true,
            },
          });
          poolOutcome = "UNFUNDED_NO_BALANCE";
        }

        if (savepointCreated) {
          await tx.$executeRaw`RELEASE SAVEPOINT shadow_billing`;
        }

        return {
          outcome: poolOutcome,
          poolId: selectedPool?.id ?? null,
          simulatedBalanceAfter: createdEntry.balanceAfter,
          ledgerEntryId: createdEntry.id,
          latencyMs: Date.now() - startTime,
        };
      } catch (err: any) {
        if (savepointCreated) {
          try {
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT shadow_billing`;
          } catch (rollbackErr: any) {
            this.logger.debug(
              `[ShadowBilling] Rollback to savepoint failed (transaction may be closed): ${rollbackErr.message}`,
            );
          }
        }

        this.logger.warn(
          `[ShadowBilling] Shadow billing simulation failed for session ${sessionId}: ${err.message}`,
        );

        return {
          outcome: "SHADOW_ERROR",
          error: err.message,
          latencyMs: Date.now() - startTime,
        };
      }
    };

    return externalTx ? execute(externalTx) : this.prisma.$transaction(execute);
  }

  /**
   * Calls the native PostgreSQL billing_begin SQL fast path function.
   */
  async executeBillingBeginSql(
    sessionId: string,
    mode: "off" | "shadow" | "enforce",
    tx?: Prisma.TransactionClient,
  ): Promise<{ outcome: string; poolId: string | null; balanceRemaining: number }> {
    const db = tx || this.prisma;
    const results = await db.$queryRaw<
      Array<{ outcome: string; pool_id: string | null; balance_remaining: number }>
    >`SELECT * FROM billing_begin(${sessionId}::text, ${mode}::text)`;

    const first = results[0];
    return {
      outcome: first?.outcome ?? "UNKNOWN",
      poolId: first?.pool_id ?? null,
      balanceRemaining: first?.balance_remaining ?? 0,
    };
  }
}
