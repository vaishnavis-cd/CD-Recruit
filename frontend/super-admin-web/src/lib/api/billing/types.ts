// Commercial & Billing Types for Super Admin Console

export type BillingAccountStatus = 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED';
export type PoolStatus = 'QUEUED' | 'ACTIVE' | 'SUSPENDED' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';
export type PoolType = 'TALENT_RESERVE' | 'DRIVE_PASS' | string;
export type GrantSource = 'PURCHASE' | 'TRIAL' | 'CONTRACT' | 'GOODWILL' | string;
export type LedgerEntryType = 'GRANT' | 'CONSUME' | 'REVERSAL' | 'OVERDRAFT' | 'OVERDRAFT_SETTLE' | 'WAIVE' | 'EXPIRE' | string;
export type ManualRequestKind = 'GRANT' | 'ADJUST' | 'REFUND' | 'EXPIRY_EXTEND' | 'OVERDRAFT_LIMIT' | 'ACCOUNT_STATUS' | 'BILLING_COUNTRY' | string;
export type ManualRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED' | string;

export interface BillingAccountListItem {
  id: string;
  name?: string;
  legalEntityName?: string | null;
  billingCountry?: string;
  currency: string;
  status: BillingAccountStatus;
  overdraftLimit: number;
  overdraftUsed?: number;
  hasPaidPurchase?: boolean;
  totalRemainingCredits?: number;
  balance: number; // authoritative available balance
  activePoolsCount?: number;
  organizationsCount?: number;
  organizations?: Array<{
    id: string;
    name: string;
    slug?: string;
  }>;
  createdAt: string;
  updatedAt?: string;
}

export interface BillingAccountDetail extends BillingAccountListItem {
  taxId?: string | null;
  trialDomain?: string | null;
  trialGrantedAt?: string | null;
  organizations: Array<{
    id: string;
    name: string;
    slug?: string;
  }>;
  pools: CreditPoolDetail[];
  recentTransactions?: CreditLedgerEntryItem[];
}

export interface BillingAccountSummary {
  billingAccountId: string;
  name?: string;
  status: BillingAccountStatus;
  currency: string;
  billingCountry?: string;
  totalAvailableCredits: number;
  activePoolCredits?: number;
  queuedPoolCredits?: number;
  overdraftUsed?: number;
  overdraftLimit: number;
  overdraftAvailable?: number;
  activePools?: Array<{
    id: string;
    name: string;
    poolType: PoolType;
    source: GrantSource;
    cachedRemaining: number;
    balance?: number;
    expiresAt?: string | null;
  }>;
  recentLedgerEntries?: CreditLedgerEntryItem[];
  account?: BillingAccountDetail;
}

export interface CreditPoolSummary {
  id: string;
  billingAccountId: string;
  driveId?: string | null;
  poolType: PoolType;
  name?: string;
  source?: GrantSource;
  totalCredits?: number;
  originalAmount?: number;
  cachedRemaining?: number;
  balance: number;
  validityDays?: number;
  maxWaitDays?: number;
  queueOrder?: number;
  status: PoolStatus;
  purchasedAt?: string;
  activatedAt?: string | null;
  expiresAt?: string | null;
  unitPriceMinor?: number;
  currency: string;
  paymentId?: string | null;
  termsVersion?: string | null;
  termsAcceptedBy?: string | null;
  termsAcceptedAt?: string | null;
  createdAt: string;
  priorityTier?: string;
  reason?: string;
  ticketRef?: string;
  contractRef?: string;
  createdBy?: string;
}

export interface CreditPoolDetail extends CreditPoolSummary {
  billingAccountName?: string;
  ledgerEntries?: CreditLedgerEntryItem[];
  drawdowns?: CreditLedgerEntryItem[];
}

export interface CreditLedgerEntryItem {
  id: string;
  billingAccountId: string;
  organizationId?: string;
  creditPoolId?: string | null;
  entryType: LedgerEntryType;
  amount: number;
  balanceAfter?: number | null;
  sessionId?: string | null;
  driveId?: string | null;
  relatedEntryId?: string | null;
  grantSource?: GrantSource | null;
  sequenceNumber?: number;
  reason?: string;
  reasonNote?: string | null;
  description?: string;
  paymentId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  actorId?: string;
  approvedById?: string | null;
  shadow?: boolean;
  createdAt: string;
}

export interface ManualBillingRequestItem {
  id: string;
  billingAccountId: string;
  billingAccountName?: string;
  kind?: ManualRequestKind;
  requestType: ManualRequestKind;
  payload?: Record<string, any>;
  amount?: number;
  reason: string;
  rejectionReason?: string | null;
  ticketRef?: string;
  requestedById: string;
  requestedBy?: string;
  requestedByName?: string;
  approvedById?: string | null;
  approvedByName?: string | null;
  status: ManualRequestStatus;
  decidedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
}

export interface PriceBookItem {
  id: string;
  sku?: string;
  tierName?: string;
  billingCountry?: string;
  currency: string;
  unitPriceMinor?: number;
  unitRateMinor: number;
  poolType?: PoolType;
  totalCredits?: number;
  validityDays?: number;
  version?: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status?: string;
  isActive?: boolean;
}

export interface PaymentItem {
  id: string;
  billingAccountId: string;
  billingAccountName?: string;
  provider: string;
  providerPaymentId?: string;
  providerOrderId?: string | null;
  amountMinor: number;
  taxMinor?: number;
  currency: string;
  creditsPurchased?: number;
  status: string;
  invoiceNumber?: string | null;
  invoiceUrl?: string | null;
  poReference?: string | null;
  capturedAt?: string | null;
  createdAt: string;
}

export interface PaymentWebhookItem {
  id: string;
  provider?: string;
  gateway?: string;
  eventType: string;
  providerEventId?: string;
  idempotencyKey?: string;
  status: 'PENDING' | 'PROCESSED' | 'FAILED' | string;
  processingAttempts?: number;
  errorMessage?: string | null;
  receivedAt?: string;
  processedAt?: string | null;
  createdAt: string;
}

export interface FinanceOverviewMetrics {
  overview?: {
    totalCreditsSold: number;
    totalCreditsConsumed: number;
    totalCreditsExpired: number;
    totalCreditsReversed: number;
    activePoolsCount: number;
    activeAccountsCount: number;
  };
  revenueByCurrency?: Array<{
    currency: string;
    amountMinor: number;
    transactionCount: number;
  }>;
  overdraftRisk?: {
    totalAccountsWithOverdraft: number;
    totalOverdraftLimit: number;
    totalOverdraftUsed: number;
    agedOverdraftCount: number;
  };
  unitEconomics?: {
    rollingAvgAiGradingCostUsd: number;
    aiCostMarginPercent: number;
    marginAlarmTriggered: boolean;
    dataReadiness: boolean;
    attemptsCollected: number;
  };
  totalRevenueMinor?: number;
  totalCreditsGranted?: number;
  totalCreditsConsumed?: number;
  activeAccountsCount?: number;
  aiCostPercentage?: number;
  totalAiCostMinor?: number;
  atRiskAccounts?: Array<{
    id: string;
    organizationName: string;
    balance: number;
    overdraftLimit: number;
  }>;
}

export interface ReconciliationRunResult {
  id: string;
  runType?: 'AUTOMATED' | 'MANUAL';
  status: 'PASSED' | 'FAILED' | 'DISCREPANCY_DETECTED' | 'DRIFT_DETECTED' | string;
  startedAt?: string;
  completedAt?: string;
  timestamp?: string;
  executedBy?: string;
  summary?: {
    totalAccountsAudited: number;
    totalPoolsAudited: number;
    totalLedgerEntriesAudited: number;
    findingsCount: number;
  };
  checks?: {
    poolSumCheck?: boolean;
    sequenceCheck?: boolean;
    overdraftCheck?: boolean;
    expiryCheck?: boolean;
    idempotencyCheck?: boolean;
    currencyCheck?: boolean;
    doubleEntryCheck?: boolean;
    [key: string]: any;
  };
  shadowStats?: {
    completedAttempts: number;
    discrepancies: number;
    targetAttempts: number;
  };
}

export interface IncidentWindowItem {
  id: string;
  title: string;
  description: string;
  ticketRef: string;
  startedAt: string;
  endedAt: string;
  declaredBy: string;
  remediationStatus: 'PENDING' | 'EXECUTED';
  affectedSessionsCount?: number;
  reversalLedgerCount?: number;
  createdAt: string;
}
