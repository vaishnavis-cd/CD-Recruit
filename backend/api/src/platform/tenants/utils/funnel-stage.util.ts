export enum FunnelStage {
  SIGNED_UP = 'SIGNED_UP',
  TRIAL_ACTIVE = 'TRIAL_ACTIVE',
  FIRST_DRIVE_CREATED = 'FIRST_DRIVE_CREATED',
  CONVERTED = 'CONVERTED',
  DORMANT = 'DORMANT',
  CHURNED = 'CHURNED',
  UNKNOWN = 'UNKNOWN',
}

export interface TenantFunnelFacts {
  // From Half 1
  status: string; // 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'OFFBOARDED'
  domainVerifiedAt: Date | string | null;
  walkthroughCompletedAt?: Date | string | null;
  driveCount: number;

  // From Billing (Optional / via provider)
  billingFacts?: {
    hasPaidPurchase: boolean;
    trialGrantedAt?: Date | string | null;
    trialExpiresAt?: Date | string | null;
    trialCreditsRemaining?: number | null;
  } | null;
}

export interface FunnelStageResult {
  funnelStage: FunnelStage;
  reason?: string;
}

/**
 * Pure function deriving commercial lifecycle funnel stage from system facts.
 * Evaluated strictly in order from top to bottom.
 */
export function deriveFunnelStage(facts: TenantFunnelFacts, now = new Date()): FunnelStageResult {
  // 1. OFFBOARDED status -> CHURNED (overrides all)
  if (facts.status === 'OFFBOARDED' || facts.status === 'CHURNED') {
    return { funnelStage: FunnelStage.CHURNED };
  }

  // 2. No domainVerifiedAt -> SIGNED_UP
  if (!facts.domainVerifiedAt) {
    return { funnelStage: FunnelStage.SIGNED_UP };
  }

  // 3. Billing facts not available (provider returned null) -> UNKNOWN
  if (!facts.billingFacts) {
    return {
      funnelStage: FunnelStage.UNKNOWN,
      reason: 'BILLING_NOT_CONNECTED',
    };
  }

  const { hasPaidPurchase, trialExpiresAt, trialCreditsRemaining } = facts.billingFacts;

  // 4. hasPaidPurchase -> CONVERTED
  if (hasPaidPurchase === true) {
    return { funnelStage: FunnelStage.CONVERTED };
  }

  // Determine trial validity
  let isTrialValid = false;
  if (trialExpiresAt) {
    const expiry = trialExpiresAt instanceof Date ? trialExpiresAt : new Date(trialExpiresAt);
    const credits = trialCreditsRemaining !== undefined && trialCreditsRemaining !== null ? trialCreditsRemaining : 1;
    isTrialValid = expiry > now && credits > 0;
  }

  // 5. trial not expired and driveCount > 0 -> FIRST_DRIVE_CREATED
  if (isTrialValid && (facts.driveCount || 0) > 0) {
    return { funnelStage: FunnelStage.FIRST_DRIVE_CREATED };
  }

  // 6. trial not expired and driveCount === 0 -> TRIAL_ACTIVE
  if (isTrialValid && (facts.driveCount || 0) === 0) {
    return { funnelStage: FunnelStage.TRIAL_ACTIVE };
  }

  // 7. trial expired or exhausted, no paid purchase -> DORMANT
  if (!isTrialValid) {
    return { funnelStage: FunnelStage.DORMANT };
  }

  // 8. Otherwise UNKNOWN
  return {
    funnelStage: FunnelStage.UNKNOWN,
    reason: 'UNMATCHED_FACTS_CRITERIA',
  };
}
