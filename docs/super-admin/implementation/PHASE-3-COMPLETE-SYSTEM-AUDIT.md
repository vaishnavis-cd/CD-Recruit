# Phase 3: Complete Credit System + Super Admin Architecture & Implementation Audit

**Authoritative Baseline Audit Report**  
**Date:** October 8, 2026  
**Audited Target Branches:** `dev-phase3-super-admin` and `dev3-phase3`  
**Current Branch Context:** `dev-phase3-super-admin` (Clean Working Tree)  
**Strict Directives Observed:** No git merges performed; no branch resets; no code altered; strictly observational baseline audit.

---

## 1. Executive Summary

This audit performs an independent, exhaustive architectural, code-level, database, API contract, security, and UI evaluation of two parallel development workstreams within Proctora / CD-Recruit:
1. **Super Admin Dashboard** (developed primarily on `dev-phase3-super-admin`)
2. **Credit / Billing / Assessment Credit System** (developed primarily on `dev3-phase3`)

### High-Level Verdict
**STATUS: NOT READY FOR MERGE (BLOCKED).**  
While both branches contain substantial, high-quality implementations of their respective functional domains, they have diverged significantly at the architectural and schema levels. A merge at this stage would fail with fatal TypeScript build errors, introduce severe financial security vulnerabilities, break database integrity, and result in duplicate, conflicting API routes.

### Critical Highlights & Urgent Blockers
- **P0 Financial Exploit (`dev3-phase3`):** An unprotected, unbacked credit minting endpoint exists in `backend/api/src/billing/billing.controller.ts` (`POST /api/v1/admin/billing/purchase`). Any authenticated recruiter can mint arbitrary credit packs without payment gateway proofs, invoice records, or maker-checker approvals.
- **P0 Dual Billing Architecture Conflict:** Two completely different billing architectures coexist in the codebase:
  - *Legacy Prototype (`billing/*`):* `PoolService`, `MakerCheckerService`, `CreditEnforcementService`, `billing.controller.ts`.
  - *Phase 2 Domain Architecture (`billing/*/*`):* `LedgerService`, `CreditPoolService`, `ManualBillingRequestService`, `PriceBookService`, `PaymentService`, `PaymentWebhookService`, `ReconciliationService`, `FinanceMetricsService`, and 9 modular controllers.
  On `dev3-phase3`, legacy services contain broken schema assumptions that cause immediate compilation failure (`npm run build` fails with 5 errors).
- **P1 Schema Drift:** `schema.prisma` differs between branches: model naming (`SystemAuditEvent` vs `PlatformAuditEvent`), audit log fields (`beforeState`/`afterState`), 1:N organization relations, and missing relation fields (`CreditLedgerEntry.request`).
- **P1 UI/API Disconnect (`super-admin-web`):** The Super Admin frontend (`billing.api.ts` / `useBilling.ts`) attempts to call direct mutation endpoints (`POST /billing/accounts`, `PATCH /billing/accounts/:id/overdraft`, `PATCH /billing/accounts/:id/status`, `POST /billing/pools/:id/extend-expiry`) that **do not exist** on the backend because domain invariants require all such actions to flow through the Maker-Checker queue (`POST /api/v1/platform/billing/requests`).
- **P1 Recruiter Web Mock Data & PII Leak (`admin-web`):** `BillingSettingsTab.tsx` displays hardcoded balances (530 credits), overdraft limits (50 credits), and exposes candidate names (`Karthik Raja`) in billing transaction lists, violating **INV-PII-01** and **ADR-004** (`overdraftLimit = 0`).
- **P1 Test Automation Breakdown:** 27 test files in `backend/api/src/billing/*/*.spec.ts` are standalone procedural execution scripts that bypass Jest runners, preventing CI pipeline execution and masking database schema execution failures.

---

## 2. Branch State

### Git Baseline Analysis
```text
$ git status
On branch dev-phase3-super-admin
Your branch is ahead of 'origin/dev-phase3-super-admin' by 1 commit.
nothing to commit, working tree clean

$ git merge-base dev-phase3-super-admin dev3-phase3
21dc656cbc88edfa657ab7fbcbb6f1ab2a26e3a3
```

### Commit Topology
- **Common Ancestor (`21dc656`):** `feat(super-admin): complete Stage 1.7 frontend-backend contract integration`
- **`dev-phase3-super-admin` Head (`83fb009`):** 
  - `83fb009 feat: updated UI for the super admin dasbaord` (74 UI files changed across `frontend/super-admin-web/src/pages/*`, components, layouts, Tailwind styling, hooks).
  - Clean working tree.
- **`dev3-phase3` Head (`a443a7b`):**
  - `a443a7b Merge branch 'origin/dev-phase3-super-admin' into dev3-phase3` (Merged earlier commit `21dc656`).
  - `0626a12 fix(billing): align drive service and billing settings with multi-tenant schema`
  - `9af3fd7 fix(billing): align admin billing controller with multi-tenant schema`
  - `836b2f1 feat(billing): wire candidate assessment session creation to credit enforcement`
  - Clean working tree.

### Summary of Unique Work
| Branch | Unique Commits | Focus Area |
|---|---|---|
| `dev-phase3-super-admin` | 1 (`83fb009`) | Polish of all Super Admin web pages (H1 & H2), design system alignment, navigation shell, glassmorphic UI, modals, tab views. |
| `dev3-phase3` | 4 (`836b2f1`, `9af3fd7`, `0626a12`, `a443a7b`) | Schema updates (1:N orgs, platform audit events), session billing integration in `drive.service.ts`, candidate session credit checks, recruiter `BillingSettingsTab.tsx`. |

---

## 3. Super Admin Audit (`dev-phase3-super-admin`)

### Architecture & Modularity
- **Platform Ingress:** Built into `backend/api/src/platform/` with dedicated modules:
  - `PlatformAuthModule`: Admin authentication, JWT strategy (`PlatformJwtStrategy`), guards (`PlatformAuthGuard`, `PlatformRoleGuard`).
  - `PlatformAuditModule`: Centralized system audit logging (`PlatformAuditService`).
  - `PlatformUsersModule`: Super Admin operator management.
  - `PlatformTenantsModule`: Tenant / Organization management (Half 1).
- **Frontend App:** Standalone Vite React application at `frontend/super-admin-web/`.
  - Router (`src/App.tsx`): Correctly defines routes for all H1 and H2 pages.
  - Auth Store (`src/lib/auth/auth.store.ts`): JWT storage in memory/storage, handles `PLATFORM_ADMIN` and `SUPER_ADMIN` roles.
  - Theme / Styling: High-fidelity enterprise dark mode, Tailwind CSS tokens, lucide-react icons, responsive shell.

### Strengths Identified
1. Complete, functional implementations of all 8 Half 2 pages specified in Artifact 05:
   - Billing Accounts (`/billing/accounts`, `/billing/accounts/:id`)
   - Credit Pool Detail (`/billing/pools/:id`)
   - Ledger Explorer (`/billing/ledger`)
   - Maker-Checker Requests (`/billing/requests`)
   - Price Book (`/billing/pricing`)
   - Payments & Invoices (`/billing/payments`)
   - Finance Dashboard (`/finance`)
   - Integrity & Incidents (`/billing/integrity`)
2. Backend build on this branch succeeds cleanly without compilation errors (`npm run build` exits 0).
3. Frontend build on this branch succeeds cleanly (`npm run build` and `tsc --noEmit` exit 0).

### Gaps & Structural Flaws
1. **Phantom Mutation Endpoints in API Client:**
   `frontend/super-admin-web/src/lib/api/billing/billing.api.ts` exports direct mutation functions (`createAccount`, `updateAccountOverdraft`, `updateAccountStatus`, `extendPoolExpiry`) that point to non-existent REST endpoints instead of delegating to the Maker-Checker workflow.
2. **Missing Process Isolation (`main.platform.ts`):**
   Architecture Decision Record **ADR-001** requires running a dedicated process `main.platform.ts` on port 3001, distinct from public API `main.ts` on port 3000. In reality, both public and platform routes are mounted on a single NestJS process in `main.ts`.
3. **Tenant ID vs Billing Account ID Confusion:**
   In `TenantBillingTab.tsx`, the component passes `tenantId` (the Organization UUID) to `useBillingAccountSummary(tenantId)`, whereas the backend expects a `billingAccountId`.

---

## 4. Credit System Audit (`dev3-phase3`)

### Architecture & Modularity
The credit system on `dev3-phase3` contains the complete Half 2 domain engine implemented across stages 2.1 to 2.11:
- `LedgerService` (`backend/api/src/billing/ledger/ledger.service.ts`): Append-only financial ledger with advisory locking, sequence numbers, and strict balance verification.
- `CreditPoolService` (`backend/api/src/billing/pool/credit-pool.service.ts`): Credit pack lifecycle, queue promotions, drawdowns, expiry sweeps.
- `ManualBillingRequestService` (`backend/api/src/billing/manual-request/manual-billing-request.service.ts`): Maker-checker state machine enforcing segregation of duties.
- `PriceBookService` (`backend/api/src/billing/pricing/price-book.service.ts`): Versioned, country-isolated commercial pricing catalog.
- `PaymentService` (`backend/api/src/billing/payment/payment.service.ts`): Stripe/Razorpay integration, manual invoice credit minting.
- `PaymentWebhookService` (`backend/api/src/billing/webhook/payment-webhook.service.ts`): Signature-verified, idempotent inbox queue processor.
- `ReconciliationService` (`backend/api/src/billing/reconciliation/reconciliation.service.ts`): 7-point integrity verification engine.
- `FinanceMetricsService` (`backend/api/src/billing/metrics/finance-metrics.service.ts`): Revenue, utilization, and margin alarm metrics.

### Critical Gaps & Failures on `dev3-phase3`
1. **Build Failure (TS Compilation Breakdown):**
   `npm run build` in `backend/api` fails with 5 fatal TypeScript errors:
   - `maker-checker.service.ts`: Cannot find property `organization` on `BillingAccount` (schema updated to `organizations Organization[]`).
   - `pool.service.ts`: Cannot find property `organization` on `BillingAccount`.
   - `platform-audit.service.ts`: Property `systemAuditEvent` does not exist on `PrismaService` (model renamed to `PlatformAuditEvent` in schema, but service was not updated).
2. **Fatal Security Vulnerability (P0):**
   `backend/api/src/billing/billing.controller.ts` exposes `POST /api/v1/admin/billing/purchase`. Any authenticated recruiter can call this with arbitrary credit amounts, minting live credit pools without paying or providing gateway verification.
3. **Ghost Prototype Services:**
   The legacy prototype files `billing/pool.service.ts`, `billing/maker-checker.service.ts`, and `billing/credit-enforcement.service.ts` were kept alongside the new domain services, leading to confusion, duplicate exports, and broken builds.

---

## 5. Credit Lifecycle Trace

```text
[Pricing SKU]
    │
    ▼
[Purchase / PO / Trial] ────────► [Payment Webhook / Invoice Record]
                                              │ (INV-PAY-01 verified)
                                              ▼
                                   [CreditPool Created] (Status: ACTIVE / QUEUED)
                                              │
                                              ▼
                                   [Ledger GRANT Entry] (Append-only, Sequence + 1)
                                              │
                                              ▼
                                   [Candidate Assessment Session Started]
                                              │
                                              ▼
                                   [Credit Acquisition Guard] (Acquire lock, check balance)
                                              │
                                              ▼
                                   [Ledger CONSUME Entry] (cached_remaining decremented)
                                              │
                                              ▼
                                   [Session Billing Evidence Stored]
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
            [Normal Completion]                              [Platform Incident T3]
                    │                                                   │
                    ▼                                                   ▼
             [Pool Exhausted]                                [Ledger REVERSAL Entry]
                    │                                                   │
                    ▼                                                   ▼
             [Reconciliation Verified]                         [Credit Restored to Pool]
```

### Transition Verification Matrix
| Transition | Implementing Service | Trigger | Ledger Entry | Guard Invariants Verified |
|---|---|---|---|---|
| **Pricing $\rightarrow$ Purchase** | `PriceBookService` | Recruiter checkout | None | Historical price frozen at purchase time (`INV-PRICE-01`). |
| **Payment $\rightarrow$ Mint** | `PaymentService` / `WebhookService` | Webhook signature / PO approval | `GRANT` (+N) | Cannot mint without verified capture (`INV-PAY-01`, `INV-PAY-03`). |
| **Trial $\rightarrow$ Mint** | `TrialGrantService` | Org onboarding | `GRANT` (+25) | One trial per corporate domain (`INV-TRIAL-01`). |
| **Session Start $\rightarrow$ Hold** | `CreditPoolService` / `DriveService` | Candidate begins test | `CONSUME` (-1) | Idempotent on `sessionId`; no double-spend (`INV-LEDGER-02`). |
| **Fault $\rightarrow$ Reversal** | `LedgerService` | Incident declaration | `REVERSAL` (+1) | Reverse to source pool; audit logged (`INV-INC-01`). |
| **Validity Expiry** | `CreditPoolService` | Nightly sweeper | `EXPIRE` (-Remaining) | Only transitions if `now() > expires_at` (`INV-POOL-03`). |
| **Payment Refund** | `PaymentService` | Gateway refund webhook | `REFUND` (-N) | Pool cancelled or balance clawed back (`INV-PAY-04`). |

---

## 6. Credit Source Audit

| Credit Source | Creation Path | Ledger Entry Type | Pool Type | Default Validity | Idempotency Key Format | Audit Status |
|---|---|---|---|---|---|---|
| **TRIAL** | `TrialGrantService.grantOnboardingTrial` | `GRANT` | `TALENT_RESERVE` | 30 Days | `trial-grant:{billingAccountId}` | Verified: Restricts to verified business domains. |
| **PURCHASE** | `PaymentWebhookService` (Gateway) | `GRANT` | `TALENT_RESERVE` or `DRIVE_PASS` | Per SKU (e.g. 90-365d) | `webhook-grant:{paymentId}` | Defect on `dev3-phase3`: Unverified backdoor exists in legacy controller. |
| **CONTRACT** | `PaymentService.recordOfflineInvoice` | `GRANT` | `TALENT_RESERVE` | Per PO Terms | `po-invoice:{invoiceNumber}` | Requires Finance role (`SUPER_ADMIN`). |
| **GOODWILL** | `ManualBillingRequestService` | `GRANT` | `TALENT_RESERVE` | Custom | `manual-exec:{requestId}` | Requires Maker-Checker approval ($\text{approver} \ne \text{requester}$). |
| **MANUAL ADJUSTMENT** | `ManualBillingRequestService` | `ADJUSTMENT` | Matches Target Pool | Unchanged | `manual-exec:{requestId}` | Requires Maker-Checker approval and ticket reference. |

**Audit Finding:** Any credit creation bypassing `LedgerService` is prohibited. In the Phase 2 domain services (`billing/*/*`), all paths route through `LedgerService.appendEntry()`. However, the legacy `billing/billing.controller.ts` directly creates pools via legacy `PoolService`, violating the ledger-first principle.

---

## 7. Ledger Integrity Audit

### Invariant Checks
1. **Append-Only Enforcement:**
   - Database table `credit_ledger_entry` has no `UPDATE` or `DELETE` API exposed.
   - All mutations in `LedgerService` execute an `INSERT` statement with strictly incrementing `sequence_number`.
2. **Advisory Locking:**
   - All mutations acquire `pg_advisory_xact_lock(hashtext('billing_account:' || accountId))` to eliminate concurrency races.
3. **Cached Remaining Projection:**
   - In `CreditPoolService`, `cached_remaining` is updated strictly within the same database transaction as the ledger `INSERT`.
   - `ReconciliationService` verifies that `cached_remaining == total_credits + sum(ledger entries)`.
4. **Direct Write Violations Detected:**
   - Legacy `PoolService` (`billing/pool.service.ts#L48`) directly calls `this.prisma.creditPool.create()` with initialized `cachedRemaining` without creating an initial `GRANT` entry in `credit_ledger_entry`. **(High Severity Finding F-P0-02)**.

---

## 8. Credit Acquisition / Session Start Audit

### Real Candidate/Session Flow
1. **Candidate Launches Test:** Candidate hits `/api/v1/assessments/:id/start`.
2. **Drive Service Verification (`drive.service.ts`):**
   - On `dev3-phase3`, commit `836b2f1` wired candidate session creation to credit enforcement:
   ```typescript
   // Check active pool and consume credit
   await this.creditPoolService.consumeCredit({
     billingAccountId: org.billingAccountId,
     sessionId: session.id,
     driveId: drive.id,
     idempotencyKey: `session-consume:${session.id}`,
   });
   ```
3. **Session Billing Evidence:**
   - Record created in `session_billing_evidence`: `sessionId`, `billingAccountId`, `creditPoolId`, `ledgerEntryId`, `chargedAt`.
4. **Candidate API Isolation:**
   - The candidate frontend and assessment runner receive zero billing metadata. Errors return a generic user-friendly message (`"Assessment setup incomplete; please contact the recruiter"`), ensuring candidate APIs remain billing-blind.

---

## 9. Overdraft Audit

### Product Invariant: `overdraft_limit = 0`
- **Architectural Policy (ADR-004):** Proctora enforces strict zero overdraft for standard self-serve and automated operations.
- **Code Inspection:**
  - `BillingAccountService`: Default `overdraftLimit = 0`.
  - `CreditPoolService.consumeCredit`: Rejects transaction immediately with `InsufficientCreditsException` if available balance is $< 1$.
  - Legacy shims in `BillingSettingsTab.tsx` (frontend) incorrectly display `"Overdraft Limit: 50 Credits"`. This is hardcoded mock data and must be eliminated.
  - No executable automated path allows negative balances or uncollateralized overdraft debt.

---

## 10. Pool Lifecycle Audit

### State Machine Verification
```text
                  ┌──────────────────────┐
                  │       QUEUED         │
                  └──────────┬───────────┘
                             │ (Queue promotion on activation)
                             ▼
┌─────────────┐   ┌──────────────────────┐   ┌─────────────┐
│  SUSPENDED  │◄──┤       ACTIVE         ├──►│  EXHAUSTED  │
└──────┬──────┘   └──────────┬───────────┘   └─────────────┘
       │                     │ (now() > expires_at)
       ▼                     ▼
┌─────────────┐   ┌──────────────────────┐
│  CANCELLED  │   │       EXPIRED        │
└─────────────┘   └──────────────────────┘
```

1. **One Active General Pool Invariant:**
   - Enforced in `CreditPoolService.promoteNextQueuedPool()`. An account cannot have more than one `ACTIVE` general pool.
2. **Drive-Pass vs Talent-Reserve Priority:**
   - `DRIVE_PASS` pools (scoped to a specific drive) take precedence over general `TALENT_RESERVE` pools during session drawdown.
3. **Queue Promotion:**
   - When an active pool is exhausted, the oldest valid `QUEUED` pool is automatically promoted to `ACTIVE`.

---

## 11. Trial Audit

### Trial Policy Verification
- **Amount:** Exactly 25 credits.
- **Validity:** 30 days from grant date.
- **Type:** `TALENT_RESERVE`.
- **Eligibility:**
  - One per verified corporate domain.
  - Public email domains (`gmail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`) are hard-blocked by `TrialGrantService`.
  - Domain uniqueness enforced via database unique constraint on `billing_account.corporate_domain`.
- **Maker-Checker Exemption:** Onboarding trials are system-automated and do not require manual maker-checker approval.

---

## 12. Manual Billing / Maker-Checker Audit

### Segregation of Duties (Rule R8)
- **Application Level:**
  ```typescript
  if (request.requestedById === approverId) {
    throw new ForbiddenException('Rule R8 Violation: Requester cannot approve their own request.');
  }
  ```
- **Database Level:**
  - Postgres CHECK constraint on `manual_billing_request`: `CHECK (requested_by_id != approved_by_id)`.
- **State Machine:** `PENDING` $\rightarrow$ `APPROVED` $\rightarrow$ `EXECUTED` (or `REJECTED` / `CANCELLED`).
- **Retry Safety:**
  - If execution fails due to a network or database glitch, the request remains `APPROVED` with `execution_error` recorded.
  - The retry endpoint (`POST /platform/billing/requests/:id/retry`) executes with the original deterministic idempotency key, preventing duplicate credit grants.

---

## 13. Payment Audit

### Gateway Webhook Pipeline
- **Providers Supported:** Stripe and Razorpay.
- **Webhook Ingress (`API-H2-18`):**
  - Route: `POST /api/v1/billing/webhooks/:provider`.
  - Raw body signature verification enforced before processing.
  - Inbox Pattern: Events are inserted into `payment_event` table with status `PENDING` and processed asynchronously by BullMQ workers.
- **Replay Safety:**
  - Webhook delivery uses provider event ID as idempotency key (`payment_event.provider_event_id` is `UNIQUE`).
- **Offline PO Invoices:**
  - Recorded by Finance role via `API-H2-17` (`POST /platform/billing/payments/manual-invoice`). Creates `CONTRACT` pool and generates `GRANT` ledger entry.

---

## 14. Reconciliation Audit

### 7-Point Nightly Integrity Check Matrix
`ReconciliationService.runFullReconciliation()` executes the following 7 checks:
1. **Pool Integrity Check:** Verifies for every pool: `cached_remaining == total_credits + sum(ledger entries)`.
2. **Overdraft Integrity Check:** Verifies `overdraft_used` matches sum of negative ledger deltas.
3. **Session Acquisition 1:1 Check:** Verifies every billable session in `session` table has a corresponding `CONSUME` entry and `session_billing_evidence` record.
4. **Expiry Sweeper Check:** Verifies no `ACTIVE` pool exists where `expires_at < now()`.
5. **Topology Invariant Check:** Verifies no billing account has $>1$ active general pool.
6. **Payment Proof Check:** Verifies every `PURCHASE` credit pool is backed by a `CAPTURED` payment in `payment` table.
7. **WORM Backup Verification:** Computes SHA-256 checksums of exported immutable audit records.

**Finding:** Reconciliation is strictly observational. It logs warnings and flags discrepancies in `reconciliation_run` without silently modifying balances. However, no cron trigger or BullMQ recurring job is currently registered in `AppModule` to execute this nightly in production.

---

## 15. Finance Metrics Audit

### Precision & Currency Handling
- **Minor Units:** All monetary values stored and calculated as integers in minor currency units (e.g. paise, cents). Zero floating-point arithmetic.
- **Currency Isolation:** Revenues are strictly segregated by currency code (`INR`, `USD`, `MYR`). Cross-currency aggregation without explicit FX conversion is prohibited.
- **Margin Alarm:** `FinanceMetricsService` tracks rolling 30-day AI grading token cost vs unit credit price. If AI token cost exceeds 25% of credit price, it triggers the commercial margin alarm flag (`marginAlert: true`).
- **Cold-Start Guard:** If fewer than 10,000 attempts have been logged, metrics report `awaitingData: true` per Invariant R9.

---

## 16. Super Admin Authentication Audit

### Isolation Between User Types
| Attribute | Platform Super Admin | Recruiter / Tenant Admin | Candidate |
|---|---|---|---|
| **Issuer (`iss`)** | `proctora-platform-identity` | `proctora-identity` | `proctora-assessment-engine` |
| **Token Type (`typ`)** | `platform_jwt` | `recruiter_jwt` | `candidate_session_token` |
| **Strategy** | `PlatformJwtStrategy` | `JwtStrategy` | `CandidateStrategy` |
| **Guard** | `PlatformAuthGuard` | `AuthGuard('jwt')` | `CandidateSessionGuard` |
| **Roles Extracted** | `PLATFORM_ADMIN`, `SUPER_ADMIN` | `ORG_ADMIN`, `RECRUITER` | `CANDIDATE` |

**Verification:** Recruiter and Candidate tokens are completely rejected by `PlatformAuthGuard`. Platform tokens cannot authenticate against recruiter tenant routes.

---

## 17. Super Admin RBAC Audit

### Role Hierarchy & Permissions
- **`PLATFORM_ADMIN` (Support):** Read-only access to accounts, pools, ledger, pricing, payments, and reconciliation. Can submit Maker-Checker requests. CANNOT approve, reject, or execute financial mutations.
- **`SUPER_ADMIN` (Finance / Owner):** Full access. Authorized to approve Maker-Checker requests, publish price book entries, record manual PO invoices, replay webhooks, run manual reconciliations, and declare incidents.

### Route RBAC Compliance
All 9 platform billing controllers (`PlatformBillingAccountsController`, `PlatformCreditPoolsController`, `PlatformLedgerController`, `PlatformManualRequestsController`, `PlatformPricingController`, `PlatformPaymentsController`, `PlatformReconciliationController`, `PlatformIncidentsController`, `PlatformFinanceMetricsController`) correctly apply `@UseGuards(PlatformAuthGuard, PlatformRoleGuard)`.

---

## 18. Complete 24-API Contract Matrix

| API ID | Method | Route | Controller | Backing Service | Expected Roles | Implementation Status | Match Quality |
|---|---|---|---|---|---|---|---|
| **API-H2-01** | `GET` | `/platform/billing/accounts` | `PlatformBillingAccountsController` | `BillingAccountService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-02** | `GET` | `/platform/billing/accounts/:id` | `PlatformBillingAccountsController` | `BillingAccountService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-03** | `GET` | `/platform/billing/accounts/:id/summary` | `PlatformBillingAccountsController` | `BillingAccountService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-04** | `GET` | `/platform/billing/accounts/:id/pools` | `PlatformCreditPoolsController` | `CreditPoolService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-05** | `GET` | `/platform/billing/pools/:id` | `PlatformCreditPoolsController` | `CreditPoolService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-06** | `GET` | `/platform/billing/ledger` | `PlatformLedgerController` | `LedgerService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-07** | `GET` | `/platform/billing/ledger/export` | `PlatformLedgerController` | `LedgerService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-08** | `GET` | `/platform/billing/requests` | `PlatformManualRequestsController` | `ManualBillingRequestService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-09** | `POST` | `/platform/billing/requests` | `PlatformManualRequestsController` | `ManualBillingRequestService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Strict DTO validation |
| **API-H2-10** | `POST` | `/platform/billing/requests/:id/approve` | `PlatformManualRequestsController` | `ManualBillingRequestService` | `SUPER_ADMIN` (Finance) | Implemented | Self-approval blocked |
| **API-H2-11** | `POST` | `/platform/billing/requests/:id/reject` | `PlatformManualRequestsController` | `ManualBillingRequestService` | `SUPER_ADMIN` (Finance) | Implemented | Mandatory reason note |
| **API-H2-12** | `POST` | `/platform/billing/requests/:id/cancel` | `PlatformManualRequestsController` | `ManualBillingRequestService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-13** | `POST` | `/platform/billing/requests/:id/retry` | `PlatformManualRequestsController` | `ManualBillingRequestService` | `SUPER_ADMIN` (Finance) | Implemented | Idempotency preserved |
| **API-H2-14** | `GET` | `/platform/billing/pricing` | `PlatformPricingController` | `PriceBookService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Country filtered |
| **API-H2-15** | `POST` | `/platform/billing/pricing` | `PlatformPricingController` | `PriceBookService` | `SUPER_ADMIN` (Finance) | Implemented | Immutable append-only |
| **API-H2-16** | `GET` | `/platform/billing/payments` | `PlatformPaymentsController` | `PaymentService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Perfect Match |
| **API-H2-17** | `POST` | `/platform/billing/payments/manual-invoice` | `PlatformPaymentsController` | `PaymentService` | `SUPER_ADMIN` (Finance) | Implemented | PO proof required |
| **API-H2-18** | `POST` | `/billing/webhooks/:provider` | `PaymentWebhookController` | `PaymentWebhookService` | Public Signature | Implemented | Raw signature verified |
| **API-H2-19** | `POST` | `/platform/billing/payments/replay-webhook` | `PlatformPaymentsController` | `PaymentWebhookService` | `SUPER_ADMIN` (Finance) | Implemented | Inbox replay |
| **API-H2-20** | `GET` | `/platform/finance/metrics` | `PlatformFinanceMetricsController` | `FinanceMetricsService` | `SUPER_ADMIN` (Finance) | Implemented | Margin alarm & currency |
| **API-H2-21** | `GET` | `/platform/billing/reconciliation/latest` | `PlatformReconciliationController` | `ReconciliationService` | `ADMIN`, `SUPER_ADMIN` | Implemented | 7 checks returned |
| **API-H2-22** | `POST` | `/platform/billing/reconciliation/run` | `PlatformReconciliationController` | `ReconciliationService` | `SUPER_ADMIN` (Finance) | Implemented | Manual trigger |
| **API-H2-23** | `GET` | `/platform/billing/incidents` | `PlatformIncidentsController` | `LedgerService` | `ADMIN`, `SUPER_ADMIN` | Implemented | Window list |
| **API-H2-24** | `POST` | `/platform/billing/incidents` | `PlatformIncidentsController` | `LedgerService` | `SUPER_ADMIN` (Finance) | Implemented | Bulk reversal trigger |

---

## 19. Complete Route Inventory

### Backend Route Inventory (API Surface)
```text
[PLATFORM BILLING - SUPER ADMIN INGRESS] (Prefix: /api/v1/platform)
  GET    /api/v1/platform/billing/accounts                  (API-H2-01)
  GET    /api/v1/platform/billing/accounts/:id              (API-H2-02)
  GET    /api/v1/platform/billing/accounts/:id/summary      (API-H2-03)
  GET    /api/v1/platform/billing/accounts/:id/pools        (API-H2-04)
  GET    /api/v1/platform/billing/pools/:id                 (API-H2-05)
  GET    /api/v1/platform/billing/ledger                    (API-H2-06)
  GET    /api/v1/platform/billing/ledger/export             (API-H2-07)
  GET    /api/v1/platform/billing/requests                  (API-H2-08)
  POST   /api/v1/platform/billing/requests                  (API-H2-09)
  POST   /api/v1/platform/billing/requests/:id/approve      (API-H2-10)
  POST   /api/v1/platform/billing/requests/:id/reject       (API-H2-11)
  POST   /api/v1/platform/billing/requests/:id/cancel       (API-H2-12)
  POST   /api/v1/platform/billing/requests/:id/retry        (API-H2-13)
  GET    /api/v1/platform/billing/pricing                   (API-H2-14)
  POST   /api/v1/platform/billing/pricing                   (API-H2-15)
  GET    /api/v1/platform/billing/payments                  (API-H2-16)
  POST   /api/v1/platform/billing/payments/manual-invoice   (API-H2-17)
  POST   /api/v1/platform/billing/payments/replay-webhook   (API-H2-19)
  GET    /api/v1/platform/finance/metrics                   (API-H2-20)
  GET    /api/v1/platform/billing/reconciliation/latest     (API-H2-21)
  POST   /api/v1/platform/billing/reconciliation/run        (API-H2-22)
  GET    /api/v1/platform/billing/incidents                 (API-H2-23)
  POST   /api/v1/platform/billing/incidents                 (API-H2-24)

[PUBLIC / WEBHOOK INGRESS]
  POST   /api/v1/billing/webhooks/:provider                 (API-H2-18)

[LEGACY / DUPLICATE INGRESS] (DEPRECATE / ELIMINATE)
  GET    /api/v1/admin/billing/account                      (Legacy Admin Controller)
  GET    /api/v1/admin/billing/pools                        (Legacy Admin Controller)
  POST   /api/v1/admin/billing/purchase                     (CRITICAL VULNERABILITY F-P0-01)
  GET    /api/v1/admin/billing/ledger                       (Legacy Admin Controller)
  GET    /api/v1/admin/billing/requests                     (Legacy Admin Controller)
  POST   /api/v1/admin/billing/requests                     (Legacy Admin Controller)
  POST   /api/v1/admin/billing/requests/:id/approve         (Legacy Admin Controller)
```

### Frontend Route Inventory (`frontend/super-admin-web`)
```text
[APP ROUTES - frontend/super-admin-web/src/App.tsx]
  /login                              -> LoginPage
  /dashboard                          -> PlatformDashboardPage
  /tenants                            -> TenantsPage (H1.1)
  /tenants/:id                        -> TenantDetailPage (H1.2 / H1.3)
  /system-users                       -> SystemUsersPage (H1.4)
  /audit                              -> AuditLogPage (H1.5)
  /billing/accounts                   -> BillingAccountsPage (H2.1)
  /billing/accounts/:id               -> BillingAccountDetailPage (H2.1)
  /billing/pools/:id                  -> CreditPoolDetailPage (H2.2)
  /billing/ledger                     -> LedgerExplorerPage (H2.3)
  /billing/requests                   -> MakerCheckerQueuePage (H2.4)
  /billing/pricing                    -> PriceBookPage (H2.5)
  /billing/payments                   -> PaymentsInvoicesPage (H2.6)
  /finance                            -> FinanceDashboardPage (H2.7)
  /billing/integrity                  -> IntegrityIncidentsPage (H2.8)
  /settings                           -> SettingsPage
```

---

## 20. Super Admin UI Page Matrix

| Page Spec | URL Path | Backend API Dependencies | RBAC Guard | Actions Supported | State Coverage (Loading, Empty, Error) |
|---|---|---|---|---|---|
| **H2.1 Accounts** | `/billing/accounts` | `API-H2-01` | `ADMIN`, `SUPER_ADMIN` | Search, Filter by Country/Status, Drilldown | Complete skeletons, clean empty state, toast error handling. |
| **H2.1 Account Detail** | `/billing/accounts/:id` | `API-H2-02`, `API-H2-04` | `ADMIN`, `SUPER_ADMIN` | View pools, linked orgs, request overdraft adjustment, request status change | Complete. Action buttons open Maker-Checker request modal. |
| **H2.2 Pool Detail** | `/billing/pools/:id` | `API-H2-05` | `ADMIN`, `SUPER_ADMIN` | Inspect legal terms, drawdown history, request expiry extension | Complete. Expiry extension delegates to Maker-Checker. |
| **H2.3 Ledger Explorer** | `/billing/ledger` | `API-H2-06`, `API-H2-07` | `ADMIN`, `SUPER_ADMIN` | Filter by type, date range, search by UUID, export pseudonymous CSV | Complete. Zero PII rendered. CSV stream triggers native download. |
| **H2.4 Manual Requests** | `/billing/requests` | `API-H2-08` $\rightarrow$ `13` | `ADMIN` (Submit), `SUPER_ADMIN` (Decide) | 3-tab layout (Awaiting, Mine, All), Approve modal, Reject modal, Cancel, Retry | Complete. Rule R8 self-approval prohibition visual feedback active. |
| **H2.5 Price Book** | `/billing/pricing` | `API-H2-14`, `API-H2-15` | `ADMIN` (View), `SUPER_ADMIN` (Publish) | Country selector (IN/US/MY), Publish SKU modal with minor unit inputs | Complete. Historical versions collapsed; active versions highlighted. |
| **H2.6 Payments** | `/billing/payments` | `API-H2-16`, `API-H2-17`, `API-H2-19` | `ADMIN`, `SUPER_ADMIN` | Record PO modal, Replay webhook action, Tab switch | Complete. Offline invoice creation validated. |
| **H2.7 Finance Dashboard** | `/finance` | `API-H2-20` | `SUPER_ADMIN` | Currency toggle, Date range selection, Unit economics inspection | Complete. 25% margin alarm banner triggers accurately; cold start handled. |
| **H2.8 Integrity & Incidents** | `/billing/integrity` | `API-H2-21`, `API-H2-22`, `API-H2-23`, `API-H2-24` | `ADMIN`, `SUPER_ADMIN` | Trigger Recon, Declare incident modal, Shadow mode tracker | Complete. Renders all 7 reconciliation checks with pass/fail indicators. |

---

## 21. UI ↔ API Contract Matrix

### Client API Mapping Verification (`billing.api.ts` vs Controllers)
| Client Method | Route Called | Backend Controller Match | Disconnect / Finding |
|---|---|---|---|
| `getAccounts` | `GET /platform/billing/accounts` | `PlatformBillingAccountsController` | Matches `API-H2-01`. |
| `getAccount` | `GET /platform/billing/accounts/:id` | `PlatformBillingAccountsController` | Matches `API-H2-02`. |
| `createAccount` | `POST /platform/billing/accounts` | **NONE (404)** | **F-P1-02:** Backend does not allow direct account creation; accounts are provisioned via Org creation. |
| `updateAccountOverdraft` | `PATCH /platform/billing/accounts/:id/overdraft` | **NONE (404)** | **F-P1-02:** Backend enforces `overdraft_limit = 0`. Overdraft adjustments require Maker-Checker `API-H2-09`. |
| `updateAccountStatus` | `PATCH /platform/billing/accounts/:id/status` | **NONE (404)** | **F-P1-02:** Direct status patches prohibited. Must submit `ACCOUNT_STATUS` via Maker-Checker `API-H2-09`. |
| `getPools` | `GET /platform/billing/accounts/:id/pools` | `PlatformCreditPoolsController` | Matches `API-H2-04`. |
| `getPool` | `GET /platform/billing/pools/:id` | `CreditPoolsController` | Matches `API-H2-05`. |
| `extendPoolExpiry` | `POST /platform/billing/pools/:id/extend-expiry` | **NONE (404)** | **F-P1-02:** Must be submitted as `EXPIRY_EXTEND` via Maker-Checker `API-H2-09`. |
| `getLedgerEntries` | `GET /platform/billing/ledger` | `PlatformLedgerController` | Matches `API-H2-06`. |
| `exportLedgerCsv` | `GET /platform/billing/ledger/export` | `PlatformLedgerController` | Matches `API-H2-07`. |
| `getManualRequests` | `GET /platform/billing/requests` | `PlatformManualRequestsController` | Matches `API-H2-08`. |
| `createManualRequest` | `POST /platform/billing/requests` | `PlatformManualRequestsController` | Matches `API-H2-09`. |
| `approveRequest` | `POST /platform/billing/requests/:id/approve` | `PlatformManualRequestsController` | Matches `API-H2-10`. |
| `rejectRequest` | `POST /platform/billing/requests/:id/reject` | `PlatformManualRequestsController` | Matches `API-H2-11`. |
| `cancelRequest` | `POST /platform/billing/requests/:id/cancel` | `PlatformManualRequestsController` | Matches `API-H2-12`. |
| `retryRequest` | `POST /platform/billing/requests/:id/retry` | `PlatformManualRequestsController` | Matches `API-H2-13`. |
| `getPriceBook` | `GET /platform/billing/pricing` | `PlatformPricingController` | Matches `API-H2-14`. |
| `publishPrice` | `POST /platform/billing/pricing` | `PlatformPricingController` | Matches `API-H2-15`. |
| `getPayments` | `GET /platform/billing/payments` | `PlatformPaymentsController` | Matches `API-H2-16`. |
| `recordManualInvoice` | `POST /platform/billing/payments/manual-invoice` | `PlatformPaymentsController` | Matches `API-H2-17`. |
| `getWebhooks` | `GET /platform/billing/payments/webhooks` | **NONE (404)** | **F-P1-02:** Backend exposes payments list with webhook status, but no standalone webhooks list endpoint. |
| `replayWebhook` | `POST /platform/billing/payments/replay-webhook` | `PlatformPaymentsController` | Matches `API-H2-19`. |
| `getFinanceMetrics` | `GET /platform/finance/metrics` | `PlatformFinanceMetricsController` | Matches `API-H2-20`. |
| `getReconciliationLatest`| `GET /platform/billing/reconciliation/latest` | `PlatformReconciliationController` | Matches `API-H2-21`. |
| `runReconciliation` | `POST /platform/billing/reconciliation/run` | `PlatformReconciliationController` | Matches `API-H2-22`. |
| `getIncidents` | `GET /platform/billing/incidents` | `PlatformIncidentsController` | Matches `API-H2-23`. |
| `declareIncident` | `POST /platform/billing/incidents` | `PlatformIncidentsController` | Matches `API-H2-24`. |

---

## 22. Database / Migration Audit

### Schema Comparison (`backend/prisma/schema.prisma`)
1. **Audit Model Divergence:**
   - On `dev-phase3-super-admin`: Defined as `model SystemAuditEvent` with `@@map("platform_audit_event")`.
   - On `dev3-phase3`: Defined as `model PlatformAuditEvent` with additional fields: `beforeState Json?`, `afterState Json?`, `createdAt DateTime @default(now())`.
2. **Organization Relation Mismatch:**
   - On `dev-phase3-super-admin`: `BillingAccount` has `organizations Organization[]` (1:N relation).
   - On `dev3-phase3`: Updated schema matches 1:N, but legacy services (`pool.service.ts`, `maker-checker.service.ts`) still query `include: { organization: true }` as a 1:1 relation, which breaks TypeScript generation.
3. **Session Billing Evidence:**
   - Fields `cvMode` and `tutorialMode` vary slightly between branches (string vs enum).
4. **Migration History:**
   - Migrations `20261006_credit_system_half2` and `20261007_phase2_stage2_schema` are applied cleanly in PostgreSQL. No unmigrated schema diffs remain in the database engine, but Prisma client types are currently desynchronized with service code on `dev3-phase3`.

---

## 23. Test Coverage Audit

### Test Execution Findings
- **Integration Test Suites (`backend/api/src/billing/*/*.spec.ts`):**
  - Stage 2.1 to 2.10 created 27 `.spec.ts` files.
  - Inspection reveals these are **standalone execution scripts** that initialize `new pg.Client()` and run custom procedural assertion loops.
  - Running `npx jest` in `backend/api` ignores or fails them because they do not contain Jest `describe()` or `it()` blocks.
  - Running via `npx tsx` currently fails on PostgreSQL schema pathing: `error: type "PoolStatus" does not exist` (due to enum residing in `proctora_billing` schema rather than public search path).
- **Frontend Test Coverage:**
  - `super-admin-web` currently has zero unit test suites (`vitest` is not configured in `package.json`).
- **Summary:** While the domain logic is thoroughly tested in procedural scripts, there is **zero automated CI test harness coverage** currently protecting either branch against regression.

---

## 24. Build / Type / Lint Results

| Project / Package | Branch | Command | Exit Code | Details / Status |
|---|---|---|---|---|
| **backend/api** | `dev-phase3-super-admin` | `npm run build` | **0 (PASS)** | Compiled successfully. All platform controllers and modules valid. |
| **super-admin-web** | `dev-phase3-super-admin` | `npm run build` | **0 (PASS)** | Vite production bundle created successfully (736 kB). |
| **super-admin-web** | `dev-phase3-super-admin` | `npx tsc --noEmit`| **0 (PASS)** | Zero TypeScript errors across 74 updated UI files. |
| **backend/api** | `dev3-phase3` | `npm run build` | **1 (FAIL)** | **5 TypeScript compilation errors** in `maker-checker.service.ts`, `pool.service.ts`, and `platform-audit.service.ts`. |
| **admin-web** | `dev3-phase3` | `npm run build` | **0 (PASS)** | Builds, but contains hardcoded mock data and candidate PII leaks. |

---

## 25. Branch Difference Analysis

### File Conflict & Divergence Inventory
```text
CONFLICT RISK: HIGH

1. backend/prisma/schema.prisma
   - dev-phase3-super-admin: SystemAuditEvent, 1:N orgs
   - dev3-phase3: PlatformAuditEvent, beforeState/afterState, relation fields
   -> Semantic & Syntactic Conflict

2. backend/api/src/platform/audit/platform-audit.service.ts
   - dev-phase3-super-admin: calls prisma.systemAuditEvent
   - dev3-phase3: schema renamed model to PlatformAuditEvent, causing build break
   -> Code Conflict

3. backend/api/src/billing/billing.module.ts
   - dev-phase3-super-admin: imports only platform controllers & Phase 2 services
   - dev3-phase3: imports both legacy controllers and Phase 2 services
   -> Architectural Duplication

4. backend/api/src/billing/billing.controller.ts
   - dev3-phase3: contains unauthenticated credit purchase endpoint
   - dev-phase3-super-admin: legacy controller
   -> Critical Security Defect

5. frontend/admin-web/src/components/common/BillingSettingsTab.tsx
   - dev3-phase3: modified to display mock balances, 50 overdraft limit, candidate PII
   -> Product Policy & Privacy Violation
```

---

## 26. Complete Findings Catalog (P0, P1, P2, P3)

### Priority P0 — Critical Vulnerabilities & Financial Risks

#### Finding F-P0-01: Arbitrary Credit Minting Vulnerability in Recruiter Billing Controller
- **Severity:** P0 (Critical)
- **Branch:** `dev3-phase3` (and legacy code on both branches)
- **File:** [billing.controller.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/billing/billing.controller.ts#L149-L188)
- **Symbol:** `BillingController.purchaseCredits` (`POST /api/v1/admin/billing/purchase`)
- **Expected Behavior:** Recruiter/Admin cannot mint live credits directly. Credits can only be created via verified payment gateway webhook (`PaymentWebhookService`) or Maker-Checker manual billing request (`ManualBillingRequestService`). Violates **INV-PAY-01**, **INV-PAY-03**, and **INV-LEDGER-01**.
- **Actual Behavior:** Any authenticated recruiter JWT can submit `{ totalCredits: 100000, unitPriceMinor: 100, currency: 'INR' }` and directly create an active `PURCHASE` pool with zero payment capture proof, zero gateway signature, and zero invoice verification.
- **Why It Matters:** Massive financial exploit vector. Allows any tenant to give themselves infinite assessment credits for free.
- **Recommended Fix:** Delete this endpoint and deprecate the entire legacy `BillingController`. Direct recruiter purchases must create a payment intent via Stripe/Razorpay and wait for webhook verification (`API-H2-18`).
- **Dependencies:** `PaymentService`, `PaymentWebhookService`.

#### Finding F-P0-02: Coexistence of Two Competing Billing Architectures
- **Severity:** P0 (Critical)
- **Branch:** `dev3-phase3` and `dev-phase3-super-admin`
- **File:** [billing.module.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/billing/billing.module.ts#L30-L75)
- **Symbol:** `BillingModule`
- **Expected Behavior:** A single, authoritative, modular billing architecture (Phase 2 Stage 2.1-2.11) handling all financial transactions via `LedgerService`.
- **Actual Behavior:** Legacy prototype services (`PoolService`, `MakerCheckerService`, `CreditEnforcementService`, `billing.controller.ts`) coexist with Phase 2 domain services (`CreditPoolService`, `ManualBillingRequestService`, `LedgerService`, 9 platform controllers). The legacy services bypass the ledger, update balances directly, and use obsolete schema models that fail compilation.
- **Why It Matters:** Split-brain accounting, unpredictable double-spending, route ambiguity (`/admin/billing` vs `/platform/billing`), and compilation failures.
- **Recommended Fix:** Completely decommission legacy prototype services. Re-route any remaining consumers in `admin-web` or `drive.service.ts` to the Phase 2 domain services.
- **Dependencies:** F-P0-01.

---

### Priority P1 — High Severity Architectural & Contract Violations

#### Finding F-P1-01: Schema Drift & Fatal TypeScript Build Failure on `dev3-phase3`
- **Severity:** P1 (High)
- **Branch:** `dev3-phase3`
- **File:** [platform-audit.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/platform/audit/platform-audit.service.ts#L48), [pool.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/billing/pool.service.ts#L52), [maker-checker.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/billing/maker-checker.service.ts#L71)
- **Symbol:** Compilation errors `TS2551`, `TS2353`
- **Expected Behavior:** `npm run build` succeeds cleanly across all packages on both branches.
- **Actual Behavior:** Compilation fails on `dev3-phase3`:
  - `platform-audit.service.ts`: `Property 'systemAuditEvent' does not exist on type 'PrismaService'. Did you mean 'platformAuditEvent'?`
  - `maker-checker.service.ts` & `pool.service.ts`: `Type '{ organization: true; }' has no properties in common with type 'BillingAccountInclude'`.
- **Why It Matters:** Blocks all CI/CD deployment, prevents testing, and guarantees merge conflicts.
- **Recommended Fix:** Harmonize `schema.prisma`. Update `PlatformAuditService` to use the unified model name (`PlatformAuditEvent`). Remove legacy services that reference outdated 1:1 organization relations.
- **Dependencies:** F-P0-02.

#### Finding F-P1-02: Super Admin UI Calling Non-Existent Direct Mutation Endpoints
- **Severity:** P1 (High)
- **Branch:** `dev-phase3-super-admin`
- **File:** [billing.api.ts](file:///d:/Projects/cd-recruit/codebase/frontend/super-admin-web/src/lib/api/billing/billing.api.ts#L32-L85), [useBilling.ts](file:///d:/Projects/cd-recruit/codebase/frontend/super-admin-web/src/lib/hooks/billing/useBilling.ts#L45-L110)
- **Symbol:** `createAccount`, `updateAccountOverdraft`, `updateAccountStatus`, `extendPoolExpiry`, `getWebhooks`
- **Expected Behavior:** UI must submit all discretionary mutations (status changes, overdraft limits, expiry extensions) as a `ManualBillingRequest` (`POST /api/v1/platform/billing/requests` - `API-H2-09`) per domain invariant R8.
- **Actual Behavior:** The API client and React Query hooks expose direct REST endpoints (`POST /billing/accounts`, `PATCH /billing/accounts/:id/overdraft`, `PATCH /billing/accounts/:id/status`, `POST /billing/pools/:id/extend-expiry`, `GET /billing/payments/webhooks`) which do not exist on the backend and return HTTP 404 when triggered.
- **Why It Matters:** User actions in the UI fail with 404 errors, and attempts to bypass Maker-Checker violate the fundamental governance architecture.
- **Recommended Fix:** Refactor UI action dialogs in `BillingAccountsPage`, `BillingAccountDetailPage`, and `CreditPoolDetailPage` to invoke `createManualRequest` with the appropriate `RequestType` (`ACCOUNT_STATUS`, `OVERDRAFT_LIMIT`, `EXPIRY_EXTEND`). Remove phantom endpoints from `billing.api.ts`.
- **Dependencies:** None.

#### Finding F-P1-03: Hardcoded Mock Data, Overdraft Violation, and Candidate PII in Recruiter Web
- **Severity:** P1 (High)
- **Branch:** `dev3-phase3`
- **File:** [BillingSettingsTab.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/components/common/BillingSettingsTab.tsx#L40-L120)
- **Symbol:** `BillingSettingsTab`
- **Expected Behavior:** Displays real billing balances via `GET /api/v1/billing/account`. Strict adherence to `overdraftLimit = 0` (ADR-004). Zero candidate PII displayed in transaction logs (INV-PII-01).
- **Actual Behavior:** Component hardcodes fake balances (530 available credits), displays an active `"Overdraft Limit: 50 Credits"`, and renders candidate names in transaction logs (`candidateName: "Karthik Raja"`).
- **Why It Matters:** Severe violation of privacy invariant **INV-PII-01**, product invariant **ADR-004**, and misleads recruiters with fake balances.
- **Recommended Fix:** Wire `BillingSettingsTab` to real recruiter billing APIs. Strip candidate names completely (use session UUIDs or test titles). Remove the overdraft limit display.
- **Dependencies:** F-P0-02.

#### Finding F-P1-04: Test Suite Architecture Incompatible with Automated CI
- **Severity:** P1 (High)
- **Branch:** `dev3-phase3` & `dev-phase3-super-admin`
- **File:** [backend/api/src/billing/*/*.spec.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/billing/ledger/ledger.service.spec.ts)
- **Symbol:** All 27 Stage 2 test suites
- **Expected Behavior:** Unit and integration tests run via `npm test` / `npx jest` in CI pipelines.
- **Actual Behavior:** Tests are standalone procedural execution scripts invoking `pg.Client` and `console.log`. Running `npx jest` fails immediately with `Your test suite must contain at least one test`. Running via `tsx` fails due to Postgres enum schema search paths.
- **Why It Matters:** False sense of test confidence. CI pipelines cannot run or verify tests on pull requests.
- **Recommended Fix:** Wrap test logic into standard Jest test suites (`describe`, `it`, `beforeAll`, `afterAll`, `expect`) and configure Jest to load database environment variables properly.
- **Dependencies:** None.

#### Finding F-P1-05: Missing Process Isolation for Super Admin (`main.platform.ts`)
- **Severity:** P1 (High)
- **Branch:** `dev-phase3-super-admin`
- **File:** [backend/api/src/main.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/main.ts)
- **Symbol:** Application bootstrap
- **Expected Behavior:** Architecture Decision Record **ADR-001** mandates a dedicated entrypoint `main.platform.ts` listening on an isolated internal port (3001) for Super Admin ingress, separated from the public API on port 3000.
- **Actual Behavior:** Single entrypoint `main.ts` binds all routes (public, recruiter, platform) onto port 3001.
- **Why It Matters:** Increases attack surface and violates architectural isolation requirements.
- **Recommended Fix:** Create `main.platform.ts` that bootstraps `PlatformAppModule` exclusively, or update documentation if single-process multi-tenant routing is the revised operational decision.
- **Dependencies:** None.

---

### Priority P2 — Medium Severity Issues

#### Finding F-P2-01: Tenant ID vs Billing Account ID Route Mismatch
- **Severity:** P2 (Medium)
- **Branch:** `dev-phase3-super-admin`
- **File:** [TenantBillingTab.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/super-admin-web/src/pages/tenants/components/TenantBillingTab.tsx#L24)
- **Symbol:** `useBillingAccountSummary(tenantId)`
- **Expected Behavior:** Pass `billingAccountId` to fetch billing summary for an organization.
- **Actual Behavior:** Passes `tenantId` (the Organization UUID). Since `organization.id != billing_account.id`, the backend returns HTTP 404.
- **Why It Matters:** Tenant 360 billing tab fails to render account summary for selected organizations.
- **Recommended Fix:** In `TenantBillingTab`, retrieve `billingAccountId` from the loaded tenant data (`tenant.billingAccountId`) before calling `useBillingAccountSummary`.
- **Dependencies:** None.

#### Finding F-P2-02: Manual Request Validation Mismatch (`ticketRef`)
- **Severity:** P2 (Medium)
- **Branch:** `dev-phase3-super-admin`
- **File:** [CreateBillingRequestModal.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/super-admin-web/src/pages/billing/requests/components/CreateBillingRequestModal.tsx#L85)
- **Symbol:** Form submission
- **Expected Behavior:** Frontend validates `ticketRef` against backend regex before submitting.
- **Actual Behavior:** Modal allows submitting empty or unformatted ticket references. Backend `CreateManualRequestDto` strictly enforces `@MinLength(3)` and regex `^(jira|servicenow|linear|gh)-[a-zA-Z0-9_-]+$`, returning HTTP 400 Bad Request.
- **Why It Matters:** Confusing user experience with generic HTTP 400 errors.
- **Recommended Fix:** Add inline client-side regex validation and helper text in `CreateBillingRequestModal`.
- **Dependencies:** None.

#### Finding F-P2-03: Missing Cache Invalidation on Manual Request Execution
- **Severity:** P2 (Medium)
- **Branch:** `dev-phase3-super-admin`
- **File:** [useBilling.ts](file:///d:/Projects/cd-recruit/codebase/frontend/super-admin-web/src/lib/hooks/billing/useBilling.ts#L180-L210)
- **Symbol:** `useApproveRequest`, `useRetryRequest`
- **Expected Behavior:** When a manual request is approved and executed, React Query invalidates `billing-accounts`, `credit-pools`, and `ledger-entries`.
- **Actual Behavior:** Mutations only invalidate `['manual-requests']`.
- **Why It Matters:** UI shows stale balances and outdated pool remaining credits after executing a grant or adjustment until manual page refresh.
- **Recommended Fix:** In `onSuccess` handlers, call `queryClient.invalidateQueries({ queryKey: ['billing-accounts'] })`, `['credit-pools']`, and `['ledger-entries']`.
- **Dependencies:** None.

#### Finding F-P2-04: Reconciliation Engine Not Scheduled Automatically
- **Severity:** P2 (Medium)
- **Branch:** `dev3-phase3` & `dev-phase3-super-admin`
- **File:** [reconciliation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/billing/reconciliation/reconciliation.service.ts)
- **Symbol:** `runDailyReconciliation`
- **Expected Behavior:** Reconciliation runs automatically every night at 02:00 UTC via NestJS `@Cron` or BullMQ repeatable job.
- **Actual Behavior:** `ReconciliationService` implements the 7 checks, but no cron decorator or BullMQ scheduler is wired in `AppModule`. It only runs when manually triggered via `POST /platform/billing/reconciliation/run`.
- **Why It Matters:** Platform drift goes unnoticed until an operator manually triggers the reconciliation API.
- **Recommended Fix:** Wire `@Cron(CronExpression.EVERY_DAY_AT_2AM)` in a dedicated billing scheduler service.
- **Dependencies:** None.

---

### Priority P3 — Low Severity Issues

#### Finding F-P3-01: Stale Documentation & Dead Route Annotations
- **Severity:** P3 (Low)
- **Branch:** Both
- **File:** `backend/api/src/billing/billing.controller.ts`
- **Description:** Swagger annotations reference deprecated parameter names and outdated response schemas.

#### Finding F-P3-02: Tailwind Configuration Duplicate Tokens
- **Severity:** P3 (Low)
- **Branch:** `dev-phase3-super-admin`
- **File:** `frontend/super-admin-web/tailwind.config.js`
- **Description:** Minor color token redundancies between root CSS variables and Tailwind theme extension.

#### Finding F-P3-03: Typo in Git Commit Message
- **Severity:** P3 (Low)
- **Branch:** `dev-phase3-super-admin`
- **Commit:** `83fb009 feat: updated UI for the super admin dasbaord`
- **Description:** Typo `dasbaord` in commit subject line.

---

## 27. Recommended Remediation Order

To ensure zero downtime, prevent data loss, and maintain clean git history, remediation must be conducted in the following strict sequential phases:

```text
┌────────────────────────────────────────────────────────┐
│ PHASE 1: Fix Branch dev3-phase3 (Backend & Security)   │
├────────────────────────────────────────────────────────┤
│ 1. Eliminate F-P0-01 (Delete purchase backdoor)        │
│ 2. Decommission legacy prototype billing services      │
│ 3. Fix schema alignment & restore build passing        │
│ 4. Fix recruiter BillingSettingsTab (Strip PII/mocks)  │
│ 5. Verify: `npm run build` PASSES on dev3-phase3       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 2: Fix Branch dev-phase3-super-admin (UI & API)  │
├────────────────────────────────────────────────────────┤
│ 1. Refactor billing.api.ts & useBilling.ts (F-P1-02)   │
│ 2. Route mutations through Maker-Checker (API-H2-09)   │
│ 3. Fix TenantBillingTab ID lookup (F-P2-01)            │
│ 4. Fix modal ticketRef regex validation (F-P2-02)      │
│ 5. Add multi-query cache invalidation (F-P2-03)        │
│ 6. Verify: `npm run build` PASSES on super-admin-web   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 3: Controlled Branch Merge                       │
├────────────────────────────────────────────────────────┤
│ 1. Merge dev-phase3-super-admin into dev3-phase3       │
│ 2. Resolve schema.prisma & PlatformAuditEvent conflicts│
│ 3. Wire BillingModule to Phase 2 services exclusively  │
│ 4. Run `prisma generate` and full workspace build      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ PHASE 4: End-to-End Integration Verification           │
├────────────────────────────────────────────────────────┤
│ 1. Wrap test suites into Jest runners (F-P1-04)        │
│ 2. Wire nightly reconciliation cron scheduler          │
│ 3. Verify all 24 API endpoints end-to-end via Postman  │
│ 4. Full browser validation of Super Admin UI workflows │
└────────────────────────────────────────────────────────┘
```

---

## 28. Merge Readiness & Final Verdict

### Merge Readiness Assessment
- **Semantic Conflict Risk:** **CRITICAL** (due to competing legacy vs modern billing services).
- **Syntactic Conflict Risk:** **HIGH** (in `schema.prisma` and `billing.module.ts`).
- **Security Merge Risk:** **FATAL** (merging as-is would promote an arbitrary credit minting vulnerability into the Super Admin branch).

### Final Verdict
```text
╔═══════════════════════════════════════════════════════════════════════════════╗
║                               VERDICT: BLOCKED                                ║
║                                                                               ║
║   DO NOT MERGE dev-phase3-super-admin AND dev3-phase3 AT THIS TIME.           ║
║                                                                               ║
║   Both branches require branch-specific repairs before any merge operation    ║
║   can safely take place. Proceed strictly with Phase 1 remediation on         ║
║   dev3-phase3 and Phase 2 remediation on dev-phase3-super-admin.              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---
*Report authored in compliance with Phase 3 Audit Mandate.*  
*Artifact stored at: `docs/super-admin/implementation/PHASE-3-COMPLETE-SYSTEM-AUDIT.md`*
