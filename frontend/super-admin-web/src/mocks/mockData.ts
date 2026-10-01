// Centralized Mock Data Store for Super Admin Dev/Demo Preview
// Active ONLY when import.meta.env.VITE_USE_MOCKS === 'true'

export const MOCK_OVERVIEW_METRICS = {
  tenants: {
    total: 12,
    byStatus: {
      PROVISIONING: 2,
      ACTIVE: 8,
      SUSPENDED: 1,
      OFFBOARDED: 1,
    },
    byFunnelStage: {
      SIGNED_UP: 2,
      TRIAL_ACTIVE: 3,
      FIRST_DRIVE_CREATED: 4,
      CONVERTED: 2,
      DORMANT: 0,
      UNKNOWN: 1,
    },
    createdLast7Days: 3,
    createdLast30Days: 7,
  },
  drives: {
    active: 28,
    total: 45,
  },
  sessions: {
    liveNow: 14,
    startedLast24h: 342,
    completedLast24h: 298,
  },
  attention: [
    {
      kind: 'SUSPENDED_TENANTS',
      severity: 'HIGH',
      count: 1,
      label: 'Suspended tenants',
      link: '/tenants?status=SUSPENDED',
    },
    {
      kind: 'UNVERIFIED_DOMAIN_OVER_7D',
      severity: 'MEDIUM',
      count: 2,
      label: 'Unverified domains (>7 days)',
      link: '/pipeline',
    },
    {
      kind: 'DRAFTS_EXPIRING_SOON',
      severity: 'HIGH',
      count: 1,
      label: 'Onboarding drafts expiring soon (<3 days)',
      link: '/onboarding',
    },
  ],
  billing: {
    connected: false,
  },
  infrastructure: {
    connected: false,
  },
  generatedAt: new Date().toISOString(),
};

export const MOCK_TENANTS = [
  {
    id: 'org_acme_01',
    name: 'Acme Corporation',
    domain: 'acme.com',
    lifecycleStatus: 'TRIAL' as const,
    licenseTier: 'ENTERPRISE' as const,
    creditsRemaining: 45,
    drivesCount: 4,
    createdAt: '2026-09-15',
  },
  {
    id: 'org_apex_02',
    name: 'Apex Logistics & Tech',
    domain: 'apexlogistics.io',
    lifecycleStatus: 'ACTIVE' as const,
    licenseTier: 'ENTERPRISE' as const,
    creditsRemaining: 1200,
    drivesCount: 18,
    createdAt: '2026-08-01',
  },
  {
    id: 'org_techvan_03',
    name: 'TechVanguard Global',
    domain: 'techvanguard.ai',
    lifecycleStatus: 'ACTIVE' as const,
    licenseTier: 'PRO' as const,
    creditsRemaining: 230,
    drivesCount: 8,
    createdAt: '2026-08-20',
  },
  {
    id: 'org_nexus_04',
    name: 'Nexus FinTech Labs',
    domain: 'nexuslabs.co',
    lifecycleStatus: 'SUSPENDED' as const,
    licenseTier: 'STANDARD' as const,
    creditsRemaining: 0,
    drivesCount: 2,
    createdAt: '2026-09-02',
  },
];

export const MOCK_TENANT_DETAIL = {
  id: 'org_acme_01',
  name: 'Acme Corporation',
  domain: 'acme.com',
  status: 'ACTIVE' as const,
  licenseTier: 'ENTERPRISE' as const,
  retentionDays: 90,
  creditsRemaining: 45,
  totalDrives: 6,
  liveDrives: 2,
  activeCandidates: 48,
  primaryContact: 'Jane Doe (Head of TA)',
  contactEmail: 'jane.doe@acme.com',
  createdAt: '2026-09-15',
};

export const MOCK_OVERRIDES = [
  {
    id: 'ovr_101',
    tenantName: 'Acme Corporation',
    driveId: 'drv_campus_2026_09',
    overrideType: 'PROCTORING_RELAXATION' as const,
    reason: 'Campus Wi-Fi unstable at Tier-2 university test center',
    ticketRef: 'INC-88902',
    operatorEmail: 'lead-support@proctora.internal',
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    status: 'ACTIVE' as const,
  },
  {
    id: 'ovr_102',
    tenantName: 'Apex Logistics',
    driveId: 'drv_devops_hiring',
    overrideType: 'SCHEDULE_EXTENSION' as const,
    reason: 'Extended window due to nationwide power outage',
    ticketRef: 'INC-88711',
    operatorEmail: 'operator@proctora.internal',
    expiresAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    status: 'EXPIRED' as const,
  },
];

export const MOCK_AUDIT_LOGS = [
  {
    id: 'evt_99182',
    eventType: 'PLATFORM_LOGIN_MFA_VERIFIED',
    actorId: 'stf_001',
    actorEmail: 'lead-support@proctora.internal',
    ipAddress: '10.244.0.12',
    payload: { method: 'TOTP_RFC6238', result: 'SUCCESS' },
    createdAt: new Date().toISOString(),
  },
  {
    id: 'evt_99181',
    eventType: 'OVERRIDE_PROCTORING_RELAXED',
    actorId: 'stf_001',
    actorEmail: 'lead-support@proctora.internal',
    tenantId: 'org_acme_01',
    ipAddress: '10.244.0.12',
    payload: { driveId: 'drv_campus_2026_09', durationHours: 48, ticketRef: 'INC-88902' },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'evt_99180',
    eventType: 'TENANT_ONBOARDED',
    actorId: 'stf_002',
    actorEmail: 'admin-ops@proctora.internal',
    tenantId: 'org_apex_02',
    ipAddress: '10.244.0.15',
    payload: { domain: 'apexlogistics.io', licenseTier: 'ENTERPRISE', creditsGranted: 50 },
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];
