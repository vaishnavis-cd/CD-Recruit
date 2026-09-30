import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { AuthenticatedPlatformActor } from "../../platform/audit/platform-audit.types";

/**
 * Standard supported time intervals for financial and operational metrics.
 * Evaluated strictly in UTC half-open intervals [startInclusive, endExclusive).
 */
export enum PeriodType {
  TODAY = "TODAY",
  CURRENT_WEEK = "CURRENT_WEEK",
  CURRENT_MONTH = "CURRENT_MONTH",
  PREVIOUS_MONTH = "PREVIOUS_MONTH",
  LAST_7_DAYS = "LAST_7_DAYS",
  LAST_30_DAYS = "LAST_30_DAYS",
  LAST_90_DAYS = "LAST_90_DAYS",
  YEAR_TO_DATE = "YEAR_TO_DATE",
  ALL_TIME = "ALL_TIME",
  CUSTOM = "CUSTOM",
}

export interface PeriodFilterDto {
  period?: PeriodType;
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface ResolvedPeriod {
  period: PeriodType;
  startInclusive: Date | null;
  endExclusive: Date | null;
}

/**
 * Monetary revenue for a single isolated currency.
 * Zero cross-currency arithmetic without authoritative FX rates.
 * All monetary amounts are integer minor units (e.g. cents, paise).
 */
export interface CurrencyRevenueDto {
  currency: string;
  capturedAmountMinor: number;
  refundedAmountMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  transactionCount: number;
  averageOrderValueMinor: number;
}

export interface PaymentMetricsDto {
  totalCount: number;
  capturedCount: number;
  failedCount: number;
  createdCount: number;
  refundedCount: number;
  disputedCount: number;
  totalCreditsPurchased: number;
  byCurrency: Record<string, CurrencyRevenueDto>;
  byProvider: Record<string, { count: number; capturedCount: number; capturedAmountMinor: Record<string, number> }>;
}

export interface CreditMetricsDto {
  totalGrantedCredits: number;
  commercialGrantedCredits: number;
  promotionalGrantedCredits: number;
  consumedCredits: number;
  refundedCredits: number;
  expiredCredits: number;
  availableCredits: number;
  bySource: Record<string, number>;
  poolCounts: {
    active: number;
    queued: number;
    exhausted: number;
    expired: number;
    suspended: number;
    cancelled: number;
    total: number;
  };
}

export interface RevenueMetricsDto {
  period: ResolvedPeriod;
  currencies: Record<string, CurrencyRevenueDto>;
  historicalPricingIntegrityVerified: boolean;
}

export interface UtilizationMetricsDto {
  totalBillingAccounts: number;
  activeBillingAccounts: number;
  accountsWithPaidPurchase: number;
  totalSessionsBilled: number;
  totalSessionsConsumingCredit: number;
  creditConsumptionRatePercent: number; // [0, 100]
  waivedCourtesyAttempts: number;
}

export interface RiskExposureDto {
  totalOverdraftLimitMinor: number; // ADR-004: must be 0
  totalOverdraftUsedMinor: number;  // ADR-004: must be 0
  agedOverdraftCount: number;       // ADR-004: must be 0
  activeDisputedPaymentsCount: number;
  disputedAmountsByCurrency: Record<string, number>;
}

export interface ReconciliationSummaryDto {
  latestRunId: string | null;
  status: "PASSED" | "WARNING" | "FAILED" | "UNAVAILABLE";
  driftDetected: boolean;
  executedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  checkSummaries: Record<string, { status: string; findingsCount: number }>;
}

export interface FinancialOverviewDto {
  period: ResolvedPeriod;
  revenue: Record<string, CurrencyRevenueDto>;
  credits: CreditMetricsDto;
  payments: PaymentMetricsDto;
  utilization: UtilizationMetricsDto;
  risk: RiskExposureDto;
  reconciliation: ReconciliationSummaryDto;
}

export interface AccountFinanceMetricsDto {
  billingAccountId: string;
  accountName: string;
  status: string;
  billingCountry: string;
  currency: string;
  availableCredits: number;
  overdraftUsed: number;
  overdraftLimit: number;
  lifetimePurchasedCredits: number;
  lifetimeConsumedCredits: number;
  payments: PaymentMetricsDto;
  pools: {
    active: number;
    queued: number;
    exhausted: number;
    expired: number;
    total: number;
  };
}
