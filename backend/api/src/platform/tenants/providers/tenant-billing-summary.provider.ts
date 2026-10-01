import { Injectable } from '@nestjs/common';

export const TENANT_BILLING_SUMMARY_PROVIDER = 'TENANT_BILLING_SUMMARY_PROVIDER';

export interface BillingFunnelFacts {
  hasPaidPurchase: boolean;
  trialGrantedAt?: Date | string | null;
  trialExpiresAt?: Date | string | null;
  trialCreditsRemaining?: number | null;
}

export interface PlatformBillingOverview {
  pendingApprovals?: number;
  trialsExpiringSoon?: number;
  reconciliationStatus?: 'PASSED' | 'FAILED' | 'UNKNOWN';
  lastReconciledAt?: Date | string | null;
}

export interface ITenantBillingSummaryProvider {
  /**
   * Retrieves remaining credits for a single tenant organization.
   * Returns null if billing account or ledger summary is not yet active/configured.
   */
  getCreditsRemaining(organizationId: string): Promise<number | null>;

  /**
   * Batch retrieval for remaining credits to avoid N+1 queries.
   */
  getBulkCreditsRemaining(organizationIds: string[]): Promise<Map<string, number | null>>;

  /**
   * Batch retrieval of billing commercial facts for lifecycle funnel derivation (Zero N+1).
   */
  getFunnelFacts(organizationIds: string[]): Promise<Map<string, BillingFunnelFacts | null>>;

  /**
   * Retrieves high-level platform billing overview metrics.
   * Returns null if billing subsystem is not connected / Null provider.
   */
  getPlatformBillingOverview(): Promise<PlatformBillingOverview | null>;
}

/**
 * Default provider for Half 1 foundation.
 * Returns null for all tenants until Half 2 real billing ledger service is bound.
 */
@Injectable()
export class NullTenantBillingSummaryProvider implements ITenantBillingSummaryProvider {
  async getCreditsRemaining(_organizationId: string): Promise<number | null> {
    return null;
  }

  async getBulkCreditsRemaining(organizationIds: string[]): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>();
    for (const id of organizationIds) {
      result.set(id, null);
    }
    return result;
  }

  async getFunnelFacts(organizationIds: string[]): Promise<Map<string, BillingFunnelFacts | null>> {
    const result = new Map<string, BillingFunnelFacts | null>();
    for (const id of organizationIds) {
      result.set(id, null);
    }
    return result;
  }

  async getPlatformBillingOverview(): Promise<PlatformBillingOverview | null> {
    return null;
  }
}
