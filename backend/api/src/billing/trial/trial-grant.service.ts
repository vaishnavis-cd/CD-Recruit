import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { PoolType, PoolGrantSource, PoolStatus } from "../pool/credit-pool.types";
import { LedgerReason } from "../ledger/ledger.types";
import {
  TrialGrantResultDto,
  TrialGrantContext,
  TRIAL_POLICY,
  TrialStatusDto,
} from "./trial-grant.types";

@Injectable()
export class TrialGrantService {
  private readonly logger = new Logger(TrialGrantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditPoolService: CreditPoolService,
  ) {}

  /**
   * Normalizes and validates corporate email domain.
   * Enforces standard domain syntax (e.g. "acme.com", "sub.corp.org").
   */
  private normalizeAndValidateDomain(corporateDomain: string): string {
    if (!corporateDomain || typeof corporateDomain !== "string" || corporateDomain.trim() === "") {
      throw new BadRequestException("INVALID_CORPORATE_DOMAIN: Corporate domain is required");
    }

    const normalized = corporateDomain.trim().toLowerCase();

    // Standard RFC-compliant domain check (alphanumeric + hyphen, at least one dot)
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
    if (!domainRegex.test(normalized) || normalized.length > 255) {
      throw new BadRequestException(
        `INVALID_CORPORATE_DOMAIN: '${corporateDomain}' is not a valid corporate domain`,
      );
    }

    return normalized;
  }

  /**
   * Primary service contract required by Half 1 onboarding flow (Step 4) per Artifact 07 Â§2.2.
   * Atomically provisions a policy-bound onboarding trial grant:
   * - Exactly 25 credits
   * - 30 days validity
   * - Pool type: TALENT_RESERVE
   * - Grant source: TRIAL
   * - Executed by system actor (zero maker-checker requirement)
   * - Exactly one trial per verified corporate domain
   * - Idempotent replay on identical submission
   *
   * @throws NotFoundException if billing account does not exist
   * @throws ForbiddenException if billing account is suspended
   * @throws ConflictException('DOMAIN_ALREADY_RECEIVED_TRIAL') if domain already received trial
   * @throws ConflictException('ACCOUNT_ALREADY_RECEIVED_TRIAL') if account already received trial
   */
  async grantTrial(
    billingAccountId: string,
    corporateDomain: string,
    context?: TrialGrantContext,
  ): Promise<TrialGrantResultDto> {
    if (!billingAccountId || typeof billingAccountId !== "string" || billingAccountId.trim() === "") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    const normalizedDomain = this.normalizeAndValidateDomain(corporateDomain);

    const executeInTransaction = async (tx: any): Promise<TrialGrantResultDto> => {
      // 1. Transaction-level PostgreSQL advisory locks
      // Lock domain to serialize concurrent claims on the same corporate domain
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `trial_domain:${normalizedDomain}`,
      );

      // Lock account to serialize account-level pool operations
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `pool_mgmt:${billingAccountId}`,
      );

      // 2. Resolve target BillingAccount with row-level locking
      const accountRows = (await tx.$queryRawUnsafe(
        `SELECT id, name, status, trial_domain, trial_granted_at, overdraft_limit, overdraft_used
         FROM "billing"."billing_account"
         WHERE id = $1 FOR UPDATE`,
        billingAccountId,
      )) as Array<{
        id: string;
        name: string;
        status: string;
        trial_domain: string | null;
        trial_granted_at: Date | null;
        overdraft_limit: number;
        overdraft_used: number;
      }>;

      if (!accountRows || accountRows.length === 0) {
        throw new NotFoundException(
          `BILLING_ACCOUNT_NOT_FOUND: Billing account '${billingAccountId}' not found`,
        );
      }

      const account = accountRows[0];

      if (account.status === "SUSPENDED") {
        throw new ForbiddenException(
          "ACCOUNT_SUSPENDED: Suspended billing accounts cannot receive trial credits",
        );
      }

      // 3. Domain Uniqueness Verification across all accounts
      const existingDomainAccounts = (await tx.$queryRawUnsafe(
        `SELECT id, trial_domain, trial_granted_at FROM "billing"."billing_account" WHERE trial_domain = $1`,
        normalizedDomain,
      )) as Array<{ id: string; trial_domain: string; trial_granted_at: Date | null }>;

      if (existingDomainAccounts.length > 0) {
        const domainOwner = existingDomainAccounts[0];
        if (domainOwner.id !== billingAccountId) {
          throw new ConflictException(
            `DOMAIN_ALREADY_RECEIVED_TRIAL: Corporate domain '${normalizedDomain}' has already received a trial grant on account '${domainOwner.id}'`,
          );
        }
      }

      // 4. Idempotency & Eligibility on target BillingAccount
      if (account.trial_granted_at !== null) {
        // Account has already completed a trial grant
        if (account.trial_domain === normalizedDomain) {
          // Exact retry (Case B): Idempotently return existing canonical trial grant
          this.logger.log(
            `[TrialGrantService] Idempotent trial grant replay for account '${billingAccountId}' on domain '${normalizedDomain}'`,
          );

          const existingTrialPool = await tx.creditPool.findFirst({
            where: {
              billingAccountId,
              source: PoolGrantSource.TRIAL,
            },
            orderBy: { createdAt: "desc" },
          });

          if (existingTrialPool) {
            const existingLedger = await tx.creditLedgerEntry.findUnique({
              where: { idempotencyKey: `grant:pool:${existingTrialPool.id}` },
            });

            return {
              poolId: existingTrialPool.id,
              billingAccountId,
              creditsGranted: existingTrialPool.totalCredits,
              validityDays: existingTrialPool.validityDays || TRIAL_POLICY.VALIDITY_DAYS,
              expiresAt: existingTrialPool.expiresAt!,
              ledgerEntryId: existingLedger?.id || "",
              status: "ACTIVE",
            };
          }
        }

        // Account received trial under a different domain or corrupted state
        throw new ConflictException(
          `ACCOUNT_ALREADY_RECEIVED_TRIAL: Billing account '${billingAccountId}' has already received an onboarding trial under domain '${account.trial_domain}'`,
        );
      }

      // 5. Update BillingAccount with trial domain & granted timestamp
      const now = new Date();
      try {
        await tx.billingAccount.update({
          where: { id: billingAccountId },
          data: {
            trialDomain: normalizedDomain,
            trialGrantedAt: now,
          },
        });
      } catch (dbErr: any) {
        if (dbErr.code === "P2002" || dbErr.message?.includes("billing_account_trial_domain_key")) {
          throw new ConflictException(
            `DOMAIN_ALREADY_RECEIVED_TRIAL: Corporate domain '${normalizedDomain}' has already received a trial grant`,
          );
        }
        throw dbErr;
      }

      // 6. Mint Trial Credit Pool via CreditPoolService inside caller's transaction
      const pool = await this.creditPoolService.createPool(
        {
          billingAccountId,
          name: TRIAL_POLICY.POOL_NAME,
          poolType: PoolType.TALENT_RESERVE,
          source: PoolGrantSource.TRIAL,
          totalCredits: TRIAL_POLICY.CREDITS_GRANTED,
          validityDays: TRIAL_POLICY.VALIDITY_DAYS,
          status: PoolStatus.ACTIVE,
          reason: LedgerReason.TRIAL_GRANT,
        },
        {
          tx,
          actor: "system",
          reason: "Policy-bound automatic onboarding trial granted (25 credits, 30 days)",
        },
      );

      // 7. Authoritatively resolve the immutable opening GRANT ledger entry
      const openingLedgerEntry = await tx.creditLedgerEntry.findUnique({
        where: { idempotencyKey: `grant:pool:${pool.id}` },
      });

      if (!openingLedgerEntry) {
        throw new Error(
          `LEDGER_RECORD_MISSING: Opening ledger grant entry was not created for trial pool '${pool.id}'`,
        );
      }

      // 8. Record append-only billing audit event for account trial grant
      await tx.billingAuditEvent.create({
        data: {
          actorId: "system",
          actorRole: "system",
          subjectType: "BILLING_ACCOUNT",
          subjectId: billingAccountId,
          action: "TRIAL_GRANTED",
          before: {
            trialDomain: account.trial_domain,
            trialGrantedAt: account.trial_granted_at,
          },
          after: {
            trialDomain: normalizedDomain,
            trialGrantedAt: now,
            poolId: pool.id,
            creditsGranted: TRIAL_POLICY.CREDITS_GRANTED,
            validityDays: TRIAL_POLICY.VALIDITY_DAYS,
            expiresAt: pool.expiresAt,
            status: "ACTIVE",
          },
          reason:
            context?.reason ||
            "Policy-bound automatic onboarding trial granted (25 credits, 30 days)",
          ticketRef: context?.ticketRef || null,
          executionResult: "SUCCESS",
        },
      });

      this.logger.log(
        `[TrialGrantService] Successfully granted onboarding trial (25 credits, pool: ${pool.id}) to account ${billingAccountId} for domain '${normalizedDomain}'`,
      );

      return {
        poolId: pool.id,
        billingAccountId,
        creditsGranted: TRIAL_POLICY.CREDITS_GRANTED,
        validityDays: TRIAL_POLICY.VALIDITY_DAYS,
        expiresAt: pool.expiresAt!,
        ledgerEntryId: openingLedgerEntry.id,
        status: "ACTIVE",
      };
    };

    if (context?.transactionClient) {
      return await executeInTransaction(context.transactionClient);
    } else {
      return await this.prisma.$transaction(executeInTransaction);
    }
  }

  /**
   * Retrieves trial status and eligibility for an account without mutating any state.
   */
  async getTrialStatus(billingAccountId: string): Promise<TrialStatusDto> {
    if (!billingAccountId || typeof billingAccountId !== "string") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    const account = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: {
        pools: {
          where: { source: PoolGrantSource.TRIAL },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!account) {
      throw new NotFoundException(
        `BILLING_ACCOUNT_NOT_FOUND: Billing account '${billingAccountId}' not found`,
      );
    }

    const trialPool = account.pools[0] || null;

    return {
      hasReceivedTrial: account.trialGrantedAt !== null,
      trialDomain: account.trialDomain,
      trialGrantedAt: account.trialGrantedAt,
      trialPool: trialPool
        ? {
            id: trialPool.id,
            cachedRemaining: trialPool.cachedRemaining,
            totalCredits: trialPool.totalCredits,
            expiresAt: trialPool.expiresAt,
            status: trialPool.status,
          }
        : null,
    };
  }
}
