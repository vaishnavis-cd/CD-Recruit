# Artifact 02 (Half 1): Business Rules & Invariants Specification

**Document:** `docs/super-admin/design/02-half1-business-rules-and-invariants.md`  
**Classification:** Core Business Logic & Invariants Contract  
**System:** Proctora / CD-Recruit Platform Operations & Tenant Lifecycle  
**Authoritative Precedence:** `super-admin-intent.md` > `CD-Recruit_Super_Admin_Scope_and_Split.md`  
**Ownership:** Dev 1 (Half 1 Lead)

---

## 1. Core Architectural Invariants Master Matrix

| Invariant ID | Domain | Invariant Rule Summary | Primary Enforcement Layer | Consequence of Violation |
|---|---|---|---|---|
| **INV-SEC-01** | Security | **PII-Blind by Default:** Default views never expose candidate names, emails, or PII. | UI Component + Controller DTO Filter | HTTP 403 / Build CI contract test failure |
| **INV-SEC-02** | Security | **Mandatory MFA for Platform Access:** All platform routes require verified TOTP MFA token. | `PlatformAuthGuard` / `MfaGuard` | HTTP 401 Unauthorized (`MFA_REQUIRED`) |
| **INV-SEC-03** | Security | **Platform Identity Isolation:** Platform staff identity is stored in `platform.platform_staff`, completely separated from tenant `public.staff`. | Database Schema + JWT Claims | Platform session cannot access tenant token endpoints directly |
| **INV-SEC-04** | Security | **Short Idle Session Timeout:** Platform sessions terminate after 15 minutes of inactivity; max lifetime 8 hours. | Redis / Token Validation Interceptor | Session invalidated; operator forced to re-authenticate |
| **INV-TEN-01** | Tenant | **Lifecycle Stage Derivation:** Lifecycle stage is derived from verified state, not duplicated as an independently editable field. | `TenantLifecycleService` | Rejects conflicting state updates; eliminates state drift |
| **INV-TEN-02** | Tenant | **Corporate Domain Uniqueness:** Exactly one trial permitted per corporate domain (`billing_account.trial_domain`). | DB Unique Constraint + Service Check | HTTP 409 Conflict (`TRIAL_DOMAIN_ALREADY_EXISTS`) |
| **INV-TEN-03** | Tenant | **Free-Mail Domain Rejection:** Public email providers (gmail.com, yahoo.com, outlook.com, etc.) cannot be onboarded. | `DomainVerificationService` Domain Blocklist | HTTP 400 Bad Request (`FREEMAIL_DOMAIN_NOT_PERMITTED`) |
| **INV-TEN-04** | Tenant | **Tenant Suspension Boundary:** Suspending a tenant halts new drive creation and invites, but **never** interrupts active candidate sessions. | `TenantStatusGuard` in Drive/Invite APIs | Prevents candidate test disruptions during admin disputes |
| **INV-OVR-01** | Overrides | **Question Snapshot Binding Immutability:** Fixing a question on an active drive creates a new question version and rebinds *only* unstarted sessions. | `QuestionOverrideService` Transaction | Started/completed sessions preserve original question snapshot |
| **INV-OVR-02** | Overrides | **Time-Boxed Sensitivity Relaxation:** Proctoring relaxation overrides must specify an expiry $\le 72$ hours. | DB CHECK Constraint + Service Validation | HTTP 400 Bad Request (`OVERRIDE_EXPIRY_EXCEEDS_LIMIT`) |
| **INV-OVR-03** | Overrides | **Two-Actor Evidentiary Rule:** Any override mutating active drive settings requires mandatory ticket ref and dual-actor audit recording. | `OverrideActionService` + DB NOT NULL | HTTP 400 Bad Request (`TICKET_REF_REQUIRED`) |
| **INV-OVR-04** | Overrides | **Invite Bloat-Guard Ratio Cap:** Custom invite ratios (>5:1) cannot exceed 100:1 without explicit `OWNER` role approval. | `OverrideActionService` RBAC Check | HTTP 403 Forbidden (`EXCEEDS_MAX_BLOAT_RATIO`) |
| **INV-IMP-01** | Impersonation | **Strict 30-Minute Time-Box:** Impersonation tokens expire in exactly 30 minutes; no refresh token is issued. | JWT Token Generation (`expiresIn: '30m'`) | Token expires; session automatically drops |
| **INV-IMP-02** | Impersonation | **Tenant-Only Authority Barrier:** Impersonation tokens carry tenant-scoped roles and are structurally rejected by `PlatformAuthGuard`. | `PlatformAuthGuard` Claim Inspection | HTTP 403 Forbidden if impersonation token attempts platform write |
| **INV-IMP-03** | Impersonation | **Mandatory Dual-Actor Audit:** Every mutation during an impersonated session logs both `operator_staff_id` and `impersonated_tenant_user_id`. | `AuditInterceptor` / Context AsyncLocalStorage | Audit record created with dual actor IDs |
| **INV-RET-01** | Retention | **Bounded Appeal Window Override:** Tenant appeal window overrides must stay within the legal boundary $[14, 365]$ days. | DB CHECK Constraint + Service DTO Validation | HTTP 400 Bad Request (`RETENTION_DAYS_OUT_OF_BOUNDS`) |
| **INV-LIC-01** | Licensing | **Decoupled Tier Entitlements:** Feature entitlement flags are boolean toggles decoupled from credit consumption balances. | `EntitlementGuard` | Feature access gated cleanly without touching credit ledger |
| **INV-AUD-01** | Audit | **Immutable Append-Only Audit:** `platform.platform_audit_event` forbids UPDATE, DELETE, and TRUNCATE operations. | PostgreSQL Trigger (`forbid_audit_mutation`) | SQL Exception (`RAISE EXCEPTION`) |

---

## 2. Deep-Dive Business Logic Specifications

### 2.1 Tenant Lifecycle Stage Derivation Rules (INV-TEN-01)
Tenant lifecycle stage is determined deterministically using the following state evaluation hierarchy:

```
                               ┌──────────────────────────┐
                               │       ONBOARDING         │
                               │ (Wizard Incomplete/Draft)│
                               └─────────────┬────────────┘
                                             │ All 6 steps complete
                                             ▼
                               ┌──────────────────────────┐
                               │          TRIAL           │
                               │ (Trial Active & Balance>0│
                               └───────┬───────────┬──────┘
                   Paid Purchase Made  │           │ Trial Expired & 0 Balance
                                       ▼           ▼
                         ┌────────────────┐     ┌────────────────┐
                         │     ACTIVE     │     │    DORMANT     │
                         │ (Paid Customer)│     │(Trial Lapsed)  │
                         └───────┬────────┘     └────────┬───────┘
                                 │                       │
      Manual Flag (T&C Breach)   │                       │ Manual Flag / Inactivity
                                 ▼                       ▼
                         ┌────────────────┐     ┌────────────────┐
                         │   SUSPENDED    │     │    CHURNED     │
                         │(Platform Block)│     │(Archived Org)  │
                         └────────────────┘     └────────────────┘
```

#### State Derivation Logic:
```typescript
export function deriveTenantLifecycleStage(
  org: Organization,
  profile: TenantProfile,
  billingSummary?: BillingAccountSummaryDto
): TenantLifecycleStage {
  if (profile.isManuallySuspended) return TenantLifecycleStage.SUSPENDED;
  if (profile.isManuallyChurned) return TenantLifecycleStage.CHURNED;
  if (!profile.domainVerifiedAt || !profile.walkthroughCompletedAt) {
    return TenantLifecycleStage.ONBOARDING;
  }
  if (billingSummary?.hasPaidPurchase) {
    return TenantLifecycleStage.ACTIVE;
  }
  if (billingSummary?.breakdown.trialCreditsRemaining && billingSummary.breakdown.trialCreditsRemaining > 0) {
    const trialPool = billingSummary.pools.find(p => p.source === 'TRIAL' && p.status === 'ACTIVE');
    if (trialPool && new Date(trialPool.expiresAt) > new Date()) {
      return TenantLifecycleStage.TRIAL;
    }
  }
  return TenantLifecycleStage.DORMANT;
}
```

---

### 2.2 Operational Overrides & Question Snapshot Invariants (INV-OVR-01 to INV-OVR-04)

1. **Mid-Drive Question Correction Protocol:**
   - **Problem:** When an issue is discovered in a live coding or MCQ question on an active drive, mutating the question in-place destroys the evidentiary basis of already-evaluated candidates.
   - **Enforced Solution:**
     1. Mutating the question spawns a new question row (`version = previous_version + 1`).
     2. The active `Drive` question mapping is updated to point to the new version ID.
     3. An atomic SQL transaction updates the question reference **only** for session records whose status is `SCHEDULED` or `INVITED`.
     4. Sessions in `IN_PROGRESS`, `SUBMITTED`, `EVALUATED`, or `FINALIZED` retain the exact version snapshot bound at `billing_begin`.
     5. An immutable `OverrideAction` record is generated referencing the ticket ID and staff operator.

2. **Proctoring Sensitivity Relaxation:**
   - Permitted adjustments: Face detection tolerance (low/medium/high), Tab-switch grace allowance (count: 1–10), Audio threshold factor.
   - **Boundary:** Maximum duration is capped at 72 hours or the end of the active drive schedule window, whichever is shorter.
   - Automatic revert job cleanses expired overrides hourly.

3. **Emergency Overdraft Decision Clarification:**
   - Direct mutation of `BillingAccount.overdraftLimit` via an operational override is **strictly denied** (per `super-admin-intent.md` §F7).
   - Support staff must either:
     a) Trigger a 1-Click Top-up charge against a saved payment method via Half 2, or
     b) Submit a `ManualBillingRequest` (`kind: GRANT`, `source: GOODWILL`) for dual-actor Maker-Checker execution in Half 2.

---

### 2.3 Tenant Impersonation Rules (INV-IMP-01 to INV-IMP-03)

1. **Session Lifespan & Token Scoping:**
   - Impersonation session lifetime is **hardcoded to 1,800 seconds (30 minutes)**.
   - The token contains:
     ```json
     {
       "sub": "operator-staff-uuid",
       "impersonatedTenantId": "org-uuid",
       "impersonatedUserId": "tenant-admin-uuid",
       "role": "RECRUITER",
       "isImpersonation": true,
       "ticketRef": "SUPPORT-9921",
       "exp": 1759146600
     }
     ```
   - **Tenant-Only Authority:** Any request to `/api/v1/platform/*` presented with an impersonation token is immediately rejected with HTTP 403 Forbidden.

2. **Dual-Audit Context Recording:**
   - Any write operation performed during an impersonated session writes to the tenant audit trail with:
     - `actor_type: "STAFF_IMPERSONATOR"`
     - `operator_id: "operator-staff-uuid"`
     - `impersonated_user_id: "tenant-admin-uuid"`
     - `ticket_ref: "SUPPORT-9921"`
   - A concurrent `platform.platform_audit_event` entry is written to log the operator's actions.

---

### 2.4 Data Retention Overrides (INV-RET-01)

- **Formula Integrity:** The retention lifecycle worker computes candidate purge dates via:
  $$\text{Purge Date} = \text{Decision Finalized Date} + \text{Appeal Window Days}$$
- **Override Scope:** The `TenantProfile.appealWindowDaysOverride` replaces the default 30-day appeal window with a tenant-specific value.
- **Constraints:**
  - Lower bound: 14 days (ensures candidate dispute rights).
  - Upper bound: 365 days (limits biometric data custody liability).
  - Requires ticket reference and `OWNER` or `SUPPORT` role.
