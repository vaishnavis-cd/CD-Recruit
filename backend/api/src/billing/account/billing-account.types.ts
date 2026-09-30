import { BadRequestException } from "@nestjs/common";

/**
 * Approved country to currency policy per Artifact 03 Table 2.1.7, Artifact 07 §2.1, and seed baseline.
 */
export const SUPPORTED_BILLING_COUNTRIES = ["IN", "US", "MY"] as const;
export type SupportedBillingCountry = (typeof SUPPORTED_BILLING_COUNTRIES)[number];

export const COUNTRY_CURRENCY_MAP: Record<SupportedBillingCountry, string> = {
  IN: "INR",
  US: "USD",
  MY: "MYR",
};

/**
 * Derives and enforces the authoritative currency for a given billing country.
 * Prevents callers from arbitrarily choosing currencies that contradict country tax/commercial policy.
 */
export function deriveCurrencyForCountry(country: string, providedCurrency?: string): string {
  if (!country || typeof country !== "string") {
    throw new BadRequestException("UNSUPPORTED_BILLING_COUNTRY: Billing country must be a valid ISO-2 string");
  }

  const normalizedCountry = country.trim().toUpperCase() as SupportedBillingCountry;
  const expectedCurrency = COUNTRY_CURRENCY_MAP[normalizedCountry];

  if (!expectedCurrency) {
    throw new BadRequestException(
      `UNSUPPORTED_BILLING_COUNTRY: Billing country '${country}' is not supported. Supported countries: ${SUPPORTED_BILLING_COUNTRIES.join(", ")}`,
    );
  }

  if (providedCurrency && typeof providedCurrency === "string") {
    const normalizedCurrency = providedCurrency.trim().toUpperCase();
    if (normalizedCurrency !== expectedCurrency) {
      throw new BadRequestException(
        `CURRENCY_COUNTRY_MISMATCH: Provided currency '${providedCurrency}' does not match policy currency '${expectedCurrency}' for country '${normalizedCountry}'`,
      );
    }
  }

  return expectedCurrency;
}

export type BillingAccountStatus = "ACTIVE" | "RESTRICTED" | "SUSPENDED";

/**
 * Parameter DTO for createForOrganization contract per Artifact 07 §2.1.
 */
export interface CreateBillingAccountDto {
  accountName?: string;
  billingCountry: string; // ISO-2 (e.g. 'IN', 'US', 'MY')
  currency?: string; // ISO-3 (e.g. 'INR', 'USD', 'MYR')
  legalEntityName?: string;
  taxId?: string;
  trialDomain?: string;
}

/**
 * Canonical result DTO matching Artifact 07 §2.1.
 */
export interface BillingAccountResultDto {
  id: string;
  organizationId: string;
  name: string;
  billingCountry: string;
  currency: string;
  status: BillingAccountStatus;
  trialDomain: string | null;
  createdAt: Date;
}

/**
 * Financial and operational summary DTO matching Artifact 04 §2.1 and Artifact 07 §2.3.
 */
export interface BillingAccountSummaryDto {
  id: string;
  organizationId: string | null;
  name: string;
  legalEntityName: string | null;
  billingCountry: string;
  currency: string;
  taxId: string | null;
  status: BillingAccountStatus;
  overdraftLimit: number; // Fixed at 0 permanently per ADR-004
  overdraftUsed: number;
  hasPaidPurchase: boolean;
  trialDomain: string | null;
  trialGrantedAt: Date | null;
  totalAvailableCredits: number;
  pools: Array<{
    id: string;
    name: string;
    poolType: string;
    status: string;
    cachedRemaining: number;
    totalCredits: number;
    expiresAt: Date | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for administrative updates to billing account metadata.
 * Platform ops role: SELECT, UPDATE (name, legal_entity_name, tax_id).
 */
export interface UpdateBillingAccountDto {
  name?: string;
  legalEntityName?: string;
  taxId?: string;
}

/**
 * Optional execution context for transactional coupling and audit provenance.
 */
export interface BillingAccountContext {
  transactionClient?: any;
  actor?:
    | {
        id: string;
        role?: string;
        platformRole?: string;
        isPlatformStaff?: boolean;
        email?: string;
      }
    | "system";
  requestId?: string;
  ticketRef?: string;
  reason?: string;
}

/**
 * Filter options for listing billing accounts (API-H2-01)
 */
export interface ListBillingAccountsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: BillingAccountStatus | string;
  country?: string;
}

/**
 * Item in the paginated billing accounts list
 */
export interface BillingAccountListItemDto {
  id: string;
  name: string;
  legalEntityName: string | null;
  billingCountry: string;
  currency: string;
  status: BillingAccountStatus;
  totalRemainingCredits: number;
  overdraftUsed: number;
  overdraftLimit: number;
  hasPaidPurchase: boolean;
  activePoolsCount: number;
  createdAt: Date;
}

/**
 * Paginated result matching Artifact 04 §2.1
 */
export interface PaginatedBillingAccountsResultDto {
  data: BillingAccountListItemDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
