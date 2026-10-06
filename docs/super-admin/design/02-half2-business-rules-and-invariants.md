# Artifact 02: Half 2 Business Rules and Invariants Specification

**Document:** `docs/super-admin/design/02-half2-business-rules-and-invariants.md`  
**Classification:** Core Business Logic & Invariants Contract  
**System:** Proctora / CD-Recruit Platform Ops & Billing Engine  
**Authoritative Precedence:** `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` v3 > `super-admin-intent.md`  

---

## 1. Global Architectural Invariants (R1–R9)

These nine rules are non-negotiable across all database schemas, backend services, API contracts, and user interfaces:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        NINE CORE FINANCIAL & OPERATIONAL RULES                         │
├────┬─────────────────────────────┬─────────────────────────────────────────────────────┤
│ R1 │ Whole-Number Credits (Int)  │ No fractions, decimals, or micro-credits.           │
│ R2 │ Ledger is Single Truth      │ All balances derive from ledger replay.             │
│ R3 │ Never Use NOW() for Timers  │ PostgreSQL clock_timestamp() only.                  │
│ R4 │ Strict Global Lock Order    │ BillingAccount → Session → CreditPool → Ledger.     │
│ R5 │ Zero FKs to Transients      │ Ledger stores plain UUIDs, no candidate/session FKs.│
│ R6 │ Server-Authoritative        │ UI values are never trusted without backend checks. │
│ R7 │ Candidate APIs are Blind    │ Zero billing, credit, or overdraft data in exam API.│
│ R8 │ Maker-Checker for Money     │ requester != approver; no threshold bypass.         │
│ R9 │ Honest Capability Standards │ Verified by reconciliation; no unprovable claims.   │
└────┴─────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 2. Invariant Master Matrix

Every invariant is specified with its **Rule**, **Reason**, **Enforcement Layer**, and **Consequence of Violation**.

| Invariant ID | Domain | Rule Summary | Primary Enforcement Layer | Consequence of Violation |
|---|---|---|---|---|
| **INV-LED-01** | Ledger | Balance cannot be mutated directly | DB Permissions + Trigger | SQL Exception / Transaction Abort |
| **INV-LED-02** | Ledger | Single source of truth | Service + Nightly Replay | Alarm fired; immediate reconciliation drift report |
| **INV-LED-03** | Ledger | Append-only immutability | DB Trigger (`forbid_mutation`) | SQL Exception (`RAISE EXCEPTION`) |
| **INV-LED-04** | Ledger | Atomic acquisition | `billing_begin()` Stored Proc | Automatic rollback of session start |
| **INV-LED-05** | Ledger | Exact-once acquisition per session | Partial Unique Index | DB Unique Constraint Violation (`409 Conflict`) |
| **INV-LED-06** | Ledger | Exact-once reversal | Partial Unique Index | DB Unique Constraint Violation |
| **INV-LED-07** | Ledger | Sign integrity per entry type | Table CHECK Constraint | DB Check Constraint Violation |
| **INV-LED-08** | Ledger | Idempotency key required | Unique Column Constraint | Replay rejected; duplicate minting prevented |
| **INV-POL-01** | Credit Pool | Non-negative cached balance | Table CHECK Constraint | Fast-path claim fails; slow-path triggered |
| **INV-POL-02** | Credit Pool | Immutable core columns | DB Trigger (`guard_credit_pool`) | SQL Exception on totalCredits/purchasedAt update |
| **INV-POL-03** | Credit Pool | Single active general pool | Partial Unique Index | Second activation rejected |
| **INV-POL-04** | Credit Pool | Single active pass per drive | Partial Unique Index | Second drive pass activation rejected |
| **INV-POL-05** | Credit Pool | Expiry extension requires request | DB Trigger + Context Setting | Expiry update rejected without `proctora.request_id` |
| **INV-POL-06** | Credit Pool | Floating clock outer bound | Scheduled Worker (365 days) | Automatic countdown start |
| **INV-MKC-01** | Maker-Checker | Requester $\ne$ Approver | DB CHECK Constraint + Service | SQL Constraint Violation (`chk_maker_checker`) |
| **INV-MKC-02** | Maker-Checker | Zero-threshold dual authorization | Service Boundary | Operation blocked; request logged as PENDING |
| **INV-MKC-03** | Maker-Checker | Mandatory ticket reference | DTO Validation + DB NOT NULL | API 400 Bad Request |
| **INV-MKC-04** | Maker-Checker | Safe retry on execution failure | Derived Idempotency Key | Idempotent re-execution without duplicate entries |
| **INV-PAY-01** | Payment | Credits mint only on captured hook | Service Boundary | Credits never minted on client redirect |
| **INV-PAY-02** | Payment | Webhook idempotency | DB Unique Constraint | Duplicate webhook ignored safely (HTTP 200) |
| **INV-PAY-03** | Payment | Catalog-only pricing | Service Domain Check | Client-submitted amounts discarded |
| **INV-PAY-04** | Payment | Refunds cover unconsumed only | Service Calculation | Consumed credits cannot be refunded as cash |
| **INV-PRC-01** | Price Book | Versioned immutability | Partial Unique Index + Service | In-place pricing edits rejected |
| **INV-PRC-02** | Price Book | Country tied to Legal Entity | DTO + Onboarding Validation | Browser IP / VPN country detection ignored |
| **INV-TNT-01** | Tenant | In-flight session immunity | State Machine Guard | Tenant suspension never kills active exam |
| **INV-TNT-02** | Tenant | Trial domain uniqueness | DB Unique Constraint | Second trial on same corporate domain rejected |
| **INV-OVR-01** | Overrides | No direct overdraft mutation | Architecture Rule | Emergency overdraft shortcut strictly eliminated |
| **INV-OVR-02** | Overrides | Question fix creates new version | Service Snapshot Engine | Active/completed sessions retain original questions |
| **INV-OVR-03** | Overrides | Two-actor rule for exam fairness | Service + Audit | Single-operator exam manipulation prevented |
| **INV-PII-01** | Privacy | PII-Blind-by-Default | DTO Serialization / Query | Candidate names/emails stripped from Super Admin |
| **INV-PII-02** | Privacy | Impersonation tenant-only scope | JWT Claims + Guard | Impersonated token rejected on platform routes |

---

## 3. Financial Ledger Invariants

### 3.1 Source-of-Truth Invariant (R2)
- **Rule:** The `credit_ledger_entry` table is the **sole source of truth** for all financial balances.
- **Reason:** Caching counters (`cached_remaining`, `overdraft_used`) are subject to race conditions and process crashes. Replaying ledger entries reconstructs exact financial history.
- **Enforcement:**
  - `CreditPool.cachedRemaining` and `BillingAccount.overdraftUsed` are write-only caches maintained by `LedgerService` within the exact database transaction as the ledger row insertion.
  - Nightly 7-Point Reconciliation (§9.2) verifies:
    $$\text{cached\_remaining} = \text{total\_credits} + \sum \text{amount (non-shadow)}$$
    $$\text{overdraft\_used} = -\sum \text{OVERDRAFT} + \sum \text{OVERDRAFT\_SETTLE} - \sum \text{REVERSAL (null pool)}$$
- **Violation Consequence:** Discrepancy triggers high-severity alert; ledger replay overwrites cache.

### 3.2 Immutability & Append-Only Enforcement
- **Rule:** Ledger entries, audit events, and session billing evidence cannot be modified, deleted, or truncated by any user or application role.
- **Enforcement:**
  ```sql
  REVOKE UPDATE, DELETE, TRUNCATE ON credit_ledger_entry, billing_audit_event, session_billing_evidence FROM proctora_app;
  REVOKE UPDATE, DELETE, TRUNCATE ON credit_ledger_entry, billing_audit_event, session_billing_evidence FROM proctora_platform;

  CREATE TRIGGER trg_ledger_append_only
    BEFORE UPDATE OR DELETE ON credit_ledger_entry
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
  ```
- **Violation Consequence:** PostgreSQL throws exception `UPDATE/DELETE on credit_ledger_entry is strictly forbidden`.

### 3.3 Strict Global Lock Hierarchy (R4)
- **Rule:** Whenever multiple entities must be locked in a transaction, locks MUST be acquired in this exact sequence:
  $$1.\;\text{BillingAccount Advisory Lock} \longrightarrow 2.\;\text{Session Row} \longrightarrow 3.\;\text{CreditPool Row(s)} \longrightarrow 4.\;\text{Ledger Row Insert}$$
- **Reason:** Holding lock $B$ while attempting to acquire lock $A$ causes deadlocks under high concurrency (e.g. 2,000 candidates starting simultaneously).
- **Enforcement:** Fast-path avoids advisory locks entirely ($<2\text{ms}$ pool lock). Slow-path acquires advisory lock first:
  `SELECT pg_advisory_xact_lock(hashtextextended(:billingAccountId::text, 0));`
- **Violation Consequence:** Transaction aborted by PostgreSQL deadlock detector or lock timeout (2s).

### 3.4 Zero Transient Foreign Keys (R5)
- **Rule:** `credit_ledger_entry` must not have foreign keys to transient candidate entities (`session`, `candidate`, `drive`, `organization`).
- **Reason:** GDPR "Right to be Forgotten" erasure requests or candidate data retention purges must never fail or cascade-delete financial ledger records.
- **Enforcement:** Fields `session_id`, `candidate_id`, `drive_id`, `organization_id` are plain UUID snapshots. Foreign keys exist only to permanent financial entities: `BillingAccount`, `CreditPool`, `Payment`, `ManualBillingRequest`, and itself (`related_entry_id`).
- **Violation Consequence:** Checked by CI schema invariant tests.

### 3.5 Ledger Entry Amount & Type Integrity
- **Rule:** Amounts must strictly adhere to entry type semantics:
  - `GRANT` (+n): amount $> 0$, `grant_source` NOT NULL.
  - `CONSUME` (-1): amount $= -1$, `credit_pool_id` NOT NULL.
  - `OVERDRAFT` (-1): amount $= -1$, `credit_pool_id` MUST BE NULL.
  - `OVERDRAFT_SETTLE` (-n): amount $< 0$, deducted from pool to clear debt.
  - `WAIVE` (0): amount $= 0$, `credit_pool_id` MUST BE NULL (Recruiter courtesy).
  - `REVERSAL` (+1): amount $> 0$, `related_entry_id` NOT NULL.
  - `REFUND` (-n): amount $< 0$, `payment_id` NOT NULL.
  - `EXPIRE` (-n): amount $< 0$, unconsumed credits expired at deadline.
  - `ADJUST` ($\pm n$): amount $\ne 0$, `request_id` NOT NULL.
- **Enforcement:** PostgreSQL check constraints `chk_ledger_amount_sign` and `chk_ledger_required_refs`.
- **Violation Consequence:** Database rejects insertion with constraint error.

### 3.6 Idempotency Invariant
- **Rule:** Every balance-mutating ledger insertion must supply a deterministic `idempotency_key`.
- **Key Derivation Standards:**
  - Session acquisition: `acquire:{sessionId}`
  - Shadow acquisition: `shadow:acquire:{sessionId}`
  - Payment purchase: `grant:pay:{paymentId}`
  - Overdraft settle: `settle:pay:{paymentId}:pool:{poolId}`
  - Trial grant: `trial:{billingAccountId}`
  - Goodwill / Promo: `request:{requestId}`
  - Reversal: `reversal:{relatedEntryId}`
  - Expiry: `expire:pool:{poolId}:{YYYY-MM-DD}`
- **Enforcement:** `idempotency_key` is marked `@unique` in Prisma and database.
- **Violation Consequence:** Duplicate calls return existing record or throw unique constraint violation, guaranteeing exact-once processing.

---

## 4. Credit Pool Invariants

### 4.1 Topology Invariant
- **Rule:** A Billing Account may have at most:
  - **One ACTIVE general pool** (`drive_id IS NULL`, status = `ACTIVE`).
  - **One ACTIVE event pool per drive** (`drive_id IS NOT NULL`, status = `ACTIVE`).
  - Any number of `QUEUED`, `EXHAUSTED`, or `EXPIRED` pools.
- **Reason:** Eliminates ambiguous pool drawdowns and race conditions when resolving which pool pays for a candidate attempt.
- **Enforcement:** Partial unique indexes:
  ```sql
  CREATE UNIQUE INDEX uq_pool_one_active_general ON credit_pool (billing_account_id)
    WHERE status = 'ACTIVE' AND drive_id IS NULL;

  CREATE UNIQUE INDEX uq_pool_one_active_per_drive ON credit_pool (drive_id)
    WHERE status = 'ACTIVE' AND drive_id IS NOT NULL;
  ```
- **Violation Consequence:** Database throws unique index violation if two pools are active simultaneously.

### 4.2 Pool Immutability Invariant
- **Rule:** The following columns on `credit_pool` are immutable once inserted:
  - `total_credits`, `drive_id`, `purchased_at`, `unit_price_minor`, `currency`, `payment_id`, `terms_version`.
- **Reason:** Prevents historical rewriting of commercial contracts and purchase prices.
- **Enforcement:** PostgreSQL trigger `guard_credit_pool_mutation`.
- **Violation Consequence:** Update rejected with exception `Core commercial columns on credit_pool are immutable`.

### 4.3 Sequential Queueing ("The Jio Model") & Promotion
- **Rule:** When an account purchases multiple Talent Reserve packs, they receive sequential `queue_order` numbers (1, 2, 3...). Pack $N+1$ remains `QUEUED` until Pack $N$ is `EXHAUSTED` or `EXPIRED`.
- **Activation Trigger:** When fast-path returns `NEEDS_SLOW_PATH`, the slow path promotes the lowest `queue_order` pool:
  - Sets `status = ACTIVE`, `activated_at = clock_timestamp()`.
  - If `clock_started_at` is null, sets `clock_started_at = clock_timestamp()` and `expires_at = clock_started_at + validity_days`.
- **Enforcement:** `LedgerService.promoteNextQueuedPool()` under account advisory lock.

### 4.4 Expiry & 7-Day Makeup Window
- **Drive Pass:**
  - `expires_at = drive.schedule_end + INTERVAL '7 days'`.
  - Leftover credits remain usable for 7 days post-drive for makeup attempts or Round 2 sessions.
  - After 7 days, unconsumed credits expire (`EXPIRE` entry). **Anti-arbitrage rule:** leftover Drive Pass credits cannot be transferred to Talent Reserve.
- **Talent Reserve Floating Clock:**
  - Countdown begins upon **first draw** (`clock_started_at = clock_timestamp()`).
  - **Outer Bound (R3):** If no candidate draws within `maxWaitDays` (365 days), daily worker starts the clock automatically (`expires_at = purchased_at + maxWaitDays + validityDays`).

---

## 5. Maker-Checker Invariants (R8)

### 5.1 Dual-Authorization Invariant
- **Rule:** Every manual credit action without exception requires two distinct human actors:
  $$\text{requested\_by\_id} \ne \text{approved\_by\_id}$$
- **Zero Threshold:** There is no "small balance bypass" (e.g., granting 5 credits still requires an approver).
- **Reason:** Eliminates rogue insider credit minting, employee fraud, and unrecorded financial commitments.
- **Enforcement:**
  - Database check constraint on `manual_billing_request`:
    ```sql
    ALTER TABLE manual_billing_request ADD CONSTRAINT chk_maker_checker
      CHECK (approved_by_id IS NULL OR approved_by_id <> requested_by_id);
    ```
  - `ManualBillingRequestService.approve()` asserts `actor.id !== request.requestedById`.
- **Violation Consequence:** Database rejects update; API throws 403 Forbidden.

### 5.2 Mandatory Audit Reference
- **Rule:** Every `ManualBillingRequest` must include:
  1. A valid, non-empty `ticket_ref` (CRM / Support Ticket ID, e.g. `JIRA-4521`).
  2. A typed, non-PII `payload`.
  3. A descriptive `reason` (min 10 characters).
- **Enforcement:** NestJS DTO class-validator + DB NOT NULL constraint.
- **Violation Consequence:** API returns 400 Bad Request.

### 5.3 Request Execution Lifecycle & Failure Handling
- **State Flow:**
  $$\text{PENDING} \longrightarrow \text{APPROVED} \longrightarrow \text{EXECUTED}$$
  $$\text{PENDING} \longrightarrow \text{REJECTED} \quad \text{or} \quad \text{CANCELLED}$$
- **Execution Failure Rule:**
  - If approval succeeds but ledger execution fails (e.g., transient DB lock timeout), the request status remains **`APPROVED`** (not EXECUTED), with the error logged in `execution_error`.
  - **Safe Retry:** The approver or finance staff can trigger `/requests/:id/retry`. The retry re-uses the request's deterministic idempotency key (`request:{id}`), preventing duplicate credit minting.
- **Enforcement:** `ManualBillingRequestService.executeApprovedRequest()` inside transaction with `proctora.request_id` set.

---

## 6. Payment & Invoicing Invariants

### 6.1 Captured Payment Requirement
- **Rule:** Credits are minted **only** upon cryptographic verification of a captured payment webhook (`payment.captured` or Stripe `payment_intent.succeeded`) or authorized manual PO entry.
- **Client Redirect Rule:** The browser return/success URL (`/billing/success`) is treated as purely cosmetic. It polls for credit pool availability but **never mints credits**.
- **Reason:** Eliminates client-side spoofing, manipulated redirect queries, and browser drop-offs.
- **Enforcement:** `PaymentWebhookService` verifies HMAC-SHA256 signature before inserting into `payment_event` and dispatching to worker.

### 6.2 Webhook Idempotency & Replay Protection
- **Rule:** Webhook events are deduplicated based on the provider's unique payment ID:
  - Table `payment` enforces `UNIQUE (provider, provider_payment_id)`.
  - Table `payment_event` enforces `UNIQUE (provider, event_id)`.
- **Duplicate Handling:** If a webhook delivers twice, the second event finds the existing payment and returns HTTP 200 OK immediately without re-minting.
- **Violation Consequence:** Handled silently and idempotently.

### 6.3 Cash Refund Boundaries
- **Rule:** Cash refunds apply **only to unconsumed credits**:
  $$\text{Max Refund Amount} = \text{cached\_remaining} \times \text{unit\_price\_minor}$$
- Consumed credits represent executed computing and proctoring costs and can **never be cash-refunded**.
- **Execution:**
  1. Insert `REFUND` ledger entry (`amount = -unconsumed_credits`, `credit_pool_id = pool.id`).
  2. Transition pool to `CANCELLED`.
  3. Issue refund through payment gateway API.
- **Enforcement:** `PaymentService.refund()` validates consumed vs remaining count.

### 6.4 Chargebacks and Disputes
- **Rule:** When a payment gateway issues a chargeback/dispute webhook:
  1. Associated `CreditPool` is immediately updated to `status = SUSPENDED`.
  2. If the account's total available balance drops below 0 (consumed credits exceeded remaining), the `BillingAccount` transitions to `status = RESTRICTED`.
  3. Running candidate sessions are **not interrupted**; future session starts for that tenant are blocked.

---

## 7. Pricing & Catalog Invariants

### 7.1 Versioned Immutability
- **Rule:** `PriceBookEntry` records are **append-only**. Prices are never updated in place.
- **Publishing Workflow:** When prices change:
  1. Insert new row with `version = version + 1`, `effective_from = now()`, `effective_to = NULL`.
  2. Update prior version's `effective_to = now()`.
  3. Existing pools retain the `unit_price_minor` captured at purchase time.
- **Enforcement:** Unique constraint `UNIQUE (sku, billing_country, version)`.

### 7.2 Legal Entity Country Anchoring
- **Rule:** `billingCountry` is determined strictly by the verified corporate entity and tax registration (e.g. GSTIN in India, EIN in US).
- **Prohibition:** Country is **never** inferred from browser IP address, candidate location, or VPN.
- **Cross-Border Arbitrage Prevention:** Changing a Billing Account's country requires a `ManualBillingRequest` of kind `BILLING_COUNTRY` with tax certificate proof and maker-checker approval.

---

## 8. Tenant & Candidate Invariants

### 8.1 In-Flight Candidate Session Immunity
- **Rule:** Suspending a tenant (for non-payment, dispute, or T&C abuse) blocks **new** invites and **new** session starts. It MUST NEVER terminate, invalidate, or interrupt a candidate session that is already in progress (`status = IN_PROGRESS`).
- **Reason:** Candidates are innocent third parties. Mid-test terminations destroy brand trust and legal standing.
- **Enforcement:** Session heartbeat and submission endpoints verify `session.id` validity, not tenant active status.

### 8.2 Trial Domain Uniqueness
- **Rule:** Exactly one automatic trial grant (25 credits, 30 days) is permitted per verified corporate email domain.
- **Exclusion:** Free/public email domains (`gmail.com`, `yahoo.com`, `outlook.com`) are rejected at onboarding.
- **Enforcement:**
  - Unique index: `billing_account.trial_domain` UNIQUE.
  - Automatic trial grant executed by system with `GrantSource.TRIAL`.
  - Second trial override requires `ManualBillingRequest` maker-checker.

---

## 9. Operational Override Invariants (F7)

### 9.1 Emergency Overdraft Elimination
- **Rule:** Direct balance adjustments, "Emergency Overdraft" buttons, or manual mutations of `overdraft_limit` are **strictly forbidden**.
- **Approved Emergency Paths:**
  1. Staff-initiated 1-Click Top-Up charging the tenant's card on file.
  2. `ManualBillingRequest` of kind `GRANT`, source `GOODWILL`, mandatory ticket reference, maker-checker approval.

### 9.2 Mid-Drive Question Fixes & Snapshot Integrity
- **Rule:** Editing a question during an active drive creates a new immutable Question version.
- **Rebind Policy:**
  - Sessions in `NOT_STARTED` are rebound to the new version.
  - Sessions in `IN_PROGRESS`, `SUBMITTED`, or `CLOSED` retain their original question snapshot.
- **Enforcement:** `DriveService.updateQuestionOnActiveDrive()` asserts session status before updating snapshots.

### 9.3 Incident Window & Automated T3 Reversals
- **Rule:** An `IncidentWindow` declared by Platform Operations marks a specific time range $[T_{\text{start}}, T_{\text{end}}]$ and affected drives/infrastructure.
- **Remediation:** Any candidate session started within that window that did not reach `SUBMITTED` status automatically receives a `REVERSAL` ledger entry, returning the credit to the customer.

---

## 10. Privacy & Security Invariants

### 10.1 PII-Blind by Default
- **Rule:** Super Admin console screens and platform APIs are strictly candidate PII-free.
  - Default views display aggregate counts, dates, and completion rates.
  - No rendered candidate rosters (names, emails, resumes).
  - Financial ledger rows carry plain UUIDs with zero links to candidate names.
- **Enforcement:** DTO serialization strips candidate identification fields from platform endpoints.

### 10.2 Scoped Impersonation Boundary (F10)
- **Rule:** Tenant impersonation ("Log in as Tenant Admin") is time-boxed to 30 minutes, requires a mandatory ticket reference, and issues a token with **tenant-only scope**.
- **Structural Barrier:** An impersonated session is structurally incapable of calling platform-level endpoints (`/api/v1/platform/*`) or approving financial requests.
- **Audit:** Every mutation performed while impersonating writes dual-actor audit logs (`staff_id` + `impersonated_tenant_id`).
