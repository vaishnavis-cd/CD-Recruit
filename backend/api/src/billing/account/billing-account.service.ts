import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  CreateBillingAccountDto,
  BillingAccountResultDto,
  BillingAccountSummaryDto,
  UpdateBillingAccountDto,
  BillingAccountContext,
  BillingAccountStatus,
  deriveCurrencyForCountry,
  ListBillingAccountsOptions,
  PaginatedBillingAccountsResultDto,
} from "./billing-account.types";
import { sanitizeAuditData } from "../../platform/audit/platform-audit.util";

@Injectable()
export class BillingAccountService {
  private readonly logger = new Logger(BillingAccountService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Primary integration contract required by Half 1 onboarding flow (Step 2).
   * Atomically provisions a BillingAccount and links it to the target Organization.
   *
   * Invariants enforced:
   * - Resolves target organization or throws NotFoundException.
   * - If Organization already has a BillingAccount, returns existing account idempotently.
   * - Derives currency from billing country (INR for IN, USD for US, MYR for MY).
   * - Enforces initial account defaults: status=ACTIVE, overdraftLimit=0, overdraftUsed=0, hasPaidPurchase=false.
   * - Enforces trial domain uniqueness across billing accounts.
   * - Zero credit mutation: Does not mint credits, does not create credit pools, does not write ledger entries.
   * - Atomic and safe under concurrent double-submission using row-level locking.
   */
  async createForOrganization(
    organizationId: string,
    params: CreateBillingAccountDto,
    context?: BillingAccountContext,
  ): Promise<BillingAccountResultDto> {
    if (!organizationId || typeof organizationId !== "string" || organizationId.trim() === "") {
      throw new BadRequestException("INVALID_ORGANIZATION_ID: Organization ID is required");
    }

    if (!params || typeof params !== "object") {
      throw new BadRequestException("INVALID_PARAMS: Parameters object is required");
    }

    // 1. Authoritative currency derivation from country policy
    const derivedCurrency = deriveCurrencyForCountry(params.billingCountry, params.currency);
    const normalizedCountry = params.billingCountry.trim().toUpperCase();

    // 2. Define transactional execution unit
    const executeInTransaction = async (tx: any): Promise<BillingAccountResultDto> => {
      // Row-level lock on the target organization to serialize concurrent onboarding requests
      const orgRows = (await tx.$queryRawUnsafe(
        `SELECT id, name, billing_account_id FROM "public"."organization" WHERE id = $1 FOR UPDATE`,
        organizationId,
      )) as Array<{ id: string; name: string; billing_account_id: string | null }>;

      if (!orgRows || orgRows.length === 0) {
        throw new NotFoundException(`ORGANIZATION_NOT_FOUND: Organization '${organizationId}' does not exist`);
      }

      const orgRecord = orgRows[0];

      // 3. Idempotency Check (Case 2: Organization already has BillingAccount)
      if (orgRecord.billing_account_id) {
        const existingAccount = await tx.billingAccount.findUnique({
          where: { id: orgRecord.billing_account_id },
        });

        if (existingAccount) {
          this.logger.log(
            `[createForOrganization] Organization '${organizationId}' already linked to BillingAccount '${existingAccount.id}'. Returning canonical account idempotently.`,
          );

          return {
            id: existingAccount.id,
            organizationId: orgRecord.id,
            name: existingAccount.name,
            billingCountry: existingAccount.billingCountry,
            currency: existingAccount.currency,
            status: existingAccount.status as BillingAccountStatus,
            trialDomain: existingAccount.trialDomain,
            createdAt: existingAccount.createdAt,
          };
        }
      }

      // 4. Case 1: Organization has no BillingAccount -> Create exactly one
      const normalizedTrialDomain = params.trialDomain?.trim() ? params.trialDomain.trim().toLowerCase() : null;

      if (normalizedTrialDomain) {
        const duplicateDomainAccount = await tx.billingAccount.findUnique({
          where: { trialDomain: normalizedTrialDomain },
        });

        if (duplicateDomainAccount) {
          throw new ConflictException(
            `TRIAL_DOMAIN_ALREADY_EXISTS: A billing account with trial domain '${normalizedTrialDomain}' already exists (${duplicateDomainAccount.id})`,
          );
        }
      }

      const newAccountId = randomUUID();
      const accountDisplayName = params.accountName?.trim() || orgRecord.name;
      const legalEntityName = params.legalEntityName?.trim() || null;
      const taxId = params.taxId?.trim() || null;

      // Create BillingAccount with authoritative initial defaults
      const createdAccount = await tx.billingAccount.create({
        data: {
          id: newAccountId,
          name: accountDisplayName,
          legalEntityName,
          billingCountry: normalizedCountry,
          currency: derivedCurrency,
          taxId,
          status: "ACTIVE",
          overdraftLimit: 0, // PERMANENT INVARIANT: ADR-004 Overdraft eliminated
          overdraftUsed: 0,
          hasPaidPurchase: false,
          trialDomain: normalizedTrialDomain,
          trialGrantedAt: null, // Trial grant belongs strictly to TrialGrantService
        },
      });

      // Link organization.billingAccountId to the newly created BillingAccount
      await tx.organization.update({
        where: { id: organizationId },
        data: { billingAccountId: newAccountId },
      });

      // Audit recording coupled to the transaction
      const actorId =
        typeof context?.actor === "object" ? context.actor.id : context?.actor === "system" ? "system" : "system";
      const actorRole =
        typeof context?.actor === "object"
          ? context.actor.platformRole || context.actor.role || "SYSTEM"
          : "SYSTEM";

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "ACCOUNT",
        subjectId: newAccountId,
        action: "ACCOUNT_CREATED",
        after: {
          id: newAccountId,
          organizationId,
          name: accountDisplayName,
          billingCountry: normalizedCountry,
          currency: derivedCurrency,
          status: "ACTIVE",
          overdraftLimit: 0,
          trialDomain: normalizedTrialDomain,
        },
        ticketRef: context?.ticketRef || null,
        requestId: context?.requestId || null,
        reason: context?.reason || "Billing account created during organization onboarding",
      });

      this.logger.log(
        `[createForOrganization] Created BillingAccount '${newAccountId}' for Organization '${organizationId}' [Country: ${normalizedCountry}, Currency: ${derivedCurrency}].`,
      );

      return {
        id: createdAccount.id,
        organizationId: orgRecord.id,
        name: createdAccount.name,
        billingCountry: createdAccount.billingCountry,
        currency: createdAccount.currency,
        status: createdAccount.status as BillingAccountStatus,
        trialDomain: createdAccount.trialDomain,
        createdAt: createdAccount.createdAt,
      };
    };

    // If an external transactionClient was provided, execute within it; otherwise initiate transaction.
    if (context?.transactionClient) {
      return executeInTransaction(context.transactionClient);
    }

    return this.prisma.$transaction(executeInTransaction, { timeout: 10000 });
  }

  /**
   * Retrieves a billing account by its primary key UUID.
   */
  async getAccountById(id: string) {
    if (!id || typeof id !== "string") {
      throw new BadRequestException("INVALID_ACCOUNT_ID: Account ID must be a non-empty string");
    }

    return this.prisma.billingAccount.findUnique({
      where: { id },
      include: { organization: true },
    });
  }

  /**
   * Retrieves the billing account linked to an organization.
   */
  async getAccountByOrganizationId(organizationId: string) {
    if (!organizationId || typeof organizationId !== "string") {
      throw new BadRequestException("INVALID_ORGANIZATION_ID: Organization ID must be a non-empty string");
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { billingAccount: true },
    });

    return org?.billingAccount || null;
  }

  /**
   * Generates a comprehensive financial and operational summary matching Artifact 04 §2.1 and Artifact 07 §2.3.
   */
  async getAccountSummary(id: string): Promise<BillingAccountSummaryDto> {
    if (!id || typeof id !== "string") {
      throw new BadRequestException("INVALID_ACCOUNT_ID: Account ID must be a non-empty string");
    }

    const account = await this.prisma.billingAccount.findUnique({
      where: { id },
      include: {
        organization: true,
        creditPools: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${id}' not found`);
    }

    const now = new Date();
    // Compute available balance from active non-expired pools
    const totalAvailableCredits = account.creditPools
      .filter((p) => p.status === "ACTIVE" && (!p.expiresAt || p.expiresAt > now))
      .reduce((sum, p) => sum + p.cachedRemaining, 0);

    return {
      id: account.id,
      organizationId: account.organization?.id || null,
      name: account.name,
      legalEntityName: account.legalEntityName,
      billingCountry: account.billingCountry,
      currency: account.currency,
      taxId: account.taxId,
      status: account.status as BillingAccountStatus,
      overdraftLimit: 0, // ADR-004 Hard lock
      overdraftUsed: account.overdraftUsed,
      hasPaidPurchase: account.hasPaidPurchase,
      trialDomain: account.trialDomain,
      trialGrantedAt: account.trialGrantedAt,
      totalAvailableCredits,
      pools: account.creditPools.map((p) => ({
        id: p.id,
        name: p.name,
        poolType: p.poolType,
        status: p.status,
        cachedRemaining: p.cachedRemaining,
        totalCredits: p.totalCredits,
        expiresAt: p.expiresAt,
      })),
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  /**
   * Updates non-financial commercial metadata (name, legalEntityName, taxId).
   * Platform ops permission: SELECT, UPDATE (name, legal_entity_name, tax_id).
   */
  async updateAccount(
    id: string,
    params: UpdateBillingAccountDto,
    context?: BillingAccountContext,
  ) {
    if (!id || typeof id !== "string") {
      throw new BadRequestException("INVALID_ACCOUNT_ID: Account ID must be a non-empty string");
    }

    const existing = await this.prisma.billingAccount.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${id}' not found`);
    }

    const updateData: any = {};
    if (params.name !== undefined) updateData.name = params.name.trim();
    if (params.legalEntityName !== undefined) updateData.legalEntityName = params.legalEntityName?.trim() || null;
    if (params.taxId !== undefined) updateData.taxId = params.taxId?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingAccount.update({
        where: { id },
        data: updateData,
      });

      const actorId =
        typeof context?.actor === "object" ? context.actor.id : context?.actor === "system" ? "system" : "system";
      const actorRole =
        typeof context?.actor === "object"
          ? context.actor.platformRole || context.actor.role || "SYSTEM"
          : "SYSTEM";

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "ACCOUNT",
        subjectId: id,
        action: "ACCOUNT_UPDATED",
        before: {
          name: existing.name,
          legalEntityName: existing.legalEntityName,
          taxId: existing.taxId,
        },
        after: {
          name: updated.name,
          legalEntityName: updated.legalEntityName,
          taxId: updated.taxId,
        },
        ticketRef: context?.ticketRef || null,
        requestId: context?.requestId || null,
        reason: context?.reason || "Account commercial metadata updated",
      });

      return updated;
    });
  }

  /**
   * Transitions billing account status per Artifact 06 §1.1 state machine.
   * Requires a valid requestId (maker-checker requirement).
   */
  async updateStatus(
    id: string,
    status: BillingAccountStatus,
    requestId: string,
    context?: BillingAccountContext,
  ) {
    if (!id || typeof id !== "string") {
      throw new BadRequestException("INVALID_ACCOUNT_ID: Account ID must be a non-empty string");
    }

    if (!status || !["ACTIVE", "RESTRICTED", "SUSPENDED"].includes(status)) {
      throw new BadRequestException(`INVALID_STATUS: Status '${status}' is not a valid BillingAccountStatus`);
    }

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Status transitions require an approved request ID");
    }

    const existing = await this.prisma.billingAccount.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${id}' not found`);
    }

    if (existing.status === status) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingAccount.update({
        where: { id },
        data: { status },
      });

      const actorId =
        typeof context?.actor === "object" ? context.actor.id : context?.actor === "system" ? "system" : "system";
      const actorRole =
        typeof context?.actor === "object"
          ? context.actor.platformRole || context.actor.role || "SYSTEM"
          : "SYSTEM";

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "ACCOUNT",
        subjectId: id,
        action: "ACCOUNT_STATUS_CHANGE",
        before: { status: existing.status },
        after: { status: updated.status },
        ticketRef: context?.ticketRef || null,
        requestId,
        reason: context?.reason || `Status changed from ${existing.status} to ${status}`,
      });

      return updated;
    });
  }

  /**
   * Paginated listing of billing accounts matching Artifact 04 §2.1 and API-H2-01.
   */
  async listAccounts(options: ListBillingAccountsOptions = {}): Promise<PaginatedBillingAccountsResultDto> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options.status) {
      where.status = options.status;
    }
    if (options.country) {
      where.billingCountry = options.country.trim().toUpperCase();
    }
    if (options.search && options.search.trim() !== "") {
      const search = options.search.trim();
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { legalEntityName: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, accounts] = await Promise.all([
      this.prisma.billingAccount.count({ where }),
      this.prisma.billingAccount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          creditPools: {
            where: {
              status: "ACTIVE",
            },
            select: {
              id: true,
              cachedRemaining: true,
              expiresAt: true,
            },
          },
        },
      }),
    ]);

    const now = new Date();
    const data = accounts.map((acc) => {
      const activeNonExpired = acc.creditPools.filter(
        (p) => !p.expiresAt || p.expiresAt > now,
      );
      const totalRemainingCredits = activeNonExpired.reduce(
        (sum, p) => sum + p.cachedRemaining,
        0,
      );

      return {
        id: acc.id,
        name: acc.name,
        legalEntityName: acc.legalEntityName,
        billingCountry: acc.billingCountry,
        currency: acc.currency,
        status: acc.status as BillingAccountStatus,
        totalRemainingCredits,
        overdraftUsed: acc.overdraftUsed,
        overdraftLimit: acc.overdraftLimit,
        hasPaidPurchase: acc.hasPaidPurchase,
        activePoolsCount: activeNonExpired.length,
        createdAt: acc.createdAt,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
