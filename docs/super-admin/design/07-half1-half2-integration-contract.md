# Artifact 07: Half 1 ↔ Half 2 Cross-Team Integration Contract

**Document:** `docs/super-admin/design/07-half1-half2-integration-contract.md`  
**Classification:** Explicit Interface Contract & Team Boundary Agreement  
**System:** Proctora / CD-Recruit Platform Ops & Commercial Engine  
**Parties:** Dev 1 (Half 1 — Platform Foundation & Tenant Lifecycle) & Dev 2 (Half 2 — Commercial & Billing Engine)  
**Authoritative Precedence:** Binding Interface Contract. No changes permitted without mutual sign-off and document version increment.  

---

## 1. Ownership & Interface Model

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CROSS-TEAM INTERFACE SEAM                                 │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│         HALF 1 PROVIDES TO HALF 2         │         HALF 2 PROVIDES TO HALF 1          │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ • PlatformAuthGuard & Role Decorators     │ • BillingAccountService.createForOrg()     │
│ • AuditService.record() (Shared Contract) │ • TrialGrantService.grantTrial()           │
│ • GET /platform/tenants/:id/brief         │ • GET /platform/billing/accounts/:id/summ  │
│ • App Shell, Global Nav & Search Hook     │ • POST /platform/billing/requests (Prefill)│
│ • Tenant Lifecycle Status Derivation      │ • Nightly Reconciliation Pass/Fail Status  │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

### 1.1 Team Ownership Matrix

| Functional Capability | Half 1 (Dev 1) | Half 2 (Dev 2) | Interface Mechanism |
|---|---|---|---|
| **Platform Authentication & MFA** | **Owner** | Consumer | NestJS Guard (`PlatformAuthGuard`) |
| **Staff Identity & RBAC** | **Owner** | Consumer | `@Roles(...)` Decorator + JWT Claims |
| **Organization Master Record** | **Owner** | Consumer | DB Entity (`public.organization`) |
| **Tenant Onboarding Wizard** | **Owner** | Consumer | Frontend UI (`/tenants/new`) |
| **Billing Account Creation** | Consumer | **Owner** | Service Call (`BillingAccountService`) |
| **Automatic Trial Grant** | Consumer | **Owner** | Service Call (`TrialGrantService`) |
| **Tenant 360 Billing Summary** | Consumer | **Owner** | HTTP API (`/accounts/:id/summary`) |
| **Manual Billing Requests** | Consumer (UI Creator) | **Owner** (Queue & Engine) | HTTP API (`/platform/billing/requests`) |
| **Maker-Checker Execution** | Consumer (UI Approver)| **Owner** (Ledger Engine) | Service Call (`LedgerService`) |
| **Platform Audit Log Writer** | **Owner** | Consumer | Service Call (`AuditService.record`) |
| **Billing Audit Log Source** | Consumer | **Owner** | DB Table (`billing.billing_audit_event`)|
| **Operational Overrides Engine** | **Owner** | Consumer | DB Table (`platform.override_action`) |
| **Tenant Impersonation Session** | **Owner** | Consumer | Scoped JWT Token |

---

## 2. Half 1 $\rightarrow$ Half 2 Service & API Contracts

---

### 2.1 Direct Service Contract: `BillingAccountService.createForOrganization()`
- **Caller:** Half 1 (`OnboardingService.createTenant`).
- **Provider:** Half 2 (`BillingAccountService`).
- **Signature:**
  ```typescript
  async createForOrganization(
    organizationId: string,
    params: {
      accountName: string;
      billingCountry: string; // ISO-2 (e.g. 'IN', 'US')
      currency?: string;      // ISO-3 (e.g. 'INR', 'USD')
      legalEntityName?: string;
      taxId?: string;
      trialDomain?: string;
    },
    context?: { transactionClient?: PrismaClient }
  ): Promise<BillingAccountResultDto>;
  ```
- **Return DTO (`BillingAccountResultDto`):**
  ```typescript
  export interface BillingAccountResultDto {
    id: string;
    organizationId: string;
    name: string;
    billingCountry: string;
    currency: string;
    status: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED';
    trialDomain: string | null;
    createdAt: Date;
  }
  ```
- **Error Behavior:**
  - If `trialDomain` already exists on another account: Throws `ConflictException('TRIAL_DOMAIN_ALREADY_EXISTS')`.
  - If `billingCountry` is unsupported: Throws `BadRequestException('UNSUPPORTED_BILLING_COUNTRY')`.
- **Transaction Requirements:** Must support optional Prisma interactive transaction client so tenant creation and billing account creation succeed or roll back atomically.

---

### 2.2 Direct Service Contract: `TrialGrantService.grantTrial()`
- **Caller:** Half 1 (`OnboardingService`, Step 4).
- **Provider:** Half 2 (`TrialGrantService`).
- **Signature:**
  ```typescript
  async grantTrial(
    billingAccountId: string,
    corporateDomain: string,
    context?: { transactionClient?: PrismaClient }
  ): Promise<TrialGrantResultDto>;
  ```
- **Return DTO (`TrialGrantResultDto`):**
  ```typescript
  export interface TrialGrantResultDto {
    poolId: string;
    billingAccountId: string;
    creditsGranted: number; // Exactly 25
    validityDays: number;   // Exactly 30
    expiresAt: Date;        // now + 30 days
    ledgerEntryId: string;
    status: 'ACTIVE';
  }
  ```
- **Business Invariants Enforced by Half 2:**
  - Auto-grant is policy-bound: Exactly 25 credits, 30 days validity.
  - Executed by `actor = 'system'`, `grant_source = 'TRIAL'`.
  - Zero maker-checker requirement for automatic policy grant.
  - Sets `BillingAccount.trialDomain = corporateDomain` and `trialGrantedAt = clock_timestamp()`.
- **Error Behavior:**
  - Throws `ConflictException('DOMAIN_ALREADY_RECEIVED_TRIAL')` if domain is not unique.

---

### 2.3 HTTP API Contract: Tenant Billing Summary
- **Endpoint:** `GET /api/v1/platform/billing/accounts/:id/summary`
- **Caller:** Half 1 (`Tenant 360` Billing Tab & Overview cards).
- **Provider:** Half 2 (`BillingAccountController`).
- **Authentication:** `Bearer <JWT>`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Response Contract (200 OK):**
  ```json
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "Acme Corp",
    "legalEntityName": "Acme Technologies India Pvt Ltd",
    "billingCountry": "IN",
    "currency": "INR",
    "taxId": "29ABCDE1234F1Z5",
    "status": "ACTIVE",
    "overdraftLimit": 0,
    "overdraftUsed": 0,
    "hasPaidPurchase": true,
    "trialDomain": "acme.com",
    "trialGrantedAt": "2026-08-01T09:00:00Z",
    "totalAvailableCredits": 420,
    "breakdown": {
      "activeDrivePassCredits": 120,
      "talentReserveCredits": 300,
      "trialCreditsRemaining": 0
    },
    "pools": [
      {
        "id": "c1f90ae7-7425-40de-944b-7c9e66794200",
        "name": "Campus Drive Sep",
        "poolType": "DRIVE_PASS",
        "source": "PURCHASE",
        "status": "ACTIVE",
        "totalCredits": 200,
        "cachedRemaining": 120,
        "expiresAt": "2026-10-05T18:00:00Z",
        "daysRemaining": 7
      }
    ],
    "reconciliationStatus": "PASSED"
  }
  ```
- **Error Behavior:**
  - `404 Not Found`: `{ statusCode: 404, code: "BILLING_ACCOUNT_NOT_FOUND", message: "Billing account not found" }`

---

### 2.4 HTTP API Contract: Create Manual Request
- **Endpoint:** `POST /api/v1/platform/billing/requests`
- **Caller:** Half 1 (Tenant 360 "Create Billing Request" deep-link modal).
- **Provider:** Half 2 (`ManualBillingRequestController`).
- **Request Payload:**
  ```json
  {
    "billingAccountId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "kind": "GRANT",
    "ticketRef": "JIRA-4821",
    "reason": "Goodwill allocation following verified platform fault",
    "payload": {
      "credits": 25,
      "source": "GOODWILL",
      "validityDays": 90,
      "driveId": null
    }
  }
  ```
- **Response Contract (201 Created):**
  ```json
  {
    "id": "req-uuid-99",
    "billingAccountId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "kind": "GRANT",
    "ticketRef": "JIRA-4821",
    "reason": "Goodwill allocation following verified platform fault",
    "requestedById": "staff-user-1",
    "status": "PENDING",
    "createdAt": "2026-09-28T11:00:00Z"
  }
  ```

---

## 3. Half 2 $\rightarrow$ Half 1 Service & API Contracts

---

### 3.1 Security Contract: `PlatformAuthGuard` & `@Roles(...)`
- **Provider:** Half 1 (`auth/guards/platform-auth.guard.ts`).
- **Consumer:** Half 2 (Applied to all `/platform/billing/*` controllers).
- **Interface:**
  ```typescript
  @Controller('platform/billing/requests')
  @UseGuards(PlatformAuthGuard, RolesGuard)
  export class ManualBillingRequestController {
    @Post(':id/approve')
    @Roles(StaffRole.SUPER_ADMIN)
    async approve(@Req() req: AuthenticatedRequest, @Param('id') id: string) { ... }
  }
  ```
- **Guarantees Provided by Half 1:**
  - Injects `req.user: { id: string, email: string, role: StaffRole, organizationId: string | null }`.
  - Verifies that `organizationId === null` for platform operators (prevents tenant staff crossing into platform ops).
  - Enforces mandatory TOTP/MFA token verification on platform routes.

---

### 3.2 Audit Contract: `AuditService.record()`
- **Provider:** Half 1 (`common/services/audit.service.ts`).
- **Consumer:** Half 2.
- **Signature:**
  ```typescript
  async record(event: {
    actorId: string;
    actorRole: string;
    subjectType: 'ACCOUNT' | 'POOL' | 'REQUEST' | 'PRICE' | 'PAYMENT';
    subjectId: string;
    action: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
    reason?: string;
    ticketRef?: string;
    requestId?: string;
  }): Promise<void>;
  ```
- **Guarantee:** Writes append-only audit events asynchronously without blocking HTTP response times.

---

### 3.3 HTTP API Contract: Tenant Brief
- **Endpoint:** `GET /api/v1/platform/tenants/:id/brief`
- **Caller:** Half 2 (Used on Billing Accounts list to enrich accounts with Org details).
- **Provider:** Half 1 (`TenantController`).
- **Response Contract (200 OK):**
  ```json
  {
    "id": "org-uuid-1",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "lifecycleStage": "ACTIVE",
    "licenseTier": "ENTERPRISE",
    "createdAt": "2026-07-27T04:49:07Z"
  }
  ```

---

## 4. Deterministic Mock Contracts for Independent Development

To eliminate blocking dependencies, both developers can code against these deterministic mock adapters from Day 1.

```typescript
// ── Half 2 Mock Adapter for Half 1 Dev ────────────────────────────────────
@Injectable()
export class MockBillingAccountService {
  async getAccountSummary(id: string): Promise<BillingAccountSummaryDto> {
    return {
      id,
      name: "Mock Enterprise Payer",
      legalEntityName: "Mock Payer Corp Ltd",
      billingCountry: "IN",
      currency: "INR",
      taxId: "29AABCM1234F1Z1",
      status: BillingAccountStatus.ACTIVE,
      overdraftLimit: 0,
      overdraftUsed: 0,
      hasPaidPurchase: true,
      trialDomain: "mockcorp.com",
      trialGrantedAt: new Date("2026-08-01"),
      totalAvailableCredits: 250,
      breakdown: { activeDrivePassCredits: 50, talentReserveCredits: 200, trialCreditsRemaining: 0 },
      pools: [
        {
          id: "mock-pool-1",
          name: "Campus Drive Mock",
          poolType: PoolType.DRIVE_PASS,
          source: GrantSource.PURCHASE,
          status: PoolStatus.ACTIVE,
          totalCredits: 100,
          cachedRemaining: 50,
          expiresAt: new Date(Date.now() + 7 * 86400000),
          daysRemaining: 7,
        },
      ],
      reconciliationStatus: "PASSED",
    };
  }

  async createForOrganization(orgId: string, params: any): Promise<BillingAccountResultDto> {
    return {
      id: `mock-billing-acct-${orgId}`,
      organizationId: orgId,
      name: params.accountName,
      billingCountry: params.billingCountry,
      currency: params.currency || "INR",
      status: "ACTIVE",
      trialDomain: params.trialDomain || null,
      createdAt: new Date(),
    };
  }
}
```

---

## 5. End-to-End Integration Sequence

When both halves have verified their internal unit and mock tests, real integration proceeds in this strict ten-step sequence:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              TEN-STEP INTEGRATION SEQUENCE                             │
├────┬────────────────────────────┬──────────────────────────────────────────────────────┤
│ 1  │ Auth & Guard Contract      │ Half 2 adopts PlatformAuthGuard on /platform/*       │
│ 2  │ Tenant Identity            │ Half 1 creates Org; verifies public.organization     │
│ 3  │ Billing Account Creation   │ Onboarding Step 2 calls BillingAccountService        │
│ 4  │ Policy Trial Grant         │ Onboarding Step 4 calls TrialGrantService (25 credits)│
│ 5  │ Tenant 360 Summary Feed    │ Tenant 360 Billing tab reads live /summary API       │
│ 6  │ Manual Request Submission  │ Tenant 360 triggers POST /platform/billing/requests │
│ 7  │ Maker-Checker Approval     │ SUPER_ADMIN approves request in H2.4 console         │
│ 8  │ Live Ledger Verification   │ Verify credit_ledger_entry created with correct ref  │
│ 9  │ Nightly Reconciliation Run │ Replay job verifies pool integrity & zero drift      │
│ 10 │ Unified Audit Log          │ H1.6 displays combined platform + billing events     │
└────┴────────────────────────────┴──────────────────────────────────────────────────────┘
```

---

## 6. Contract Versioning & Breaking Change Policy

1. **No Silent Breaking Changes:** Field renaming, removal, or type alteration in any shared DTO in `packages/shared-types` requires an explicit bump to this contract document.
2. **Backward-Compatible Additions:** Adding optional fields is permitted without bumping major version.
3. **Mandatory CI Contract Tests:**
   - Contract test asserts that `GET /platform/billing/accounts/:id/summary` matches `BillingAccountSummaryDto` schema exactly.
   - Contract test asserts that `POST /platform/billing/requests` payload matches `CreateManualRequestDto`.
   - Candidate contract test asserts zero financial fields in candidate-facing endpoints.
