import { LedgerActor } from "../ledger/ledger.types";

/**
 * Result DTO for automatic onboarding trial grant per Artifact 07 §2.2.
 */
export interface TrialGrantResultDto {
  poolId: string;
  billingAccountId: string;
  creditsGranted: number; // Exactly 25
  validityDays: number; // Exactly 30
  expiresAt: Date; // now + 30 days
  ledgerEntryId: string;
  status: "ACTIVE";
}

/**
 * Execution context for transactional coupling and audit provenance.
 */
export interface TrialGrantContext {
  transactionClient?: any;
  actor?: LedgerActor;
  reason?: string;
  ticketRef?: string;
}

/**
 * Authoritative trial policy constants per Artifact 01, Artifact 02, and Artifact 07.
 */
export const TRIAL_POLICY = {
  CREDITS_GRANTED: 25,
  VALIDITY_DAYS: 30,
  POOL_TYPE: "TALENT_RESERVE" as const,
  GRANT_SOURCE: "TRIAL" as const,
  POOL_NAME: "Onboarding Trial Pool",
} as const;

/**
 * Read model representation of an account's trial status.
 */
export interface TrialStatusDto {
  hasReceivedTrial: boolean;
  trialDomain: string | null;
  trialGrantedAt: Date | null;
  trialPool: {
    id: string;
    cachedRemaining: number;
    totalCredits: number;
    expiresAt: Date | null;
    status: string;
  } | null;
}
