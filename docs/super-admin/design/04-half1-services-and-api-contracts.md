# Artifact 04 (Half 1): Services Architecture & API Contracts

**Document:** `docs/super-admin/design/04-half1-services-and-api-contracts.md`  
**Classification:** Backend Service Design & Interface Contract  
**System:** Proctora / CD-Recruit Platform Operations & Tenant Lifecycle  
**Authoritative Precedence:** `super-admin-intent.md` > `CD-Recruit_Super_Admin_Scope_and_Split.md` > `07-half1-half2-integration-contract.md`  
**Ownership:** Dev 1 (Half 1 Lead)

---

## 1. Service Layer Dependency Graph

```mermaid
graph TD
    subgraph Platform Controllers
        PAC[PlatformAuthController]
        TMC[TenantManagementController]
        TOC[TenantOnboardingController]
        OOC[OperationalOverridesController]
        IMC[ImpersonationController]
        PMC[PlatformMetricsController]
        ALC[AuditLogController]
    end

    subgraph Half 1 Core Services
        PAS[PlatformAuthService]
        TMS[TenantManagementService]
        TOS[TenantOnboardingService]
        OOS[OperationalOverridesService]
        IMS[ImpersonationService]
        PMS[PlatformMetricsService]
        AUS[AuditService]
        ENS[EntitlementsService]
    end

    subgraph Half 2 External Services (Contract Boundary)
        BAS[BillingAccountService]
        TGS[TrialGrantService]
        BAC[BillingAccountController /summary API]
    end

    PAC --> PAS
    TMC --> TMS
    TOC --> TOS
    OOC --> OOS
    IMC --> IMS
    PMC --> PMS
    ALC --> AUS

    TOS --> BAS
    TOS --> TGS
    TMS --> BAC
    TMS --> AUS
    OOS --> AUS
    IMS --> AUS
    TOS --> AUS
```

---

## 2. Core Service Interface Contracts

### 2.1 `PlatformAuthService` & Guards
Provides operator authentication, TOTP MFA validation, and role-based access control.

```typescript
export interface PlatformLoginDto {
  email: string;
  passwordHash: string;
}

export interface VerifyMfaDto {
  tempToken: string;
  totpCode: string;
}

export interface PlatformTokenPayload {
  sub: string;            // PlatformStaff ID
  email: string;
  role: PlatformStaffRole;
  mfaVerified: boolean;
  isPlatformStaff: true;
}

export interface PlatformAuthResultDto {
  requiresMfa: boolean;
  tempToken?: string;
  accessToken?: string;
  expiresIn?: number;
  staff: {
    id: string;
    email: string;
    fullName: string;
    role: PlatformStaffRole;
  };
}

export interface IPlatformAuthService {
  login(dto: PlatformLoginDto, clientIp: string): Promise<PlatformAuthResultDto>;
  verifyMfa(dto: VerifyMfaDto, clientIp: string): Promise<PlatformAuthResultDto>;
  setupMfa(staffId: string): Promise<{ qrCodeUrl: string; secret: string }>;
  confirmMfaSetup(staffId: string, totpCode: string): Promise<void>;
  revokeSession(staffId: string): Promise<void>;
}
```

---

### 2.2 `TenantOnboardingService`
Orchestrates tenant signup, corporate domain validation, initial admin provisioning, and cross-team Half 2 billing account/trial setup.

```typescript
export interface OnboardTenantDto {
  // Step 1: Company Profile
  companyName: string;
  legalEntityName?: string;
  slug: string;
  corporateDomain: string;
  countryCode: string; // ISO-2 (e.g. 'IN', 'US')
  taxId?: string;

  // Step 2: Primary Admin
  primaryAdminName: string;
  primaryAdminEmail: string;

  // Step 3: Licensing Tier & Entitlements
  licenseTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  entitlements?: Record<string, boolean>;

  // Step 4: Checklist & Internal Owner
  internalOwnerId?: string;
  kickoffNotes?: string;
}

export interface OnboardingResultDto {
  organizationId: string;
  slug: string;
  primaryAdminUserId: string;
  billingAccountId: string;
  trialPoolId: string;
  trialCreditsGranted: number; // Exactly 25
  trialExpiresAt: Date;
  lifecycleStage: 'ONBOARDING' | 'TRIAL';
  createdAt: Date;
}

export interface ITenantOnboardingService {
  verifyDomain(domain: string): Promise<{ isAvailable: boolean; reason?: string }>;
  saveDraft(domain: string, step: number, data: any, staffId: string): Promise<{ draftId: string }>;
  getDraft(domain: string): Promise<any | null>;
  onboardTenant(dto: OnboardTenantDto, operatorStaffId: string): Promise<OnboardingResultDto>;
}
```

---

### 2.3 `OperationalOverridesService`
Executes safe, time-boxed operational adjustments with two-actor audit integrity.

```typescript
export interface RelaxProctoringSensitivityDto {
  driveId: string;
  faceTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  tabSwitchAllowance: number; // 1 - 10
  audioFactor: number;
  durationHours: number;      // Max 72
  reason: string;
  ticketRef: string;
}

export interface FixQuestionMidDriveDto {
  driveId: string;
  originalQuestionId: string;
  updatedQuestionPayload: {
    title: string;
    description: string;
    testCases?: any[];
    rubric?: any;
  };
  reason: string;
  ticketRef: string;
}

export interface ExtendScheduleDto {
  driveId: string;
  extendedEndAt: Date;
  reason: string;
  ticketRef: string;
}

export interface OverrideActionResultDto {
  overrideId: string;
  overrideType: string;
  driveId?: string;
  organizationId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  activeFrom: Date;
  expiresAt?: Date;
  ticketRef: string;
  requestedById: string;
  beforeState: any;
  afterState: any;
}

export interface IOperationalOverridesService {
  relaxProctoringSensitivity(dto: RelaxProctoringSensitivityDto, staffId: string): Promise<OverrideActionResultDto>;
  fixQuestionMidDrive(dto: FixQuestionMidDriveDto, staffId: string): Promise<OverrideActionResultDto>;
  extendSchedule(dto: ExtendScheduleDto, staffId: string): Promise<OverrideActionResultDto>;
  overrideInviteRatio(driveId: string, customRatio: number, ticketRef: string, reason: string, staffId: string): Promise<OverrideActionResultDto>;
  listActiveOverrides(driveId?: string, organizationId?: string): Promise<OverrideActionResultDto[]>;
  revokeOverride(overrideId: string, staffId: string, reason: string): Promise<void>;
}
```

---

### 2.4 `ImpersonationService`
Manages 30-minute time-boxed staff impersonation sessions into tenant admin consoles.

```typescript
export interface StartImpersonationDto {
  organizationId: string;
  targetUserId: string;
  ticketRef: string;
  reason: string;
}

export interface ImpersonationResultDto {
  sessionId: string;
  impersonationToken: string;
  expiresAt: Date;
  targetUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  organization: {
    id: string;
    name: string;
  };
}

export interface IImpersonationService {
  startImpersonation(dto: StartImpersonationDto, staffId: string, clientIp: string, userAgent?: string): Promise<ImpersonationResultDto>;
  terminateImpersonation(sessionId: string, staffId: string, reason: string): Promise<void>;
  getActiveSession(staffId: string): Promise<any | null>;
}
```

---

### 2.5 `AuditService`
Writes append-only audit entries and provides a unified explorer aggregating platform and billing audit streams.

```typescript
export interface RecordPlatformAuditDto {
  actorId: string;
  actorRole: string;
  subjectType: 'TENANT' | 'STAFF' | 'OVERRIDE' | 'RETENTION' | 'LICENSING' | 'IMPERSONATION';
  subjectId: string;
  action: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  reason?: string;
  ticketRef?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface UnifiedAuditQueryDto {
  startDate?: Date;
  endDate?: Date;
  actorId?: string;
  subjectType?: string;
  subjectId?: string;
  ticketRef?: string;
  stream?: 'ALL' | 'PLATFORM' | 'BILLING';
  page?: number;
  limit?: number;
}

export interface UnifiedAuditEventDto {
  id: string;
  stream: 'PLATFORM' | 'BILLING';
  actorId: string;
  actorRole: string;
  subjectType: string;
  subjectId: string;
  action: string;
  reason?: string;
  ticketRef?: string;
  beforeState?: any;
  afterState?: any;
  createdAt: Date;
}

export interface IAuditService {
  record(dto: RecordPlatformAuditDto): Promise<void>;
  queryUnifiedAudit(query: UnifiedAuditQueryDto): Promise<{ items: UnifiedAuditEventDto[]; total: number }>;
  exportAuditCsv(query: UnifiedAuditQueryDto): Promise<string>;
}
```

---

## 3. Standard HTTP Error Handling Protocol

All platform endpoints adhere to standard RFC 7807 error envelopes:

```json
{
  "statusCode": 400,
  "errorCode": "FREEMAIL_DOMAIN_NOT_PERMITTED",
  "message": "Public email domains (gmail.com, yahoo.com) cannot be used for tenant onboarding.",
  "timestamp": "2026-09-29T10:50:00Z",
  "path": "/api/v1/platform/tenants/onboard"
}
```

### Key Error Codes:
- `MFA_REQUIRED` (401): Valid password supplied but MFA token not yet verified.
- `FREEMAIL_DOMAIN_NOT_PERMITTED` (400): Domain blacklisted.
- `TRIAL_DOMAIN_ALREADY_EXISTS` (409): Domain already claimed trial credits.
- `OVERRIDE_EXPIRY_EXCEEDS_LIMIT` (400): Proctoring relaxation duration exceeds 72h.
- `IMPERSONATION_SESSION_EXPIRED` (401): Attempted action past the 30-min window.
- `INSUFFICIENT_STAFF_ROLE` (403): Endpoint requires higher role (`FINANCE` or `OWNER`).
