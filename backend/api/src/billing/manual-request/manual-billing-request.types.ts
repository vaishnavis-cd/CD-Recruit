import { PlatformStaffRole, ManualRequestKind, ManualRequestStatus } from "@cd-recruit/shared-types";
import { LedgerActor } from "../ledger/ledger.types";

export { ManualRequestKind, ManualRequestStatus };

/**
 * Payload for ManualRequestKind.GRANT
 */
export interface GrantPayload {
  credits: number;
  source?: "GOODWILL" | "PROMO" | "TRIAL" | "CONTRACT" | "PURCHASE" | "ROLLOVER";
  validityDays?: number;
  poolId?: string; // If specified, grants to existing pool
  poolType?: "TALENT_RESERVE" | "DRIVE_PASS" | "ENTERPRISE";
  poolName?: string;
  driveId?: string | null;
}

/**
 * Payload for ManualRequestKind.ADJUST
 */
export interface AdjustPayload {
  poolId: string;
  amount: number; // Signed non-zero integer (+n or -n)
  note?: string;
}

/**
 * Payload for ManualRequestKind.EXPIRY_EXTEND
 */
export interface ExpiryExtendPayload {
  poolId: string;
  newExpiry: string | Date;
  extensionDays?: number;
}

/**
 * Payload for ManualRequestKind.ACCOUNT_STATUS
 */
export interface AccountStatusPayload {
  status: "ACTIVE" | "RESTRICTED" | "SUSPENDED";
}

/**
 * Payload for ManualRequestKind.OVERDRAFT_LIMIT
 */
export interface OverdraftLimitPayload {
  overdraftLimit: number; // Must be 0 per ADR-004
}

/**
 * Payload for ManualRequestKind.REFUND
 */
export interface RefundPayload {
  poolId?: string;
  paymentId?: string;
  amountMinor?: number;
  credits?: number;
}

/**
 * Payload for ManualRequestKind.BILLING_COUNTRY
 */
export interface BillingCountryPayload {
  billingCountry: string; // ISO-2
  taxCertificateRef?: string;
}

/**
 * Union of supported typed payloads for manual requests
 */
export type ManualRequestPayload =
  | GrantPayload
  | AdjustPayload
  | ExpiryExtendPayload
  | AccountStatusPayload
  | OverdraftLimitPayload
  | RefundPayload
  | BillingCountryPayload
  | Record<string, any>;

/**
 * Input DTO for creating a manual billing request
 */
export interface CreateManualRequestDto {
  billingAccountId: string;
  kind: ManualRequestKind | string;
  ticketRef: string;
  reason: string;
  payload: Record<string, any>;
}

/**
 * Input DTO for rejecting a manual billing request
 */
export interface RejectManualRequestDto {
  rejectionReason: string;
}

/**
 * Filter options for listing manual billing requests
 */
export interface ManualRequestFilter {
  tab?: "my_requests" | "awaiting_approval" | "all";
  status?: ManualRequestStatus | string;
  kind?: ManualRequestKind | string;
  billingAccountId?: string;
  page?: number;
  limit?: number;
  pageSize?: number;
}

/**
 * Full record representing billing.manual_billing_request
 */
export interface ManualBillingRequestRecord {
  id: string;
  billingAccountId: string;
  kind: string;
  payload: any;
  reason: string;
  ticketRef: string;
  requestedById: string;
  approvedById: string | null;
  status: string;
  rejectionReason: string | null;
  executionError: string | null;
  decidedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
}

/**
 * Detailed view of a manual billing request with zero candidate PII
 */
export interface ManualRequestDetailDto extends ManualBillingRequestRecord {
  billingAccount?: {
    id: string;
    name: string;
    billingCountry: string;
    currency: string;
    status: string;
  } | null;
}
