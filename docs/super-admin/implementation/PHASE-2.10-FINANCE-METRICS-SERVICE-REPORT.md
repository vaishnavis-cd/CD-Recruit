# Phase 2 — Billing Engine: Stage 2.10 Implementation Report
## FinanceMetricsService Architecture-Gated Implementation & Analytical Verification

**Date:** 2026-09-30  
**Status:** PASS ✅  
**Regression Baseline:** 334 / 334 tests passing  
**New Tests Added:** 18 tests (Tests A through R)  
**Final Verified Suite Total:** **352 / 352 tests passing (100% PASS, 0 failures)**  
**Prisma Validation:** PASS (`schema.prisma` is valid)  
**Database Migration State:** PASS (28 migrations applied, 0 schema drift)  
**Build Status:** Shared build PASS, Backend API build PASS (`npm run build` cleanly compiled)  
**Database Baseline:** Pristine (Acme: 50 cr, Globex: 50 cr, 0 overdraft, 0 orphan records, triggers active)  
**Strict Hard Stop:** STOP REACHED before Stage 2.11 (Controllers / API Layer)

---

### 1. Implementation Status

The **`FinanceMetricsService`** (Stage 2.10) has been implemented and fully verified against all financial invariants, business rules, and architecture contracts specified in the authoritative Super Admin design documents.

The service functions strictly as an **analytical/read-model service**:
```text
Payment
CreditPool
CreditLedgerEntry
BillingAccount
PriceBookEntry
SessionBillingEvidence
ReconciliationRun
        ↓
FinanceMetricsService (Read-Only Analytical Queries in REPEATABLE READ READ ONLY)
        ↓
Deterministic Metrics / Dashboard DTOs
```

Under zero circumstances does `FinanceMetricsService`:
- Become `LedgerService` or mutate ledger balances
- Become `ReconciliationService` or duplicate the 7 reconciliation integrity checks
- Become `PaymentService` or handle payment lifecycle mutations
- Create cached financial balances or secondary journals
- Execute automatic repairs or overdraft mutations

---

### 2. All Authoritative Design Documents Re-Read

All foundational and billing architecture documents were inspected and strictly adhered to:

| Artifact | Verification Focus | Result / Compliance |
|---|---|---|
| `01-half2-domain-and-scope.md` | Billing engine scope, read-model telemetry, ledger primacy. | Fully compliant. Operates as read-only telemetry engine. |
| `02-half2-business-rules-and-invariants.md` | Core invariants: zero overdraft (ADR-004), integer minor units, ledger as sole truth. | Arithmetic in integer minor units; zero overdraft enforced; ledger authoritative. |
| `03-half2-database-schema.md` | Schema for `billing.payment`, `billing.credit_pool`, `billing.credit_ledger_entry`, `billing.price_book_entry`, `billing.reconciliation_run`. | Read directly from existing PostgreSQL schema without modification. Zero migrations required. |
| `04-half2-services-and-api-contracts.md` | Finance metrics service contract and telemetry operations. | Implemented all documented metric queries and DTOs. |
| `05-half2-api-catalogue-and-page-specifications.md` | Finance Dashboard, period filtering, currency grouping, reconciliation status card. | DTO shapes directly serve dashboard endpoints: overview, payments, credits, revenue, utilization, reconciliation. |
| `06-half2-state-permission-and-audit-matrix.md` | RBAC: Platform `OWNER`, `FINANCE`, `SUPPORT` view privileges; non-staff forbidden. | Role enforcement implemented via actor assertion; recruiter tokens rejected. |
| `07-half1-half2-integration-contract.md` | Session billing telemetry; complete candidate PII masking. | Complete PII blinding. Zero candidate names, emails, phones, or profile data. |
| `DESIGN-DECISIONS.md` | ADR-001 (multi-currency isolation), ADR-004 (permanent elimination of overdraft), ADR-007 (historical pricing preservation). | Currencies isolated; overdraft monitored as risk exposure; historical pricing preserved via Payment.priceBookEntry. |
| `DESIGN-OPEN-QUESTIONS.md` | Multi-currency aggregation and FX conversion gap. | Documented currency separation policy; never sum INR + USD into a single figure. |
| `DESIGN-READINESS-REPORT.md` | Non-blocking snapshot isolation for metric aggregation. | Multi-query overview executed inside `REPEATABLE READ READ ONLY` transaction snapshot. |

---

### 3. Previous Stage Reports Verified

All preceding stage implementation reports were inspected and confirmed:
- Stage 2.1 LedgerService (`PHASE-2-BILLING-CURRENT-STATE-REAUDIT.md`): PASS
- Stage 2.2 BillingAccountService: PASS
- Stage 2.3 CreditPoolService: PASS
- Stage 2.4 TrialGrantService: PASS
- Stage 2.5 ManualBillingRequestService: PASS
- Stage 2.6 PriceBookService: PASS
- Stage 2.7 PaymentService (`PHASE-2.7-PAYMENT-SERVICE-REPORT.md`): PASS
- Stage 2.8 PaymentWebhookService (`PHASE-2.8-PAYMENT-WEBHOOK-SERVICE-REPORT.md`): PASS
- Stage 2.9 ReconciliationService (`PHASE-2.9-RECONCILIATION-SERVICE-REPORT.md`): PASS

---

### 4. Exact Service Contract Implemented

`FinanceMetricsService` exposes the following strongly-typed analytical operations:

```typescript
@Injectable()
export class FinanceMetricsService {
  // Period helper
  resolvePeriod(filter?: PeriodFilterDto): ResolvedPeriod;

  // Domain metric methods
  async getPaymentMetrics(actor: StaffActor, filter?: PeriodFilterDto): Promise<PaymentMetricsDto>;
  async getCreditMetrics(actor: StaffActor, filter?: PeriodFilterDto): Promise<CreditMetricsDto>;
  async getRevenueMetrics(actor: StaffActor, filter?: PeriodFilterDto): Promise<RevenueMetricsDto>;
  async getUtilizationMetrics(actor: StaffActor, filter?: PeriodFilterDto): Promise<UtilizationMetricsDto>;
  async getRiskExposure(actor: StaffActor): Promise<RiskExposureDto>;
  async getReconciliationSummary(actor: StaffActor): Promise<ReconciliationSummaryDto>;

  // Aggregated coherent dashboard overview (REPEATABLE READ READ ONLY snapshot)
  async getFinancialOverview(actor: StaffActor, filter?: PeriodFilterDto): Promise<FinancialOverviewDto>;

  // Account-level finance metrics
  async getAccountMetrics(actor: StaffActor, billingAccountId: string, filter?: PeriodFilterDto): Promise<AccountFinanceMetricsDto>;
}
```

---

### 5. Metric Definitions

Every metric produced by `FinanceMetricsService` is precisely defined from authoritative billing records:

| Metric | Source Table | Source Column(s) | Inclusion Criteria | Exclusion Criteria |
|---|---|---|---|---|
| **Total Payments** | `billing.payment` | `id` | All payments matching period/account filter | None |
| **Captured Payments** | `billing.payment` | `id`, `captured_at` | `status = 'CAPTURED'` | Failed, created, refunded, disputed |
| **Refunded Payments** | `billing.payment` | `id`, `refunded_at` | `status = 'REFUNDED'` | Captured, failed, created |
| **Failed Payments** | `billing.payment` | `id` | `status = 'FAILED'` | Successful payments |
| **Disputed Payments** | `billing.payment` | `id` | `status = 'DISPUTED'` | Undisputed payments |
| **Pending Payments** | `billing.payment` | `id` | `status = 'CREATED'` | Terminal payments |
| **Captured Revenue** | `billing.payment` | `amount_minor`, `currency` | `status = 'CAPTURED'` | Uncaptured, failed, created |
| **Refunded Revenue** | `billing.payment` | `amount_minor`, `currency` | `status = 'REFUNDED'` | Unrefunded payments |
| **Net Revenue** | `billing.payment` | `amount_minor` | `capturedRevenueMinor - refundedRevenueMinor` | Non-revenue payments |
| **Credits Granted** | `billing.credit_ledger_entry` | `amount` | `type = 'GRANT' AND amount > 0` | Consumptions, expirations, refunds |
| **Credits Consumed** | `billing.credit_ledger_entry` | `amount` | `type = 'CONSUME' AND amount < 0` | Grants, expirations, refunds |
| **Credits Expired** | `billing.credit_ledger_entry` | `amount` | `type = 'EXPIRE' AND amount < 0` | Grants, consumptions, active |
| **Credits Refunded** | `billing.credit_ledger_entry` | `amount` | `type = 'REFUND' AND amount > 0` | Grants, consumptions |
| **Current Remaining Credits** | `billing.credit_pool` | `cached_remaining` | `status = 'ACTIVE' AND cached_remaining > 0` | Depleted, expired pools |
| **Trial Credits Remaining** | `billing.credit_pool` | `cached_remaining` | `source = 'PROMOTIONAL_TRIAL'` | Commercial purchase pools |
| **Purchased Credits Remaining**| `billing.credit_pool` | `cached_remaining` | `source IN ('PURCHASE_ONLINE', 'ENTERPRISE_GRANT')` | Trial, manual adjustment |
| **Billed Sessions** | `billing.session_billing_evidence`| `session_id` | All unique sessions billed in period | None |
| **Active Billing Accounts** | `billing.billing_account` | `id` | `status = 'ACTIVE'` | Suspended, closed accounts |

---

### 6. Payment Metrics

Built strictly from actual `Payment` records in `billing.payment`:
- **Captured Payments Count:** Only payments with `status = 'CAPTURED'`.
- **Captured Revenue:** Computed per currency bucket in integer minor units.
- **Created/Unpaid Payments (`CREATED`):** Explicitly categorized as pending; contributes **0** to captured revenue.
- **Failed Payments (`FAILED`):** Contributes **0** to captured revenue.
- **Disputed Payments (`DISPUTED`):** Tracked separately; isolated from net captured revenue.
- **Refunds:** Tracked as `refundedCount` and `refundedRevenueMinor`, deducted cleanly to calculate `netRevenueMinor` without double-counting original captured amounts.

---

### 7. Credit Metrics

Built directly from `billing.credit_ledger_entry` (the sole financial truth) and `billing.credit_pool`:
- **Grants:** `SUM(amount)` where `type = 'GRANT'`.
- **Consumptions:** `ABS(SUM(amount))` where `type = 'CONSUME'`.
- **Expirations:** `ABS(SUM(amount))` where `type = 'EXPIRE'`.
- **Refunds:** `SUM(amount)` where `type = 'REFUND'`.
- **Current Balance:** Sourced from active pool balances (`cached_remaining`), verified against ledger invariant `cached_remaining = sum(ledger entries)`.
- **Classification:** Strictly segregates promotional trial credits (`source = 'PROMOTIONAL_TRIAL'`) from commercial purchased credits (`source IN ('PURCHASE_ONLINE', 'ENTERPRISE_GRANT')`).

---

### 8. Revenue & Money Metrics

- **Integer Minor Units:** All monetary aggregations (`amountMinor`, `taxMinor`, `capturedMinor`, `refundedMinor`, `netMinor`) are represented as integers (minor units / cents / paise). Zero floating-point math is used.
- **Multi-Currency Safety:**
  - `FinanceMetricsService` **never** sums INR and USD into a unified scalar figure.
  - Every revenue metric returns a dictionary of `Record<string, CurrencyRevenueDto>` keyed by currency code (e.g. `'INR'`, `'USD'`).
  - Net revenue per currency: `netMinor = capturedMinor - refundedMinor`.

---

### 9. Historical Price Handling

- Per ADR-007, when financial metrics or revenue breakdowns reflect historical transactions, the unit price and tier economics are derived from the `PriceBookEntry` **linked directly to the `Payment` record** (`payment.priceBookEntryId`).
- The service **never** retroactively applies today's active price book entry to historical transactions. If an entry had a unit price of 4,000 INR minor units when a payment was captured, the historical metric preserves that exact historical unit price even if the active price book is currently 5,000 INR minor units.

---

### 10. Utilization Metrics

Calculates aggregate operational throughput without candidate PII exposure:
- **Total Sessions Billed:** Count of records in `billing.session_billing_evidence`.
- **Total Sessions Consuming Credits:** Sessions resulting in a confirmed `CONSUME` ledger entry.
- **Active Billing Accounts:** Count of accounts in `billing.billing_account` with `status = 'ACTIVE'`.
- **Active Pools:** Count of pools in `billing.credit_pool` with `status = 'ACTIVE'`.
- **Depleted Pools:** Count of pools with `status = 'DEPLETED'` or `cached_remaining = 0`.
- **Expired Pools:** Count of pools with `status = 'EXPIRED'`.
- **Consumption Rate:** Computed as `creditsConsumed / (creditsConsumed + currentAvailableCredits)` safely handling division by zero.

---

### 11. Period Semantics & Date Filtering

- **Boundary Standard:** Half-open UTC intervals:
  ```text
  [startInclusive, endExclusive)
  ```
- **Supported Period Types:**
  - `TODAY`: From 00:00:00.000 UTC today to 00:00:00.000 UTC tomorrow.
  - `CURRENT_WEEK`: From Monday 00:00:00.000 UTC to next Monday 00:00:00.000 UTC.
  - `CURRENT_MONTH`: From 1st of current month 00:00:00.000 UTC to 1st of next month 00:00:00.000 UTC.
  - `PREVIOUS_MONTH`: From 1st of previous month 00:00:00.000 UTC to 1st of current month 00:00:00.000 UTC.
  - `CUSTOM`: Caller-provided explicit `startDate` and `endDate` boundaries.
  - `ALL_TIME`: No date boundary constraints applied.
- **Timezone Standard:** Strict UTC throughout. No reliance on server local time.

---

### 12. Reconciliation Integration

- Integrates directly with `ReconciliationService.getLatestRun()`:
  - If a run exists, surfaces `runId`, `runType`, `status`, `driftDetected`, `failureCount`, `warningCount`, `executedAt`, `executedBy`, and `topFindings`.
  - **Does not** duplicate or re-execute the 7 reconciliation integrity checks.
  - **Honest Empty State:** If no reconciliation run has occurred, returns `status: 'UNAVAILABLE'` with `driftDetected: false` and explanatory message. It **never fabricates** a "healthy" status.

---

### 13. Empty-State Semantics

- Distinguishes legitimate zero from unavailable/no-data:
  - Zero captured payments = `{ totalPayments: 0, capturedPayments: 0, byCurrency: {} }` (legitimate zero).
  - Empty currency set = `{}` (no fabricated currencies).
  - No reconciliation runs = `status: 'UNAVAILABLE'` (not `HEALTHY`).
  - Clean accounts with zero overdraft = `accountsWithOverdraftCount: 0, totalOverdraftUsed: 0`.

---

### 14. Query Design & Performance

- **Database-Side Aggregation:** Uses SQL aggregation (`COUNT(*)`, `COALESCE(SUM(amount), 0)`, `GROUP BY currency, status`) instead of streaming raw records into Node memory.
- **Index Alignment:** All queries filter on indexed fields:
  - `billing.payment`: `status`, `currency`, `created_at`, `billing_account_id`
  - `billing.credit_ledger_entry`: `type`, `created_at`, `billing_account_id`
  - `billing.credit_pool`: `status`, `source`, `billing_account_id`
  - `billing.reconciliation_run`: `created_at DESC`
- **Zero Schema Drift:** No additional migrations or indexes were required; existing composite indexes satisfy all analytical query filters.

---

### 15. Consistency Model & Snapshot Isolation

For the multi-query dashboard snapshot (`getFinancialOverview`), `FinanceMetricsService` executes all metric sub-queries inside a single PostgreSQL read-only transaction:
```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
```
- Guarantees that payment metrics, ledger aggregates, credit pool totals, and risk exposure represent an **internally coherent snapshot** of the database at a single logical point in time.
- Prevents race conditions and phantom drift between independent query results.
- Purely read-only; never locks tables or blocks concurrent payment processing or ledger consumption.

---

### 16. Read-Only Guarantee

`FinanceMetricsService` is strictly read-only:
- Executes zero `INSERT`, `UPDATE`, or `DELETE` statements on financial tables.
- Does not modify `Payment`, `CreditPool`, `CreditLedgerEntry`, `BillingAccount`, `PriceBookEntry`, or `SessionBillingEvidence`.
- Emits zero financial audit entries for dashboard views (per Artifact 06).
- Verified by Test Q: before/after database snapshot confirms zero mutations across all tables.

---

### 17. Permissions & Authorization

- **Staff-Only Guard:** Rejects recruiter/candidate JWTs. Only platform staff identities are permitted.
- **Role Enforcement:**
  - `OWNER` and `FINANCE`: Full access to all financial overview, payment, revenue, credit, and risk metrics.
  - `SUPPORT`: Permitted to view operational telemetry and account-level metrics; restricted where financial policy requires.
  - Non-staff actors: Throws `ForbiddenException: Access denied: Platform staff role required`.

---

### 18. Candidate PII Protection

- **Complete PII Blindness:** Metric outputs contain zero candidate names, email addresses, phone numbers, resumes, or profile data.
- **Aggregate Identifiers Only:** Metrics return aggregate counts, currency totals, credit numbers, or platform-level identifiers (`billingAccountId`, `sessionId`).
- Verified by Test R: JSON serialization of overview telemetry contains zero PII keys or substrings.

---

### 19. Architecture-Gated Test Suite (18 Tests)

The test suite `backend/api/src/billing/metrics/finance-metrics.spec.ts` exercises all required analytical scenarios:

| Test ID | Name / Description | Verified Invariant | Status |
|---|---|---|---|
| **Test A** | Clean Baseline | Acme and Globex baseline accounts reflect initial 50 credits each, 0 payments, 0 overdraft. | PASS ✅ |
| **Test B** | Captured Payment | Captured payment contributes to captured payment count and captured revenue minor units. | PASS ✅ |
| **Test C** | Failed Payment | Failed payment contributes to failed payment count but contributes exactly 0 to captured revenue. | PASS ✅ |
| **Test D** | Created / Unpaid Payment | Created payment is counted as pending and contributes exactly 0 to captured revenue. | PASS ✅ |
| **Test E** | Refund Handling | Refund correctly populates refund count and refund amount; net revenue equals captured minus refunded. | PASS ✅ |
| **Test F** | Multi-Currency Isolation | INR and USD payments remain strictly isolated in separate currency buckets; never summed. | PASS ✅ |
| **Test G** | Historical Price Book Preservation | Revenue metrics respect the unit price linked directly to Payment.priceBookEntry, not current active price. | PASS ✅ |
| **Test H** | Credit Grants | Ledger GRANT entries are accurately aggregated into total credits granted. | PASS ✅ |
| **Test I** | Credit Consumption | Ledger CONSUME entries are accurately aggregated into total credits consumed. | PASS ✅ |
| **Test J** | Credit Expiration | Ledger EXPIRE entries are accurately aggregated into total credits expired. | PASS ✅ |
| **Test K** | Promotional vs Commercial Credits | Trial credits and commercial purchased credits are segregated accurately. | PASS ✅ |
| **Test L** | Period Boundary Precision | Half-open intervals `[start, end)` correctly partition transactions occurring at exact boundaries. | PASS ✅ |
| **Test M** | Empty State / No-Data Handling | Empty period produces legitimate zero counts and empty currency objects rather than fabricating data. | PASS ✅ |
| **Test N** | Reconciliation Summary Integration | Latest reconciliation run status and findings are surfaced correctly from ReconciliationService. | PASS ✅ |
| **Test O** | Honest Empty Reconciliation State | When no reconciliation run exists, returns `UNAVAILABLE` status rather than fabricating "healthy". | PASS ✅ |
| **Test P** | Concurrent Read Safety | Analytical queries execute safely in `REPEATABLE READ READ ONLY` without blocking transactions. | PASS ✅ |
| **Test Q** | Read-Only Guarantee | Executing metrics leaves payments, pools, ledger, accounts, and evidence completely unmodified. | PASS ✅ |
| **Test R** | Candidate PII Safety | Output contains zero candidate names, emails, phone numbers, or candidate-identifying metadata. | PASS ✅ |

---

### 20. Baseline Regression Gate (352 / 352 Tests Passing)

All 13 test suites were executed sequentially against the PostgreSQL database:

```text
================================================================================
FULL PLATFORM REGRESSION SUITE RUN
================================================================================

1. Foundation Gate:            20 / 20 PASS
2. Platform Authentication:     17 / 17 PASS
3. Platform Audit:             17 / 17 PASS
4. LedgerService:              32 / 32 PASS
5. BillingAccountService:      29 / 29 PASS
6. CreditPoolService:          31 / 31 PASS
7. TrialGrantService:          22 / 22 PASS
8. ManualBillingRequestService:47 / 47 PASS
9. PriceBookService:           47 / 47 PASS
10. PaymentService:            39 / 39 PASS
11. PaymentWebhookService:     20 / 20 PASS
12. ReconciliationService:     13 / 13 PASS
13. FinanceMetricsService:     18 / 18 PASS

--------------------------------------------------------------------------------
Previous Total:  334 tests
New Stage Tests:  18 tests
Final Total:     352 tests (352 / 352 PASS — 100% SUCCESS, 0 FAILURES)
================================================================================
```

---

### 21. Database, Schema, and Build Verification

| Verification Step | Command | Result |
|---|---|---|
| Prisma Schema Validity | `npx prisma validate` | `The spec file "schema.prisma" is valid` ✅ |
| Database Migration Status | `npx prisma migrate status` | `Database schema is up to date (28 migrations, 0 drift)` ✅ |
| Shared Build | `npm run build:shared` | `@cd-recruit/shared` build succeeded ✅ |
| Backend API Build | `npm run build` | `@cd-recruit/api` build (`nest build`) succeeded cleanly ✅ |

---

### 22. Database Baseline Verification

Direct inspection of PostgreSQL on `127.0.0.1:5434/cdrecruit` following all tests confirms:

```text
================================================================================
DIRECT DATABASE BASELINE INSPECTION
================================================================================
Acme Account: id=03579bc4-69c0-4fa6-affe-4a22b0e7ace3, name=Acme Corporation, status=ACTIVE, overdraftLimit=0, overdraftUsed=0
Acme Total Credits: 50, Pools: 1
Globex Account: id=b026e179-8d9e-447f-85da-8312c75099fe, name=Globex Industries, status=ACTIVE, overdraftLimit=0, overdraftUsed=0
Globex Total Credits: 50, Pools: 1
Accounts with non-zero overdraft: 0
Seed pool balances & ledger sums:
  - Acme Pool (eb2e4d1a-b1ad-46d8-bf8a-609a75cabd62): cached_remaining=50, ledger_sum=50
  - Globex Pool (faa7f15c-3259-4f18-abfb-af91cfc4d1eb): cached_remaining=50, ledger_sum=50
Total billing accounts in DB: 2 (Acme Corporation, Globex Industries)
Total credit pools in DB: 2
Total payments in DB: 0
Total ledger entries in DB: 2 (Initial seed grants of 50 credits each)
Database Triggers Active:
  - trg_ledger_append_only: ENABLED (O)
  - trg_billing_audit_append_only: ENABLED (O)
  - trg_guard_credit_pool: ENABLED (O)
  - trg_session_evidence_append_only: ENABLED (O)
```

Zero test pollution. Zero orphan financial records. Baseline is pristine.

---

### 23. Files Created and Modified

#### Files Created:
1. `backend/api/src/billing/metrics/finance-metrics.types.ts`:
   - DTOs, period interfaces, currency revenue structures, risk exposure, and overview types.
2. `backend/api/src/billing/metrics/finance-metrics.service.ts`:
   - Complete implementation of read-only metric queries, `REPEATABLE READ READ ONLY` snapshot isolation, period resolution, and role validation.
3. `backend/api/src/billing/metrics/finance-metrics.module.ts`:
   - Module declaration importing `PrismaModule` and `ReconciliationModule`, exporting `FinanceMetricsService`.
4. `backend/api/src/billing/metrics/finance-metrics.spec.ts`:
   - Architecture-gated test suite covering Tests A through R (18 tests).
5. `docs/super-admin/implementation/PHASE-2.10-FINANCE-METRICS-SERVICE-REPORT.md`:
   - Authoritative implementation and verification report.

#### Files Modified:
1. `backend/api/src/app.module.ts`:
   - Registered `FinanceMetricsModule` in the root NestJS application module imports.

---

### 24. Known Limitations

1. **FX Conversion Policy:** The platform does not currently define an automated foreign exchange (FX) conversion feed. Revenue is strictly isolated by currency (`INR`, `USD`). Multi-currency cross-summing must not be attempted until an authoritative exchange rate service is specified.
2. **Controller & UI Layer:** Stage 2.10 implements strictly the service and analytical read model. REST API controllers, OpenAPI decorators, and frontend dashboards are intentionally deferred to subsequent stages.

---

### 25. Final Hard-Stop Statement

```text
================================================================================
STAGE 2.10 FinanceMetricsService — PASS
STRICT STOP REACHED — STOP BEFORE STAGE 2.11 CONTROLLERS / API LAYER
================================================================================
```
No billing controllers, frontend dashboards, or API endpoints have been implemented ahead of time. All gates, tests, builds, and invariants are fully satisfied and verified.
