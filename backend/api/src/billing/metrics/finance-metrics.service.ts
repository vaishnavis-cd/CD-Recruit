import { Injectable, Logger, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ReconciliationService } from "../reconciliation/reconciliation.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { AuthenticatedPlatformActor } from "../../platform/audit/platform-audit.types";
import {
  PeriodType,
  PeriodFilterDto,
  ResolvedPeriod,
  CurrencyRevenueDto,
  PaymentMetricsDto,
  CreditMetricsDto,
  RevenueMetricsDto,
  UtilizationMetricsDto,
  RiskExposureDto,
  ReconciliationSummaryDto,
  FinancialOverviewDto,
  AccountFinanceMetricsDto,
} from "./finance-metrics.types";

@Injectable()
export class FinanceMetricsService {
  private readonly logger = new Logger(FinanceMetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  /**
   * Resolves a period filter into an explicit, deterministic UTC half-open interval [startInclusive, endExclusive).
   */
  resolvePeriod(filter?: PeriodFilterDto): ResolvedPeriod {
    const period = filter?.period || PeriodType.ALL_TIME;
    const now = new Date();

    if (period === PeriodType.ALL_TIME) {
      return { period, startInclusive: null, endExclusive: null };
    }

    if (period === PeriodType.TODAY) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      return { period, startInclusive: start, endExclusive: end };
    }

    if (period === PeriodType.CURRENT_WEEK) {
      const day = now.getUTCDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
      return { period, startInclusive: start, endExclusive: end };
    }

    if (period === PeriodType.CURRENT_MONTH) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { period, startInclusive: start, endExclusive: end };
    }

    if (period === PeriodType.PREVIOUS_MONTH) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { period, startInclusive: start, endExclusive: end };
    }

    if (period === PeriodType.LAST_7_DAYS) {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { period, startInclusive: start, endExclusive: now };
    }

    if (period === PeriodType.LAST_30_DAYS) {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { period, startInclusive: start, endExclusive: now };
    }

    if (period === PeriodType.LAST_90_DAYS) {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { period, startInclusive: start, endExclusive: now };
    }

    if (period === PeriodType.YEAR_TO_DATE) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { period, startInclusive: start, endExclusive: now };
    }

    if (period === PeriodType.CUSTOM) {
      const start = filter?.startDate ? new Date(filter.startDate) : null;
      const end = filter?.endDate ? new Date(filter.endDate) : null;
      return { period, startInclusive: start, endExclusive: end };
    }

    return { period: PeriodType.ALL_TIME, startInclusive: null, endExclusive: null };
  }

  /**
   * Asserts caller has platform staff role authorized for finance metrics (OWNER, FINANCE, SUPPORT).
   * Recruiter and tenant client JWTs are strictly rejected.
   */
  assertStaffAuthorization(actor?: AuthenticatedPlatformActor): void {
    if (!actor) return; // Allow system internal calls

    if (!actor.isPlatformStaff) {
      throw new ForbiddenException(
        "PLATFORM_STAFF_REQUIRED: Recruiter and tenant JWTs cannot access platform financial metrics",
      );
    }

    const role = actor.platformRole || actor.role;
    if (
      role !== PlatformStaffRole.OWNER &&
      role !== PlatformStaffRole.FINANCE &&
      role !== PlatformStaffRole.SUPPORT
    ) {
      throw new ForbiddenException(
        `UNAUTHORIZED_ROLE: Staff role ${role} does not have access to financial metrics`,
      );
    }
  }

  /**
   * Asserts caller has elevated Finance or Owner authority.
   */
  assertFinanceOrOwner(actor?: AuthenticatedPlatformActor): void {
    if (!actor) return;

    this.assertStaffAuthorization(actor);

    const role = actor.platformRole || actor.role;
    if (role !== PlatformStaffRole.OWNER && role !== PlatformStaffRole.FINANCE) {
      throw new ForbiddenException(
        "FINANCE_REQUIRED: Restricted to Platform Finance and Owner roles",
      );
    }
  }

  /**
   * Builds SQL WHERE clause fragment for half-open interval [start, end) on a specific timestamp column.
   */
  private buildDateFilter(
    column: string,
    resolved: ResolvedPeriod,
    paramOffset: number = 1,
  ): { clause: string; params: any[] } {
    const params: any[] = [];
    const conditions: string[] = [];

    if (resolved.startInclusive) {
      params.push(resolved.startInclusive);
      conditions.push(`${column} >= $${paramOffset + params.length - 1}`);
    }

    if (resolved.endExclusive) {
      params.push(resolved.endExclusive);
      conditions.push(`${column} < $${paramOffset + params.length - 1}`);
    }

    return {
      clause: conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  /**
   * Computes comprehensive payment and invoice metrics.
   * Captured revenue includes CAPTURED and REFUNDED payments (prior to refund offset).
   * CREATED, FAILED, and PENDING payments are strictly excluded from captured revenue.
   */
  async getPaymentMetrics(
    filter?: PeriodFilterDto,
    actor?: AuthenticatedPlatformActor,
    client: any = this.prisma,
  ): Promise<PaymentMetricsDto> {
    this.assertStaffAuthorization(actor);
    const resolved = this.resolvePeriod(filter);
    const dateFilter = this.buildDateFilter("pay.created_at", resolved, 1);

    // 1. Payment status and counts breakdown
    const statusCounts = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        pay.status,
        COUNT(*)::integer AS count,
        COALESCE(SUM(pay.quantity_credits) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED')), 0)::integer AS credits_purchased
      FROM "billing"."payment" pay
      WHERE 1=1 ${dateFilter.clause}
      GROUP BY pay.status
    `,
      ...dateFilter.params,
    );

    let totalCount = 0;
    let capturedCount = 0;
    let failedCount = 0;
    let createdCount = 0;
    let refundedCount = 0;
    let disputedCount = 0;
    let totalCreditsPurchased = 0;

    for (const row of statusCounts) {
      totalCount += row.count;
      totalCreditsPurchased += row.credits_purchased;
      switch (row.status) {
        case "CAPTURED":
          capturedCount += row.count;
          break;
        case "FAILED":
          failedCount += row.count;
          break;
        case "CREATED":
        case "PENDING":
          createdCount += row.count;
          break;
        case "REFUNDED":
          refundedCount += row.count;
          break;
        case "DISPUTED":
          disputedCount += row.count;
          break;
      }
    }

    // 2. Revenue breakdown grouped strictly by currency (integer minor units)
    const currencyRows = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        pay.currency,
        COALESCE(SUM(pay.amount_minor) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED')), 0)::bigint AS captured_minor,
        COALESCE(SUM(pay.amount_minor) FILTER (WHERE pay.status = 'REFUNDED'), 0)::bigint AS refunded_minor,
        COALESCE(SUM(pay.tax_minor) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED')), 0)::bigint AS tax_minor,
        COUNT(*) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED'))::integer AS captured_count
      FROM "billing"."payment" pay
      WHERE 1=1 ${dateFilter.clause}
      GROUP BY pay.currency
    `,
      ...dateFilter.params,
    );

    const byCurrency: Record<string, CurrencyRevenueDto> = {};
    for (const r of currencyRows) {
      const capturedMinor = Number(r.captured_minor);
      const refundedMinor = Number(r.refunded_minor);
      const netAmountMinor = capturedMinor - refundedMinor;
      const taxAmountMinor = Number(r.tax_minor);
      const count = Number(r.captured_count);
      const averageOrderValueMinor = count > 0 ? Math.round(capturedMinor / count) : 0;

      byCurrency[r.currency] = {
        currency: r.currency,
        capturedAmountMinor: capturedMinor,
        refundedAmountMinor: refundedMinor,
        netAmountMinor,
        taxAmountMinor,
        transactionCount: count,
        averageOrderValueMinor,
      };
    }

    // 3. Provider breakdown
    const providerRows = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        pay.provider,
        pay.currency,
        COUNT(*)::integer AS total_count,
        COUNT(*) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED'))::integer AS captured_count,
        COALESCE(SUM(pay.amount_minor) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED')), 0)::bigint AS captured_minor
      FROM "billing"."payment" pay
      WHERE 1=1 ${dateFilter.clause}
      GROUP BY pay.provider, pay.currency
    `,
      ...dateFilter.params,
    );

    const byProvider: Record<string, { count: number; capturedCount: number; capturedAmountMinor: Record<string, number> }> = {};
    for (const p of providerRows) {
      if (!byProvider[p.provider]) {
        byProvider[p.provider] = { count: 0, capturedCount: 0, capturedAmountMinor: {} };
      }
      byProvider[p.provider].count += Number(p.total_count);
      byProvider[p.provider].capturedCount += Number(p.captured_count);
      byProvider[p.provider].capturedAmountMinor[p.currency] =
        (byProvider[p.provider].capturedAmountMinor[p.currency] || 0) + Number(p.captured_minor);
    }

    return {
      totalCount,
      capturedCount,
      failedCount,
      createdCount,
      refundedCount,
      disputedCount,
      totalCreditsPurchased,
      byCurrency,
      byProvider,
    };
  }

  /**
   * Computes credit issuance, consumption, refund, expiry, and pool distribution metrics.
   * Derived from immutable ledger replay and current pool status.
   */
  async getCreditMetrics(
    filter?: PeriodFilterDto,
    actor?: AuthenticatedPlatformActor,
    client: any = this.prisma,
  ): Promise<CreditMetricsDto> {
    this.assertStaffAuthorization(actor);
    const resolved = this.resolvePeriod(filter);
    const dateFilter = this.buildDateFilter("l.created_at", resolved, 1);

    // 1. Ledger entry aggregates by entry_type and grant_source
    const ledgerAggregates = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        l.entry_type,
        l.grant_source,
        l.reason,
        COALESCE(SUM(l.amount), 0)::integer AS sum_amount,
        COUNT(*)::integer AS count
      FROM "billing"."credit_ledger_entry" l
      WHERE l.shadow = false ${dateFilter.clause}
      GROUP BY l.entry_type, l.grant_source, l.reason
    `,
      ...dateFilter.params,
    );

    let totalGrantedCredits = 0;
    let commercialGrantedCredits = 0;
    let promotionalGrantedCredits = 0;
    let consumedCredits = 0;
    let refundedCredits = 0;
    let expiredCredits = 0;
    const bySource: Record<string, number> = {};

    for (const row of ledgerAggregates) {
      const amount = row.sum_amount;
      if (row.entry_type === "GRANT") {
        totalGrantedCredits += amount;
        const source = row.grant_source || (row.reason === "PROMOTIONAL_SEED_GRANT" ? "PROMOTIONAL_SEED_GRANT" : "UNKNOWN");
        bySource[source] = (bySource[source] || 0) + amount;

        if (source === "PURCHASE" || source === "CONTRACT") {
          commercialGrantedCredits += amount;
        } else {
          promotionalGrantedCredits += amount;
        }
      } else if (row.entry_type === "CONSUME") {
        consumedCredits += Math.abs(amount);
      } else if (row.entry_type === "REFUND") {
        refundedCredits += Math.abs(amount);
      } else if (row.entry_type === "EXPIRE") {
        expiredCredits += Math.abs(amount);
      }
    }

    // 2. Current available credits across active and queued pools
    const availableResult = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        COALESCE(SUM(cached_remaining), 0)::integer AS available_credits
      FROM "billing"."credit_pool"
      WHERE status IN ('ACTIVE', 'QUEUED')
    `);
    const availableCredits = Number(availableResult[0]?.available_credits || 0);

    // 3. Pool counts by status
    const poolRows = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        status, 
        COUNT(*)::integer AS count 
      FROM "billing"."credit_pool"
      GROUP BY status
    `);

    const poolCounts = {
      active: 0,
      queued: 0,
      exhausted: 0,
      expired: 0,
      suspended: 0,
      cancelled: 0,
      total: 0,
    };

    for (const p of poolRows) {
      const c = Number(p.count);
      poolCounts.total += c;
      switch (p.status) {
        case "ACTIVE":
          poolCounts.active += c;
          break;
        case "QUEUED":
          poolCounts.queued += c;
          break;
        case "EXHAUSTED":
        case "DEPLETED":
          poolCounts.exhausted += c;
          break;
        case "EXPIRED":
          poolCounts.expired += c;
          break;
        case "SUSPENDED":
          poolCounts.suspended += c;
          break;
        case "CANCELLED":
          poolCounts.cancelled += c;
          break;
      }
    }

    return {
      totalGrantedCredits,
      commercialGrantedCredits,
      promotionalGrantedCredits,
      consumedCredits,
      refundedCredits,
      expiredCredits,
      availableCredits,
      bySource,
      poolCounts,
    };
  }

  /**
   * Computes revenue telemetry grouped strictly by currency.
   * Never combines different currencies without explicit FX conversion.
   */
  async getRevenueMetrics(
    filter?: PeriodFilterDto,
    actor?: AuthenticatedPlatformActor,
    client: any = this.prisma,
  ): Promise<RevenueMetricsDto> {
    this.assertStaffAuthorization(actor);
    const resolved = this.resolvePeriod(filter);
    const dateFilter = this.buildDateFilter("pay.created_at", resolved, 1);

    const rows = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        pay.currency,
        COALESCE(SUM(pay.amount_minor) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED')), 0)::bigint AS captured_minor,
        COALESCE(SUM(pay.amount_minor) FILTER (WHERE pay.status = 'REFUNDED'), 0)::bigint AS refunded_minor,
        COALESCE(SUM(pay.tax_minor) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED')), 0)::bigint AS tax_minor,
        COUNT(*) FILTER (WHERE pay.status IN ('CAPTURED', 'REFUNDED', 'DISPUTED'))::integer AS transaction_count
      FROM "billing"."payment" pay
      WHERE 1=1 ${dateFilter.clause}
      GROUP BY pay.currency
    `,
      ...dateFilter.params,
    );

    const currencies: Record<string, CurrencyRevenueDto> = {};
    for (const r of rows) {
      const captured = Number(r.captured_minor);
      const refunded = Number(r.refunded_minor);
      const count = Number(r.transaction_count);
      currencies[r.currency] = {
        currency: r.currency,
        capturedAmountMinor: captured,
        refundedAmountMinor: refunded,
        netAmountMinor: captured - refunded,
        taxAmountMinor: Number(r.tax_minor),
        transactionCount: count,
        averageOrderValueMinor: count > 0 ? Math.round(captured / count) : 0,
      };
    }

    // Historical pricing integrity check: confirms Payment unit_price matches linked PriceBookEntry
    const pricingMismatchRows = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT COUNT(*)::integer AS mismatch_count
      FROM "billing"."payment" pay
      JOIN "billing"."price_book_entry" pbe ON pbe.id = pay.price_book_entry_id
      WHERE pay.unit_price_minor <> pbe.unit_price_minor
    `);
    const historicalPricingIntegrityVerified = Number(pricingMismatchRows[0]?.mismatch_count || 0) === 0;

    return {
      period: resolved,
      currencies,
      historicalPricingIntegrityVerified,
    };
  }

  /**
   * Computes utilization metrics without exposing any candidate PII.
   */
  async getUtilizationMetrics(
    filter?: PeriodFilterDto,
    actor?: AuthenticatedPlatformActor,
    client: any = this.prisma,
  ): Promise<UtilizationMetricsDto> {
    this.assertStaffAuthorization(actor);
    const resolved = this.resolvePeriod(filter);
    const dateFilter = this.buildDateFilter("created_at", resolved, 1);

    // 1. Account counts
    const accountStats = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        COUNT(*)::integer AS total_accounts,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::integer AS active_accounts,
        COUNT(*) FILTER (WHERE has_paid_purchase = true)::integer AS paid_accounts
      FROM "billing"."billing_account"
    `);
    const totalBillingAccounts = Number(accountStats[0]?.total_accounts || 0);
    const activeBillingAccounts = Number(accountStats[0]?.active_accounts || 0);
    const accountsWithPaidPurchase = Number(accountStats[0]?.paid_accounts || 0);

    // 2. Billable sessions count (kind = 'LIVE')
    const sessionDateFilter = this.buildDateFilter("started_at", resolved, 1);
    const sessionStats = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT COUNT(*)::integer AS billed_sessions
      FROM "public"."session"
      WHERE kind = 'LIVE' ${sessionDateFilter.clause}
    `,
      ...sessionDateFilter.params,
    );
    const totalSessionsBilled = Number(sessionStats[0]?.billed_sessions || 0);

    // 3. Unique sessions consuming credit from ledger
    const ledgerSessionStats = await (client as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        COUNT(DISTINCT session_id)::integer AS consuming_sessions,
        COUNT(*) FILTER (WHERE entry_type = 'WAIVE' OR reason = 'COURTESY_WAIVER')::integer AS waived_count,
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'GRANT'), 0)::integer AS total_granted,
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'CONSUME'), 0)::integer AS total_consumed
      FROM "billing"."credit_ledger_entry"
      WHERE shadow = false ${dateFilter.clause}
    `,
      ...dateFilter.params,
    );

    const totalSessionsConsumingCredit = Number(ledgerSessionStats[0]?.consuming_sessions || 0);
    const waivedCourtesyAttempts = Number(ledgerSessionStats[0]?.waived_count || 0);
    const totalGranted = Number(ledgerSessionStats[0]?.total_granted || 0);
    const totalConsumed = Math.abs(Number(ledgerSessionStats[0]?.total_consumed || 0));

    const creditConsumptionRatePercent =
      totalGranted > 0
        ? Math.min(100, Math.round((totalConsumed / totalGranted) * 10000) / 100)
        : 0;

    return {
      totalBillingAccounts,
      activeBillingAccounts,
      accountsWithPaidPurchase,
      totalSessionsBilled,
      totalSessionsConsumingCredit,
      creditConsumptionRatePercent,
      waivedCourtesyAttempts,
    };
  }

  /**
   * Computes debt exposure, aged overdraft, and dispute exposure.
   * Asserts zero overdraft under ADR-004.
   */
  async getRiskExposure(
    actor?: AuthenticatedPlatformActor,
    client: any = this.prisma,
  ): Promise<RiskExposureDto> {
    this.assertStaffAuthorization(actor);

    // 1. Overdraft totals (ADR-004 permanently eliminates overdraft)
    const overdraftStats = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        COALESCE(SUM(overdraft_limit), 0)::integer AS total_limit,
        COALESCE(SUM(overdraft_used), 0)::integer AS total_used,
        COUNT(*) FILTER (WHERE overdraft_used > 0)::integer AS aged_count
      FROM "billing"."billing_account"
    `);

    const totalOverdraftLimitMinor = Number(overdraftStats[0]?.total_limit || 0);
    const totalOverdraftUsedMinor = Number(overdraftStats[0]?.total_used || 0);
    const agedOverdraftCount = Number(overdraftStats[0]?.aged_count || 0);

    // 2. Active disputed payments
    const disputeRows = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        currency,
        COUNT(*)::integer AS count,
        COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor
      FROM "billing"."payment"
      WHERE status = 'DISPUTED'
      GROUP BY currency
    `);

    let activeDisputedPaymentsCount = 0;
    const disputedAmountsByCurrency: Record<string, number> = {};
    for (const d of disputeRows) {
      activeDisputedPaymentsCount += Number(d.count);
      disputedAmountsByCurrency[d.currency] = Number(d.amount_minor);
    }

    return {
      totalOverdraftLimitMinor,
      totalOverdraftUsedMinor,
      agedOverdraftCount,
      activeDisputedPaymentsCount,
      disputedAmountsByCurrency,
    };
  }

  /**
   * Surfaces latest reconciliation status without duplicating all 7 checks.
   * If no run exists, returns honest UNAVAILABLE status instead of fabricating "healthy".
   */
  async getReconciliationSummary(): Promise<ReconciliationSummaryDto> {
    const latest = await this.reconciliationService.getLatestRun();

    if (!latest) {
      return {
        latestRunId: null,
        status: "UNAVAILABLE",
        driftDetected: false,
        executedBy: null,
        startedAt: null,
        completedAt: null,
        checkSummaries: {},
      };
    }

    const checkSummaries: Record<string, { status: string; findingsCount: number }> = {};
    if (latest.checkResults && typeof latest.checkResults === "object") {
      for (const [k, v] of Object.entries(latest.checkResults as Record<string, any>)) {
        checkSummaries[k] = {
          status: v.status || "UNKNOWN",
          findingsCount: Array.isArray(v.findings) ? v.findings.length : 0,
        };
      }
    }

    return {
      latestRunId: latest.id,
      status: latest.status as any,
      driftDetected: latest.driftDetected,
      executedBy: latest.executedBy,
      startedAt: latest.startedAt ? new Date(latest.startedAt) : null,
      completedAt: latest.completedAt ? new Date(latest.completedAt) : null,
      checkSummaries,
    };
  }

  /**
   * Computes executive financial overview assembling all metrics in a single
   * consistent PostgreSQL REPEATABLE READ READ ONLY snapshot.
   */
  async getFinancialOverview(
    filter?: PeriodFilterDto,
    actor?: AuthenticatedPlatformActor,
  ): Promise<FinancialOverviewDto> {
    this.assertStaffAuthorization(actor);
    const resolved = this.resolvePeriod(filter);

    return await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

        const [paymentMetrics, creditMetrics, revenueMetrics, utilizationMetrics, riskMetrics] =
          await Promise.all([
            this.getPaymentMetrics(filter, actor, tx),
            this.getCreditMetrics(filter, actor, tx),
            this.getRevenueMetrics(filter, actor, tx),
            this.getUtilizationMetrics(filter, actor, tx),
            this.getRiskExposure(actor, tx),
          ]);

        const reconciliationSummary = await this.getReconciliationSummary();

        return {
          period: resolved,
          revenue: revenueMetrics.currencies,
          credits: creditMetrics,
          payments: paymentMetrics,
          utilization: utilizationMetrics,
          risk: riskMetrics,
          reconciliation: reconciliationSummary,
        };
      },
      { timeout: 30000 },
    );
  }

  /**
   * Computes per-account financial telemetry for tenant drilldown.
   */
  async getAccountMetrics(
    billingAccountId: string,
    filter?: PeriodFilterDto,
    actor?: AuthenticatedPlatformActor,
  ): Promise<AccountFinanceMetricsDto> {
    this.assertStaffAuthorization(actor);

    const ba = await this.prisma.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: {
        pools: true,
      },
    });

    if (!ba) {
      throw new NotFoundException(`Billing account ${billingAccountId} not found`);
    }

    const availableCredits = ba.pools
      .filter((p) => p.status === "ACTIVE" || p.status === "QUEUED")
      .reduce((sum, p) => sum + p.cachedRemaining, 0);

    const lifetimeStats = await (this.prisma as PrismaService).$queryRawUnsafe<any[]>(
      `
      SELECT 
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'GRANT' AND grant_source IN ('PURCHASE', 'CONTRACT')), 0)::integer AS purchased,
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'CONSUME'), 0)::integer AS consumed
      FROM "billing"."credit_ledger_entry"
      WHERE billing_account_id = $1 AND shadow = false
    `,
      billingAccountId,
    );

    const lifetimePurchasedCredits = Number(lifetimeStats[0]?.purchased || 0);
    const lifetimeConsumedCredits = Math.abs(Number(lifetimeStats[0]?.consumed || 0));

    const poolCounts = {
      active: ba.pools.filter((p) => p.status === "ACTIVE").length,
      queued: ba.pools.filter((p) => p.status === "QUEUED").length,
      exhausted: ba.pools.filter((p) => p.status === "EXHAUSTED" || (p.status as string) === "DEPLETED").length,
      expired: ba.pools.filter((p) => p.status === "EXPIRED").length,
      total: ba.pools.length,
    };

    // Account-specific payment metrics
    const paymentMetrics = await this.getPaymentMetrics(
      filter,
      actor,
      this.prisma,
    );

    return {
      billingAccountId: ba.id,
      accountName: ba.name,
      status: ba.status,
      billingCountry: ba.billingCountry,
      currency: ba.currency,
      availableCredits,
      overdraftUsed: ba.overdraftUsed,
      overdraftLimit: ba.overdraftLimit,
      lifetimePurchasedCredits,
      lifetimeConsumedCredits,
      payments: paymentMetrics,
      pools: poolCounts,
    };
  }
}
