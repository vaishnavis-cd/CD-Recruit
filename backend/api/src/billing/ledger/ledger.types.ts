import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { AuthenticatedPlatformActor } from "../../platform/audit/platform-audit.types";

/**
 * Approved financial ledger entry types.
 * Aligns with Artifact 02, Artifact 03, and database constraint chk_ledger_amount_sign.
 */
export enum LedgerEntryType {
  GRANT = "GRANT",
  CONSUME = "CONSUME",
  OVERDRAFT = "OVERDRAFT",
  OVERDRAFT_SETTLE = "OVERDRAFT_SETTLE",
  WAIVE = "WAIVE",
  REVERSAL = "REVERSAL",
  REFUND = "REFUND",
  EXPIRE = "EXPIRE",
  ADJUST = "ADJUST",
}

/**
 * Approved grant sources for GRANT entries (Artifact 03).
 */
export enum LedgerGrantSource {
  PURCHASE = "PURCHASE",
  CONTRACT = "CONTRACT",
  TRIAL = "TRIAL",
  PROMO = "PROMO",
  GOODWILL = "GOODWILL",
  MIGRATION = "MIGRATION",
  ROLLOVER = "ROLLOVER",
}

/**
 * Approved financial reason codes for ledger entries (Artifact 02 / 03).
 */
export enum LedgerReason {
  PROMOTIONAL_SEED_GRANT = "PROMOTIONAL_SEED_GRANT",
  PURCHASE_ALLOCATION = "PURCHASE_ALLOCATION",
  TRIAL_GRANT = "TRIAL_GRANT",
  ATTEMPT_START = "ATTEMPT_START",
  PLATFORM_FAULT = "PLATFORM_FAULT",
  INCIDENT_WINDOW = "INCIDENT_WINDOW",
  MANUAL_CORRECTION = "MANUAL_CORRECTION",
  COURTESY_WAIVER = "COURTESY_WAIVER",
  POOL_EXPIRATION = "POOL_EXPIRATION",
  OVERDRAFT_SETTLEMENT = "OVERDRAFT_SETTLEMENT",
  GOODWILL_GRANT = "GOODWILL_GRANT",
  ADMINISTRATIVE_ADJUSTMENT = "ADMINISTRATIVE_ADJUSTMENT",
  CANDIDATE_APPEAL = "CANDIDATE_APPEAL",
}

export type LedgerActor = AuthenticatedPlatformActor | "system";

export interface GrantCreditParams {
  billingAccountId: string;
  organizationId: string;
  creditPoolId: string;
  amount: number;
  grantSource: LedgerGrantSource | string;
  reason: LedgerReason | string;
  reasonNote?: string | null;
  paymentId?: string | null;
  requestId?: string | null;
  idempotencyKey: string;
  actor: LedgerActor;
  ticketRef?: string | null;
  tx?: any;
}

export interface ConsumeCreditParams {
  billingAccountId: string;
  organizationId: string;
  creditPoolId: string;
  amount?: number; // Defaults to -1
  reason: LedgerReason | string;
  reasonNote?: string | null;
  sessionId?: string | null;
  driveId?: string | null;
  idempotencyKey: string;
  actor: LedgerActor;
  ticketRef?: string | null;
}

export interface ReverseCreditParams {
  relatedEntryId: string;
  reason: LedgerReason | string;
  reasonNote?: string | null;
  idempotencyKey?: string;
  actor: LedgerActor;
  ticketRef?: string | null;
  requestId?: string | null;
}

export interface AdjustCreditParams {
  billingAccountId: string;
  organizationId: string;
  creditPoolId: string;
  amount: number; // Non-zero signed integer
  reason: LedgerReason | string;
  reasonNote?: string | null;
  requestId: string; // Required for maker-checker audit
  approvedById?: string | null;
  idempotencyKey: string;
  actor: AuthenticatedPlatformActor; // Must be FINANCE or OWNER
  ticketRef?: string | null;
  tx?: any;
}

export interface ExpirePoolCreditsParams {
  billingAccountId: string;
  creditPoolId: string;
  reason?: LedgerReason | string;
  idempotencyKey?: string;
  actor?: LedgerActor;
}

export interface BeginSessionOutcome {
  outcome: "STARTED" | "ALREADY_STARTED" | "NEEDS_SLOW_PATH" | "ZERO_COST" | "OFF";
  poolId: string | null;
  balanceRemaining: number;
  overdraftUsed: number;
  evidenceId: string | null;
}

export interface LedgerQueryFilter {
  billingAccountId?: string;
  creditPoolId?: string;
  sessionId?: string;
  driveId?: string;
  entryType?: string;
  limit?: number;
  offset?: number;
}
