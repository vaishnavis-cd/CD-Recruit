export interface AttentionItemDto {
  kind:
    | 'SUSPENDED_TENANTS'
    | 'UNVERIFIED_DOMAIN_OVER_7D'
    | 'NO_OWNER_ASSIGNED'
    | 'WALKTHROUGH_PENDING_OVER_14D'
    | 'DRAFTS_EXPIRING_SOON';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  label: string;
  link: string | null;
}

export interface PlatformBillingOverviewDto {
  connected: boolean;
  pendingApprovals?: number;
  trialsExpiringSoon?: number;
  reconciliationStatus?: 'PASSED' | 'FAILED' | 'UNKNOWN';
  lastReconciledAt?: Date | string | null;
}

export interface PlatformInfrastructureDto {
  connected: false;
}

export interface PlatformMetricsOverviewResponseDto {
  tenants: {
    total: number;
    byStatus: {
      PROVISIONING: number;
      ACTIVE: number;
      SUSPENDED: number;
      OFFBOARDED: number;
    };
    byFunnelStage: {
      SIGNED_UP: number;
      TRIAL_ACTIVE: number;
      FIRST_DRIVE_CREATED: number;
      CONVERTED: number;
      DORMANT: number;
      UNKNOWN: number;
    };
    createdLast7Days: number;
    createdLast30Days: number;
  };
  drives: {
    active: number;
    total: number;
  };
  sessions: {
    liveNow: number;
    startedLast24h: number;
    completedLast24h: number;
  };
  attention: AttentionItemDto[];
  billing: PlatformBillingOverviewDto;
  infrastructure: PlatformInfrastructureDto;
  generatedAt: string;
}
