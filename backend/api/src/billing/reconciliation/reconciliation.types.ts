export enum ReconciliationRunType {
  NIGHTLY = "NIGHTLY",
  MANUAL = "MANUAL",
}

export enum ReconciliationRunStatus {
  PASSED = "PASSED",
  WARNING = "WARNING",
  FAILED = "FAILED",
}

export enum ReconciliationFindingSeverity {
  WARNING = "WARNING",
  FAILURE = "FAILURE",
  INCIDENT = "INCIDENT",
}

export enum ReconciliationCheckName {
  POOL_INTEGRITY = "POOL_INTEGRITY",
  OVERDRAFT_INTEGRITY = "OVERDRAFT_INTEGRITY",
  SESSION_ACQUISITION = "SESSION_ACQUISITION",
  EXPIRY_SWEEPER = "EXPIRY_SWEEPER",
  TOPOLOGY_INVARIANT = "TOPOLOGY_INVARIANT",
  PAYMENT_PROOF = "PAYMENT_PROOF",
  AUDIT_WORM_VERIFICATION = "AUDIT_WORM_VERIFICATION",
}

export interface ReconciliationFinding {
  checkName: ReconciliationCheckName;
  severity: ReconciliationFindingSeverity;
  entityType: string;
  entityId: string;
  expectedValue: any;
  observedValue: any;
  message: string;
  detectedAt: string;
  metadata?: Record<string, any>;
}

export interface CheckExecutionResult<TDetails = any> {
  checkName: ReconciliationCheckName;
  status: ReconciliationRunStatus;
  itemsAudited: number;
  discrepancyCount: number;
  details: TDetails;
  findings: ReconciliationFinding[];
}

export interface PoolIntegrityDetails {
  totalPoolsAudited: number;
  poolsWithMismatchedBalance: number;
  poolsWithNegativeBalance: number;
  poolsWithInvalidState: number;
}

export interface OverdraftIntegrityDetails {
  totalAccountsAudited: number;
  accountsWithOverdraftUsed: number;
  accountsWithOverdraftLimit: number;
  activeOverdraftLedgerEntries: number;
}

export interface SessionAcquisitionDetails {
  totalLiveSessionsAudited: number;
  caseA_missingConsumption: number;
  caseB_duplicateConsumption: number;
  caseC_unlinkedConsumption: number;
  caseD_multipleEvidenceOrAcquisition: number;
}

export interface ExpirySweeperDetails {
  totalPoolsAudited: number;
  expiredCorrectly: number;
  expiredUnprocessed: number;
  expiryProcessingFailed: number;
  impossibleExpiryState: number;
}

export interface TopologyDetails {
  totalAccountsAudited: number;
  totalPoolsAudited: number;
  totalLedgerEntriesAudited: number;
  orphanAccounts: number;
  orphanPools: number;
  orphanLedgerEntries: number;
  poolAccountMismatches: number;
  paymentReferenceMismatches: number;
  multipleActiveGeneralPoolsAccounts: number;
}

export interface PaymentProofDetails {
  totalCapturedPaymentsAudited: number;
  paymentsWithMissingPool: number;
  paymentsWithMissingGrant: number;
  paymentsWithGrantAmountMismatch: number;
  paymentsWithPriceBookMismatch: number;
  paymentsWithMathDiscrepancy: number;
  paymentsWithDuplicateGrant: number;
}

export interface AuditWormDetails {
  auditEventsCount: number;
  ledgerEntriesCount: number;
  immutabilityTriggersActive: boolean;
  triggersAudited: Array<{ name: string; table: string; enabled: boolean }>;
  financialEventsWithoutAuditCount: number;
  wormExportStatus: "VERIFIED" | "CAPABILITY_GAP";
  wormCapabilityGapReport: string;
}

export interface ReconciliationRunResultDto {
  id: string;
  runType: string;
  status: string;
  driftDetected: boolean;
  checkResults: Record<string, CheckExecutionResult>;
  discrepancyDetails: ReconciliationFinding[];
  executedBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface ReconciliationStaffActor {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  platformRole?: string;
  isPlatformStaff?: boolean;
}
