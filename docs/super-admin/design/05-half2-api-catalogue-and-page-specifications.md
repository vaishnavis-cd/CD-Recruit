# Artifact 05: API Catalogue and Page Specifications

**Document:** `docs/super-admin/design/05-half2-api-catalogue-and-page-specifications.md`  
**Classification:** Frontend/Backend Integration Contract & UI Specification  
**System:** Proctora / CD-Recruit Platform Ops Console (`frontend/super-admin-web`)  
**Authoritative Precedence:** `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` v3 > `super-admin-intent.md` > `CD-Recruit_Super_Admin_Scope_and_Split.md`  

---

# Part A — Complete API Catalogue

### Half 2 Commercial & Billing APIs
 
| API ID | Method | Route | Purpose | Permission / Role | Primary Consumer | Backing Service |
|---|---|---|---|---|---|---|
| **API-H2-01** | `GET` | `/platform/billing/accounts` | Paginated list of billing accounts with remaining balances, overdraft, and status. | `ADMIN`, `SUPER_ADMIN` | H2.1 Billing Accounts | `BillingAccountService` |
| **API-H2-02** | `GET` | `/platform/billing/accounts/:id` | Full detail of a single billing account, including tax ID, currency, and pools. | `ADMIN`, `SUPER_ADMIN` | H2.1 Detail, H1.3 360 | `BillingAccountService` |
| **API-H2-03** | `GET` | `/platform/billing/accounts/:id/summary` | Lightweight financial snapshot (balances, pools, badges) for Tenant 360 view. | `ADMIN`, `SUPER_ADMIN` | H1.3 Tenant 360 | `BillingAccountService` |
| **API-H2-04** | `GET` | `/platform/billing/accounts/:id/pools` | List all credit pools (active, queued, exhausted) for an account. | `ADMIN`, `SUPER_ADMIN` | H2.1 Detail, H2.2 Pools | `CreditPoolService` |
| **API-H2-05** | `GET` | `/platform/billing/pools/:id` | Deep inspection of a single credit pool (validity, terms, ledger entries). | `ADMIN`, `SUPER_ADMIN` | H2.2 Pool Detail | `CreditPoolService` |
| **API-H2-06** | `GET` | `/platform/billing/ledger` | Searchable, pseudonymous ledger explorer with filters. | `ADMIN`, `SUPER_ADMIN` | H2.3 Ledger Explorer | `LedgerService` |
| **API-H2-07** | `GET` | `/platform/billing/ledger/export` | Download pseudonymous billing CSV (strictly UUIDs, zero candidate PII). | `ADMIN`, `SUPER_ADMIN` | H2.3 Ledger Explorer | `LedgerService` |
| **API-H2-08** | `GET` | `/platform/billing/requests` | List maker-checker manual requests across tabs (My, Awaiting, All). | `ADMIN`, `SUPER_ADMIN` | H2.4 Manual Requests | `ManualBillingRequestService` |
| **API-H2-09** | `POST` | `/platform/billing/requests` | Create a new manual billing request (GRANT, ADJUST, REFUND, EXTEND). | `ADMIN`, `SUPER_ADMIN` | H2.4, H1.3 360 | `ManualBillingRequestService` |
| **API-H2-10** | `POST` | `/platform/billing/requests/:id/approve` | Approve and execute request through `LedgerService` ($\text{approver} \ne \text{requester}$). | `SUPER_ADMIN` (Finance) | H2.4 Manual Requests | `ManualBillingRequestService` |
| **API-H2-11** | `POST` | `/platform/billing/requests/:id/reject` | Reject request with mandatory reason note. | `SUPER_ADMIN` (Finance) | H2.4 Manual Requests | `ManualBillingRequestService` |
| **API-H2-12** | `POST` | `/platform/billing/requests/:id/cancel` | Cancel own pending request before decision. | `ADMIN`, `SUPER_ADMIN` | H2.4 Manual Requests | `ManualBillingRequestService` |
| **API-H2-13** | `POST` | `/platform/billing/requests/:id/retry` | Safely retry execution of approved request using deterministic idempotency key. | `SUPER_ADMIN` (Finance) | H2.4 Manual Requests | `ManualBillingRequestService` |
| **API-H2-14** | `GET` | `/platform/billing/pricing` | View versioned Price Book catalog by country. | `ADMIN`, `SUPER_ADMIN` | H2.5 Price Book | `PriceBookService` |
| **API-H2-15** | `POST` | `/platform/billing/pricing` | Publish a new immutable Price Book entry version. | `SUPER_ADMIN` (Finance) | H2.5 Price Book | `PriceBookService` |
| **API-H2-16** | `GET` | `/platform/billing/payments` | Paginated payments and invoices list with webhook audit status. | `ADMIN`, `SUPER_ADMIN` | H2.6 Payments Console | `PaymentService` |
| **API-H2-17** | `POST` | `/platform/billing/payments/manual-invoice` | Record offline Enterprise PO payment and mint `CONTRACT` pool. | `SUPER_ADMIN` (Finance) | H2.6 Payments Console | `PaymentService` |
| **API-H2-18** | `POST` | `/billing/webhooks/:provider` | Public gateway webhook receiver (Razorpay / Stripe) on public API ingress. | Signature Header | Public Gateway | `PaymentWebhookService` |
| **API-H2-19** | `POST` | `/platform/billing/payments/replay-webhook` | Idempotently replay a failed or stuck webhook event from the inbox table. | `SUPER_ADMIN` (Finance) | H2.6 Payments Console | `PaymentWebhookService` |
| **API-H2-20** | `GET` | `/platform/finance/metrics` | Platform-wide financial aggregates, margin alarms, uncollateralized debt. | `SUPER_ADMIN` (Finance) | H2.7 Finance Dashboard | `FinanceMetricsService` |
| **API-H2-21** | `GET` | `/platform/billing/reconciliation/latest` | Latest 7-point automated reconciliation run results and drift status. | `ADMIN`, `SUPER_ADMIN` | H2.8 Integrity & Recon | `ReconciliationService` |
| **API-H2-22** | `POST` | `/platform/billing/reconciliation/run` | Manually trigger a 7-point ledger replay audit. | `SUPER_ADMIN` (Finance) | H2.8 Integrity & Recon | `ReconciliationService` |
| **API-H2-23** | `GET` | `/platform/billing/incidents` | List declared incident windows and remediation status. | `ADMIN`, `SUPER_ADMIN` | H2.8 Integrity & Recon | `LedgerService` |
| **API-H2-24** | `POST` | `/platform/billing/incidents` | Declare an incident window and trigger automated T3 session credit reversals. | `SUPER_ADMIN` (Finance) | H2.8 Integrity & Recon | `LedgerService` |

---

# Part B — Page Specifications

---

## H2.1 Billing Accounts (`/billing/accounts` & `/billing/accounts/:id`)

### 1. Overview & Purpose
- **Route:** `/billing/accounts` (List) and `/billing/accounts/:id` (Account Detail).
- **Purpose:** Central registry for inspecting every payer entity on the platform. Displays real-time credit balances, overdraft exposure, linked organizations, and active pools.
- **Allowed Roles:** `ADMIN` (Support), `SUPER_ADMIN` (Finance).
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Billing** $\rightarrow$ **Accounts**.

### 2. Data Shown & API Dependencies
- Backed by `API-H2-01` (List) and `API-H2-02` (Detail).
- **List Columns:** Account Name, Country/Currency, Status (`ACTIVE`, `RESTRICTED`, `SUSPENDED`), Total Available Credits, Overdraft Debt vs. Limit, Paid Status Badge, Created Date.
- **Detail Header:** Legal Entity Name, Verified Tax ID (GSTIN/EIN), Billing Country, Currency, Overall Reconciliation Badge ("Reconciled as of 02:00 AM").
- **Detail Tabs:**
  - *Pools:* Active, queued, and expired pools with cached remaining credits.
  - *Linked Organizations:* Workspaces funded by this account.
  - *Recent Transactions:* Last 10 ledger entries.
  - *Requests History:* Maker-checker requests filed for this account.

### 3. User Actions & Workflows
- **Search & Filter:** Instant search by name, tax ID, or UUID; filter by country, status, or zero-balance.
- **Action: "Request Overdraft Adjustment"** $\rightarrow$ Opens modal filing a `ManualBillingRequest` of kind `OVERDRAFT_LIMIT`. Prefills account ID; prompts for new limit, ticket reference, and business reason.
- **Action: "Request Status Change"** $\rightarrow$ Opens modal filing an `ACCOUNT_STATUS` request (`RESTRICTED` / `SUSPENDED`).
- **Destructive Action Guards:** Direct status or balance toggles are disabled; every state mutation requires maker-checker approval.

### 4. UI States & Edge Cases
- **Loading State:** Skeleton table with 10 rows.
- **Empty State:** "No billing accounts found matching query."
- **Restricted Badge:** Red alert badge if `status === 'RESTRICTED'` (overdraft aged $>14$ days).
- **Deep Links to Half 1:** Clicking a linked organization navigates directly to `H1.3 Tenant 360` (`/tenants/:orgId`).

---

## H2.2 Credit Pool Detail (`/billing/pools/:id`)

### 1. Overview & Purpose
- **Route:** `/billing/pools/:id`
- **Purpose:** Deep diagnostic and forensic view of an individual credit pack. Reveals validity countdown, terms acceptance proof, linked payment, and drawdown history.
- **Allowed Roles:** `ADMIN`, `SUPER_ADMIN`.
- **Navigation Placement:** Reached via drilldown from `H2.1 Billing Accounts` or `H1.3 Tenant 360`.

### 2. Data Shown & API Dependencies
- Backed by `API-H2-05`.
- **Card 1: Commercial Snapshot:** Total Credits (Immutable), Cached Remaining, Unit Price Minor, Currency, Source (`PURCHASE`, `TRIAL`, `CONTRACT`, `GOODWILL`), Pool Type (`DRIVE_PASS` vs `TALENT_RESERVE`).
- **Card 2: Validity & Countdown:** Purchased Date, Clock Started At, Activated At, Expires At, Days Remaining, Queue Order.
- **Card 3: Legal & Commercial Evidence:** Linked Payment ID, Invoice Number, Terms Version accepted, Terms Accepted By (email snapshot), Accepted At timestamp.
- **Table: Pool Drawdown Ledger:** All `CONSUME`, `REVERSAL`, and `EXPIRE` entries specific to this pool.

### 3. User Actions & Workflows
- **Action: "Extend Expiry"** $\rightarrow$ Opens modal. Requires Support/CRM ticket reference and new date.
  - Submits a `ManualBillingRequest` of kind `EXPIRY_EXTEND`.
  - Explanatory banner: *"Extending pool expiration requires maker-checker approval by Finance."*
- **Immutable Fields:** Fields `total_credits`, `unit_price_minor`, `purchased_at`, and `payment_id` render with a locked padlock icon and tooltip: *"Commercial terms frozen at purchase time."*

---

## H2.3 Ledger Explorer (`/billing/ledger`)

### 1. Overview & Purpose
- **Route:** `/billing/ledger`
- **Purpose:** The platform's authoritative financial audit explorer. Inspects every balance change with complete traceability to actors, sessions, and payments.
- **Allowed Roles:** `ADMIN`, `SUPER_ADMIN`.
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Billing** $\rightarrow$ **Ledger Explorer**.

### 2. Data Shown & API Dependencies
- Backed by `API-H2-06` and `API-H2-07` (CSV Export).
- **Columns:** Timestamp (`clock_timestamp`), Entry Type Badge (`GRANT` green, `CONSUME` neutral, `OVERDRAFT` red, `REVERSAL` blue), Amount, Balance After, Account ID, Pool ID, Reason Code, Session UUID, Drive UUID, Actor ID.
- **Row Expansion:** Shows full raw metadata: `idempotency_key`, `related_entry_id`, `request_id`, `payment_id`, and `shadow` flag.

### 3. Filters & Controls
- **Filters Bar:**
  - Date Range Picker (presets: Today, 7D, 30D, Custom).
  - Entry Type Multi-Select (`GRANT`, `CONSUME`, `OVERDRAFT`, `REVERSAL`, etc.).
  - Reason Code Multi-Select.
  - Search Input: By Account UUID, Session UUID, Drive UUID, or Idempotency Key.
  - Shadow Mode Toggle: Default **OFF** (Hides `shadow = true` rows).
- **Action: "Export Billing CSV"** $\rightarrow$ Triggers streaming download of pseudonymous CSV.
- **Strict Guardrail (R5 / R7):** No candidate names or email addresses can be resolved or viewed from this screen.

---

## H2.4 Manual Requests (Maker-Checker Queue) (`/billing/requests`)

### 1. Overview & Purpose
- **Route:** `/billing/requests`
- **Purpose:** The highest-stakes screen in the entire console. Every discretionary manual credit action, adjustment, refund, or policy override must be approved here by a second human actor.
- **Allowed Roles:** `ADMIN` (Can create/view), `SUPER_ADMIN` (Can approve/reject).
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Billing** $\rightarrow$ **Maker-Checker Queue**.
- **Badge Counter:** Real-time red badge on sidebar indicating number of requests in `PENDING` state.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MAKER-CHECKER THREE-TAB QUEUE                                   │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ [Awaiting My Approval]   │ [My Requests]               │ [All Requests History]        │
│ Items needing my action  │ Items I submitted           │ Full historical audit log     │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

### 2. Workflow & Approval Interface
- **Tab 1: Awaiting My Approval:** Displays pending requests submitted by **other** operators.
  - Requests pending $>24\text{ hours}$ render with an amber SLA warning banner.
  - **Self-Approval Prohibition:** If logged-in user is `requested_by_id`, the Approve button is disabled with tooltip: *"Rule R8 Violation: Requester cannot approve their own request."*
- **Action: "Approve Request"** $\rightarrow$
  - Opens confirmation dialog showing exact before/after impact:
    - Target Account & Org Name.
    - Credit change amount ($\pm N$).
    - Ticket Reference verified.
  - On submit: Calls `POST /platform/billing/requests/:id/approve`.
  - Backend executes within transaction with `SET LOCAL proctora.request_id = request.id`.
  - On success: Row animates out; toast displays: *"Request EXECUTED. Ledger entry created."*
- **Action: "Reject Request"** $\rightarrow$
  - Opens rejection dialog requiring mandatory reason note (min 10 chars).
  - Calls `POST /platform/billing/requests/:id/reject`.
- **Action: "Retry Execution"** $\rightarrow$
  - Available on requests with status `APPROVED` where `executed_at` is null due to transient error. Re-executes using deterministic idempotency key.

---

## H2.5 Price Book (`/billing/pricing`)

### 1. Overview & Purpose
- **Route:** `/billing/pricing`
- **Purpose:** Versioned catalog of commercial credit SKUs across launch countries (India, US, Malaysia).
- **Allowed Roles:** `ADMIN` (View), `SUPER_ADMIN` (Publish new versions).
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Billing** $\rightarrow$ **Price Book**.

### 2. Data Shown & Controls
- Backed by `API-H2-14` and `API-H2-15`.
- **Country Selector:** Tabs for India (`IN` - INR), United States (`US` - USD), Malaysia (`MY` - MYR).
- **Catalog Table:** SKU Name, Pool Type, Credits Pack Size, Validity Days, Unit Price Minor (e.g. ₹60.00 / $2.00), Version Sequence, Effective From, Effective To.
- **Active vs Retired:** Active entries highlighted; retired historical versions collapsed.
- **Action: "Publish New Pricing Version"** (SUPER_ADMIN only) $\rightarrow$
  - Modal prompts for SKU, Country, Price in minor units, Effective Date.
  - Clear notice: *"Pricing changes are append-only. Existing active pools retain their purchase-time price."*

---

## H2.6 Payments & Invoices (`/billing/payments`)

### 1. Overview & Purpose
- **Route:** `/billing/payments`
- **Purpose:** Financial log of captured payments, offline PO invoices, and payment gateway webhook events.
- **Allowed Roles:** `ADMIN`, `SUPER_ADMIN`.
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Billing** $\rightarrow$ **Payments & Invoices**.

### 2. Data Shown & Sub-views
- **Tab 1: Transactions & Invoices:**
  - Columns: Payment ID, Provider (`MANUAL_INVOICE`, `RAZORPAY`, `STRIPE`), Status (`CAPTURED`, `REFUNDED`), Quantity Credits, Total Amount Charged, Tax, Invoice/PO Number, Captured At.
  - Action: "Record Offline PO Invoice" $\rightarrow$ Opens modal to record bank transfer or contract PO, minting credits through `PaymentService`.
- **Tab 2: Webhook Event Inbox:**
  - Inspects `billing.payment_event` table. Shows incoming webhook delivery status (`PENDING`, `PROCESSED`, `FAILED`).
  - Action: "Replay Webhook" $\rightarrow$ Safely re-runs BullMQ processing job for stuck webhooks.

---

## H2.7 Finance Dashboard (`/finance`)

### 1. Overview & Purpose
- **Route:** `/finance`
- **Purpose:** Executive platform unit economics and commercial telemetry.
- **Allowed Roles:** `SUPER_ADMIN` (Finance).
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Finance**.

### 2. Metrics & Visualizations
- **Card 1: Commercial Throughput:** Total Credits Sold, Consumed, Expired (Breakage), and Reversed.
- **Card 2: Revenue Realized:** Revenue segmented by currency (INR, USD, MYR). *Strict rule: Currencies are never summed together without explicit FX conversion notes.*
- **Card 3: Risk & Exposure:** Outstanding Overdraft Debt, Aged Overdraft (>14 days), Total Waived Courtesy Attempts (monitored against 5% drive cap).
- **Card 4: Unit Economics & Margin Alarm (§8.4):**
  - Average AI grading cost per session ($0.03–$0.08).
  - 30-Day Rolling AI Cost vs. Credit Price.
  - **Alarm Threshold:** If rolling AI cost exceeds 25% of credit price, card turns red with banner: *"Margin Alert: Token consumption exceeds 25% margin boundary."*
- **Data Readiness:** If shadow mode telemetry has not gathered 10,000 attempts, cards display honest **"Awaiting Data"** state per Invariant R9.

---

## H2.8 Integrity & Incidents (`/billing/integrity`)

### 1. Overview & Purpose
- **Route:** `/billing/integrity`
- **Purpose:** System health, nightly automated reconciliation results, shadow mode exit gates, and infrastructure incident declarations.
- **Allowed Roles:** `ADMIN`, `SUPER_ADMIN`.
- **Navigation Placement:** Primary Sidebar $\rightarrow$ **Billing** $\rightarrow$ **Integrity & Incidents**.

### 2. Sub-Tabs & Diagnostics
- **Tab 1: Nightly 7-Point Reconciliation:**
  - Status banner: **ALL PASS** (Green) or **DISCREPANCY DETECTED** (Red).
  - Detailed breakdown of all 7 checks:
    1. *Pool Integrity:* `cached_remaining == total_credits + SUM(amount)`
    2. *Overdraft Integrity:* Replay matches `overdraft_used`.
    3. *Session Acquisition 1:1:* Every live session has matching acquisition & billing evidence.
    4. *Expiry Sweeper:* Zero active pools with past expiry.
    5. *Topology Invariant:* No multiple active general pools per account.
    6. *Payment Proof:* Purchases reconcile 1:1 with captured payments.
    7. *WORM Backup Verification:* Checksum verification of MinIO object lock exports.
  - Action: "Trigger Manual Reconciliation Run".
- **Tab 2: Phase 2 Shadow Mode Progress:**
  - Real-time tracker towards exit gate: attempts logged ($N / 10,000$), reconciliation accuracy (must be 100%), duplicate count (must be 0).
- **Tab 3: Incident Window Declaration:**
  - Form to declare platform incident $[T_{\text{start}}, T_{\text{end}}]$.
  - System automatically calculates eligible candidate sessions for T3 fault reversal and enqueues bulk `REVERSAL` ledger entries.
