# PHASE 2 — BILLING ENGINE
## Stage 2.7 Implementation Report: PaymentService

**Date:** 2026-09-30  
**Status:** PASS  
**Branch:** `feature/RA/billing-engine`  
**Scope:** Stage 2.7 — `PaymentService` exclusively.  

---

## 1. Status

### **`PASS`**

`PaymentService` has been completely implemented, verified, and gated. All 39 dedicated unit, integration, RBAC, and concurrency tests passed. The full regression suite of 301 tests across 10 suites passed with 100% success rate. The database schema has 0 drift, 28 migrations applied, zero overdraft, and pristine baseline seed preservation.

---

## 2. Design Verification

All authoritative design artifacts and architectural decisions were verified prior to and throughout implementation:

* **Artifact 01 (`01-half2-domain-and-scope.md`):** Verified §4.3 Payment & Invoicing model and commercial boundaries.
* **Artifact 02 (`02-half2-business-rules-and-invariants.md`):** Enforced Invariants R1 (Ledger truth), R2 (Zero overdraft floor), R4 (Row-locking concurrency hierarchy), INV-PAY-04 (§6.3 Cash refund covers unconsumed credits only), and integer minor-unit arithmetic.
* **Artifact 03 (`03-half2-database-schema.md`):** Aligned with existing `billing.payment` model, `@@unique([provider, providerPaymentId])`, `chk_ledger_required_refs` (`payment_id IS NOT NULL` for `REFUND`), and `chk_ledger_amount_sign` (`amount < 0` for `REFUND`).
* **Artifact 04 (`04-half2-services-and-api-contracts.md`):** Implemented exact service methods: `recordManualInvoicePayment`, `createPaymentRecord`, `capturePayment`, `issueRefund`, `getPaymentById`, and `listPayments`. Excluded webhook receiving and reconciliation.
* **Artifact 05 (`05-half2-api-catalogue-and-page-specifications.md`):** Domain logic matches backing specifications for `API-H2-16` (Payments Console list/filters) and `API-H2-17` (Record Offline Enterprise PO Payment).
* **Artifact 06 (`06-half2-state-permission-and-audit-matrix.md`):** Enforced Payment state machine (§1.4: `CREATED` $\rightarrow$ `CAPTURED` $\rightarrow$ `PARTIALLY_REFUNDED` / `REFUNDED`), Platform RBAC (§3.2: `FINANCE` and `OWNER` authorized, `SUPPORT` and recruiters rejected), and append-only audit trail.
* **Artifact 07 (`07-half1-half2-integration-contract.md`):** Maintained strict service boundary isolation; no direct candidate PII leakage.
* **DESIGN-DECISIONS.md & DESIGN-OPEN-QUESTIONS.md:** Preserved ADR-002 (Staff role segregation) and ADR-004 (Zero overdraft policy).
* **DESIGN-READINESS-REPORT.md & CURRENT-STATE-REAUDIT.md:** Adhered strictly to topological implementation order.

---

## 3. Payment Contract

### 3.1 Public Service Methods

`PaymentService` exposes the following canonical methods:

1. **`recordManualInvoicePayment(actor: PaymentActor, dto: RecordManualInvoicePaymentDto): Promise<PaymentResultDto>`**
   * Records an offline Enterprise PO / wire payment.
   * Atomically transitions payment status directly to `CAPTURED`, mints `CONTRACT` pool, creates opening `GRANT` ledger entry with `paymentId`, sets `BillingAccount.hasPaidPurchase = true`, and emits `PAYMENT_CAPTURED` audit event.
2. **`createPaymentRecord(actor: PaymentActor, dto: CreatePaymentRecordDto): Promise<PaymentResultDto>`**
   * Tracks direct checkout payment intents (`status: CREATED`) or external transactions prior to capture.
   * Emits `PAYMENT_INTENT_CREATED` audit event.
3. **`capturePayment(actor: PaymentActor, paymentId: string, captureData?: CapturePaymentDto): Promise<PaymentResultDto>`**
   * Captures an existing `CREATED` payment record.
   * Transitions to `CAPTURED`, mints `PURCHASE` pool, writes `GRANT` ledger entry, updates `hasPaidPurchase = true`, and emits `PAYMENT_CAPTURED` audit event.
4. **`issueRefund(actor: PaymentActor, dto: IssueRefundDto): Promise<PaymentResultDto>`**
   * Issues cash refunds on captured payments bounded strictly by unconsumed credits (`cachedRemaining >= refundCredits`).
   * Delegates financial movement to `LedgerService.refundCredits`.
   * Transitions payment status to `PARTIALLY_REFUNDED` or `REFUNDED`, cancels fully refunded pool, and emits `PAYMENT_REFUNDED` / `PAYMENT_PARTIALLY_REFUNDED` audit event.
5. **`getPaymentById(id: string): Promise<PaymentResultDto>`**
   * Retrieves payment with linked credit pools, ledger entries, and calculated refund totals.
6. **`listPayments(options?: ListPaymentsOptions): Promise<PaginatedPaymentsResultDto>`**
   * Supports filtering by `billingAccountId`, `status`, `provider`, `invoiceNumber`, and date ranges with standard pagination.

### 3.2 Payment State Machine

```
              ┌────────────────────────────────────────────────────────┐
              │                                                        │
              ▼                                                        │
         [*] ───► CREATED ───► CAPTURED ───► PARTIALLY_REFUNDED ───► REFUNDED
                     │            │
                     ▼            ▼
                   FAILED      DISPUTED
```

* Offline Enterprise PO payments enter directly in `CAPTURED` status.
* Checkout intent payments initialize as `CREATED` and transition to `CAPTURED` upon capture.
* Refunds transition from `CAPTURED` or `PARTIALLY_REFUNDED` to `REFUNDED` or `PARTIALLY_REFUNDED`.
* Invalid transitions (e.g. `REFUNDED` $\rightarrow$ `CAPTURED` or `FAILED` $\rightarrow$ `CAPTURED`) are strictly rejected.

### 3.3 Authorization Boundary

* **Authorized:** `PlatformStaffRole.FINANCE`, `PlatformStaffRole.OWNER`.
* **Rejected:** `PlatformStaffRole.SUPPORT` (throws `ForbiddenException`), tenant recruiter roles (`ForbiddenException`), unauthenticated/missing actors (`UnauthorizedException`).

### 3.4 Idempotency & Concurrency

* Unique constraint: `@@unique([provider, providerPaymentId])` on `billing.payment`.
* Exact retries with identical parameters return the canonical existing payment record idempotently without duplicate credit minting.
* Replays with conflicting parameters throw `ConflictException`.
* Concurrent duplicate submissions are serialized by PostgreSQL unique constraint: one transaction succeeds, and concurrent callers return the created payment.

---

## 4. Manual Invoice Flow

The complete execution executes within a single PostgreSQL transaction (`prisma.$transaction`):

```
BillingAccount (must be ACTIVE)
       │
       ▼
PriceBookEntry (validate country, currency, positive quantity, minor units)
       │
       ▼
Payment (create row: provider='MANUAL_INVOICE', status='CAPTURED')
       │
       ▼
CreditPoolService.createPool(source='CONTRACT', paymentId=payment.id)
       │
       ▼
CreditLedgerEntry (opening GRANT entry: paymentId=payment.id, grantSource='CONTRACT')
       │
       ▼
BillingAccount.hasPaidPurchase = true
       │
       ▼
billing_audit_event (PAYMENT_CAPTURED)
       │
       ▼
COMMIT
```

If any step fails, the entire transaction rolls back cleanly, leaving 0 orphan payments, 0 orphan pools, 0 ledger entries, `hasPaidPurchase` unchanged, and no phantom audit events.

---

## 5. Refund Flow

* **Rule:** Cash refunds cover **unconsumed credits only** (`INV-PAY-04` / Rule 6.3):
  $$\text{Max Refund Amount} = \text{cached\_remaining} \times \text{unit\_price\_minor}$$
* Consumed credits represent executed computing and proctoring costs and can **never be cash-refunded**.
* Delegation: `PaymentService` delegates financial debit to `LedgerService.refundCredits`:
  * Acquires PostgreSQL row lock `SELECT ... FOR UPDATE` on `credit_pool`.
  * Verifies `cached_remaining >= refundCredits`.
  * Inserts immutable `CreditLedgerEntry` with `entryType = 'REFUND'`, `amount = -refundCredits` (satisfies `chk_ledger_amount_sign`), and mandatory `paymentId` (satisfies `chk_ledger_required_refs`).
  * Decrements `CreditPool.cachedRemaining`.
  * If unconsumed balance reaches 0 on full refund, transitions `CreditPool.status = 'CANCELLED'`.
* Payment state is updated to `PARTIALLY_REFUNDED` or `REFUNDED`.
* Emits `PAYMENT_REFUNDED` or `PAYMENT_PARTIALLY_REFUNDED` billing audit event.

---

## 6. Financial Linkage

```
┌────────────────────────────────┐
│      billing.payment           │
│  id: "pay-1"                   │
│  quantity_credits: 500         │
│  amount_minor: 3000000         │
└───────┬────────────────┬───────┘
        │                │
        │ payment_id     │ payment_id
        ▼                ▼
┌─────────────────┐   ┌───────────────────────────┐
│ billing.credit_ │   │ billing.credit_ledger_    │
│ pool            │   │ entry                     │
│  payment_id     │   │  payment_id: "pay-1"      │
│  source:        │   │  entry_type: "GRANT"      │
│   "CONTRACT"    │   │  amount: 500              │
└─────────────────┘   └───────────────────────────┘
```

* **Reconciliation Check 6 Preparation:**
  For every purchase ledger grant, there exists exactly one `CAPTURED` Payment where:
  * `payment.id == ledger.payment_id`
  * `payment.quantity_credits == ledger.amount`
  * `pool.payment_id == payment.id`

---

## 7. Concurrency Test Results

All 4 mandatory concurrency tests from Section 28 passed:

| Test | Scenario | Result |
|---|---|---|
| **Test 1** | Concurrent manual invoice submissions with exact same invoice number | **PASS** — Serialized by DB unique constraint; exactly 1 Payment, 1 CreditPool, 1 GRANT entry created; 0 duplicate credits. |
| **Test 2** | Different simultaneous legitimate payments for same account | **PASS** — Both succeed with independent pools and serialized sequential queue orders (Jio queue model). |
| **Test 3** | Concurrent refund race on same balance (two 70-credit refunds against 100 credits) | **PASS** — Exactly one succeeds (balance $\rightarrow$ 30); the second is rejected (`REFUND_EXCEEDS_UNCONSUMED_BALANCE`). Pool balance remains non-negative; zero overdraft. |
| **Test 4** | Downstream failure during pool/ledger/audit mutation | **PASS** — 100% atomic rollback across Payment, Pool, Ledger, and Audit; `hasPaidPurchase` remains false. |
| **Test 5** | Exact retry after successful capture | **PASS** — Canonical payment returned idempotently with zero duplicate financial effects. |

---

## 8. Rollback Results

* Forced downstream validation/database errors demonstrated 100% transactional rollback.
* Zero orphan `billing.payment` records.
* Zero orphan `billing.credit_pool` records.
* Zero orphan `billing.credit_ledger_entry` records.
* `BillingAccount.hasPaidPurchase` remained unchanged (`false`).
* Zero false audit records emitted.

---

## 9. Comprehensive Test Regression

```text
================================================================================
Test Suite Breakdown
================================================================================
1. Platform Authentication       (platform-auth.spec.ts):            17 / 17 PASS
2. Platform Audit                (platform-audit.spec.ts):           17 / 17 PASS
3. Foundation Gate               (step1-7-foundation-gate.spec.ts):  20 / 20 PASS
4. BillingAccountService         (billing-account.spec.ts):          29 / 29 PASS
5. LedgerService                 (ledger.spec.ts):                   32 / 32 PASS
6. CreditPoolService             (credit-pool.spec.ts):              31 / 31 PASS
7. TrialGrantService             (trial-grant.spec.ts):              22 / 22 PASS
8. ManualBillingRequestService   (manual-billing-request.spec.ts):   47 / 47 PASS
9. PriceBookService              (price-book.spec.ts):               47 / 47 PASS
10. PaymentService (NEW)         (payment.spec.ts):                  39 / 39 PASS

TOTAL REGRESSION: 301 / 301 PASS (100%)
================================================================================
```

---

## 10. Database State

* **Prisma validate:** PASS (`The schema at prisma\schema.prisma is valid 🚀`).
* **Prisma migrate status:** 28 migrations applied, 0 schema drift, database schema up to date.
* **Constraints active:**
  * `chk_ledger_amount_sign` active (`amount < 0` for `REFUND`).
  * `chk_ledger_required_refs` active (`payment_id IS NOT NULL` for `REFUND`).
  * `chk_pool_nonneg` active (`cached_remaining >= 0`).
  * `uq_pool_one_active_general` active.
  * Append-only triggers on `billing.credit_ledger_entry` and `billing.billing_audit_event` active.
* **Overdraft:** Zero overdraft permanently preserved across all accounts (`overdraft_used == 0`).
* **Seed preservation:** Acme Corp and Globex Corporation baseline accounts, credit pools, and ledger entries remain 100% pristine.

---

## 11. Build Validation

* **`npm run build:shared`:** Exit code 0 (TypeScript compile clean).
* **`npm run build` (backend/api):** Exit code 0 (NestJS build clean, 0 compiler errors, 0 unresolved imports).

---

## 12. Files Created and Modified

### Created Files:
* `backend/api/src/billing/payment/payment.types.ts`: DTOs, interfaces, and options.
* `backend/api/src/billing/payment/payment.service.ts`: Core service logic for payments and refunds.
* `backend/api/src/billing/payment/payment.module.ts`: NestJS module exporting `PaymentService`.
* `backend/api/src/billing/payment/payment.spec.ts`: 39 comprehensive tests including concurrency and rollback.
* `docs/super-admin/implementation/PHASE-2.7-PAYMENT-SERVICE-REPORT.md`: This authoritative report.

### Modified Files:
* `packages/shared-types/src/enums.ts`: Added `PaymentProvider` and `PaymentStatus` enums.
* `backend/api/src/billing/ledger/ledger.types.ts`: Added `RefundCreditParams` interface.
* `backend/api/src/billing/ledger/ledger.service.ts`: Added `refundCredits` method encapsulating authoritative refund ledger entries, pool row-locking, and balance assertion.
* `backend/api/src/app.module.ts`: Registered `PaymentModule`.

---

## 13. Remaining Issues

**None.** Zero unresolved issues, zero compiler warnings, zero failing tests.

---

## 14. Explicit Hard Stop

PaymentService is complete, verified, and strictly gated.

**Implementation stops before `PaymentWebhookService` (Stage 2.8).**

Do not implement webhook HTTP ingress, HMAC verification, BullMQ payment workers, reconciliation, finance metrics, or UI controllers until authorized.
