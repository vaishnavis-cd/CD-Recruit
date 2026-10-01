# Artifact 03: Database Persistence Model & Schema Specification

**Document:** `docs/super-admin/design/03-half2-database-schema.md`  
**Classification:** Database Architecture & Persistence Contract  
**System:** Proctora / CD-Recruit Platform Ops & Billing Engine  
**Prisma Version:** `@prisma/client` ^5.22.0, `prisma` ^5.22.0  
**Target Engine:** PostgreSQL 15+  
**Authoritative Precedence:** `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` v3 (§3) > `super-admin-intent.md`  

---

## 1. Multi-Schema Feasibility & Architecture Decision

### 1.1 Prisma 5.22.0 Multi-Schema Feasibility
- **Finding:** Prisma 5.22.0 supports PostgreSQL multi-schema natively via the `multiSchema` preview feature:
  ```prisma
  generator client {
    provider        = "prisma-client-js"
    previewFeatures = ["multiSchema"]
  }

  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
    schemas  = ["public", "billing", "platform"]
  }
  ```
- **Cross-Schema Relations:** Prisma allows relations across schemas using `@@schema("billing")` and `@@schema("platform")`.
- **Database Grants:** Enables distinct database roles:
  - `proctora_app`: Runtime application role (Candidate & Recruiter APIs).
  - `proctora_platform`: Administrative platform role (Super Admin Console).

### 1.2 Schema Partitioning Map

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               POSTGRESQL DATABASE SCHEMAS                              │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│       public             │          billing            │           platform            │
│    (Tenant & Candidate)  │    (Commercial Ledger)      │     (Platform Operations)     │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • organization           │ • billing_account           │ • platform_staff              │
│ • candidate              │ • credit_pool               │ • platform_audit_event        │
│ • session                │ • credit_ledger_entry       │ • override_action             │
│ • drive                  │ • payment                   │ • impersonation_session       │
│ • question               │ • payment_event (Inbox)     │ • incident_window             │
│ • role_template          │ • price_book_entry          │ • tenant_profile              │
│ • invite                 │ • manual_billing_request    │                               │
│ • staff (Recruiters)     │ • billing_audit_event       │                               │
│ • audit_log (Legacy)     │ • session_billing_evidence  │                               │
│                          │ • reconciliation_run        │                               │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 2. Table Specifications

### 2.1 Schema: `billing`

---

#### 2.1.1 Table: `billing.billing_account`
- **Purpose:** The legal payer entity. 1:1 with Organization by default; decouples payer from workspace. Holds country tax anchor, currency, and overdraft debt.
- **Classification:** **NEW TABLE** (Authoritative, Half 2).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Unique identifier for billing account |
| `name` | `varchar(255)` | No | — | — | Account display name (matches Org name) |
| `legal_entity_name` | `varchar(255)` | Yes | NULL | — | Verified corporate entity name |
| `billing_country` | `varchar(2)` | No | `'IN'` | — | ISO-2 country code (anchored to tax registration) |
| `currency` | `varchar(3)` | No | `'INR'` | — | ISO-4217 billing currency |
| `tax_id` | `varchar(64)` | Yes | NULL | — | Tax identifier (GSTIN, EIN, VAT number) |
| `status` | `varchar(32)` | No | `'ACTIVE'` | — | `ACTIVE`, `RESTRICTED`, `SUSPENDED` |
| `overdraft_limit` | `int4` | No | `0` | — | Absolute ceiling on overdraft (0 = strictly pre-paid) |
| `overdraft_used` | `int4` | No | `0` | — | Fast read cache of outstanding credit debt |
| `has_paid_purchase` | `boolean` | No | `false` | — | True if tenant has completed at least one paid checkout |
| `trial_domain` | `varchar(255)` | Yes | NULL | UNIQUE | Domain used for 1-trial-per-domain policy |
| `trial_granted_at` | `timestamptz`| Yes | NULL | — | Timestamp when automatic trial pool was minted |
| `created_at` | `timestamptz`| No | `clock_timestamp()` | — | Record creation timestamp |
| `updated_at` | `timestamptz`| No | `clock_timestamp()` | — | Record modification timestamp |

- **Constraints & Indexes:**
  - `chk_overdraft_nonneg`: `CHECK (overdraft_used >= 0)`
  - `chk_overdraft_limit`: `CHECK (overdraft_limit >= 0)`
  - `uq_billing_account_trial_domain`: `UNIQUE (trial_domain)`
  - `idx_billing_account_status`: `INDEX (status)`
- **Permissions:**
  - `proctora_app`: `SELECT` only. Cannot update overdraft or status directly.
  - `proctora_platform`: `SELECT`, `UPDATE (name, legal_entity_name, tax_id)`.
  - Balance changes executed **strictly via `LedgerService`** under advisory lock.

---

#### 2.1.2 Table: `billing.credit_pool`
- **Purpose:** Discrete bucket of purchased or granted credits with expiration, priority queue order, and drawdown cache.
- **Classification:** **NEW TABLE** (Authoritative, Half 2).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Unique pool identifier |
| `billing_account_id` | `uuid` | No | — | FK | `REFERENCES billing.billing_account(id) ON DELETE RESTRICT` |
| `drive_id` | `uuid` | Yes | NULL | — | Plain UUID snapshot for `DRIVE_PASS` (No FK to public.drive) |
| `pool_type` | `varchar(32)` | No | — | — | `DRIVE_PASS`, `TALENT_RESERVE`, `ENTERPRISE` |
| `name` | `varchar(255)` | No | — | — | Human-readable pool label (e.g. "Sep Campus Drive") |
| `source` | `varchar(32)` | No | — | — | `PURCHASE`, `CONTRACT`, `TRIAL`, `PROMO`, `GOODWILL`, `MIGRATION`, `ROLLOVER` |
| `total_credits` | `int4` | No | — | — | Opening credit allocation (**IMMUTABLE**) |
| `cached_remaining` | `int4` | No | — | — | Fast read cache of available balance (**CHECK >= 0**) |
| `validity_days` | `int4` | Yes | NULL | — | Lifespan in days from activation / first draw |
| `max_wait_days` | `int4` | No | `365` | — | Maximum days a queued pool can wait before clock auto-starts |
| `queue_order` | `int4` | Yes | NULL | — | Sequential activation priority (1, 2, 3...) |
| `status` | `varchar(32)` | No | `'QUEUED'` | — | `QUEUED`, `ACTIVE`, `SUSPENDED`, `EXHAUSTED`, `EXPIRED`, `CANCELLED` |
| `purchased_at` | `timestamptz`| No | `clock_timestamp()` | — | Time of purchase or grant (**IMMUTABLE**) |
| `clock_started_at` | `timestamptz`| Yes | NULL | — | Time first credit was drawn (floating clock start) |
| `activated_at` | `timestamptz`| Yes | NULL | — | Time pool became `ACTIVE` |
| `expires_at` | `timestamptz`| Yes | NULL | — | Hard deadline after which credits expire |
| `unit_price_minor` | `int4` | Yes | NULL | — | Price per credit in paise/cents at purchase (**IMMUTABLE**) |
| `currency` | `varchar(3)` | Yes | NULL | — | Purchase currency (**IMMUTABLE**) |
| `payment_id` | `uuid` | Yes | NULL | FK | `REFERENCES billing.payment(id) ON DELETE RESTRICT` (**IMMUTABLE**) |
| `terms_version` | `varchar(32)` | Yes | NULL | — | Version of commercial T&Cs accepted (**IMMUTABLE**) |
| `terms_accepted_by` | `varchar(255)`| Yes | NULL | — | User email/ID who accepted terms (**IMMUTABLE**) |
| `terms_accepted_at` | `timestamptz`| Yes | NULL | — | Timestamp of acceptance (**IMMUTABLE**) |
| `created_at` | `timestamptz`| No | `clock_timestamp()` | — | Record creation timestamp |

- **Constraints & Indexes:**
  - `chk_pool_nonneg`: `CHECK (cached_remaining >= 0)`
  - `chk_pool_total_positive`: `CHECK (total_credits > 0)`
  - `uq_pool_one_active_general`: `UNIQUE (billing_account_id) WHERE status = 'ACTIVE' AND drive_id IS NULL`
  - `uq_pool_one_active_per_drive`: `UNIQUE (drive_id) WHERE status = 'ACTIVE' AND drive_id IS NOT NULL`
  - `uq_pool_queue_order`: `UNIQUE (billing_account_id, queue_order) WHERE status IN ('QUEUED','ACTIVE') AND drive_id IS NULL`
  - `idx_credit_pool_account_status`: `INDEX (billing_account_id, status)`
  - `idx_credit_pool_expires_at`: `INDEX (expires_at) WHERE status = 'ACTIVE'`
- **Triggers:**
  - `trg_guard_credit_pool`: Enforces immutability of commercial columns and requires `proctora.request_id` to extend `expires_at`.

---

#### 2.1.3 Table: `billing.credit_ledger_entry`
- **Purpose:** Append-only financial ledger. Single source of truth for all balances, usage, reversals, and debt.
- **Classification:** **NEW TABLE** (Authoritative, Half 2, Strictly Append-Only).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Unique ledger entry identifier |
| `billing_account_id` | `uuid` | No | — | FK | `REFERENCES billing.billing_account(id) ON DELETE RESTRICT` |
| `organization_id` | `uuid` | No | — | — | Plain UUID snapshot of workspace (R5: No FK) |
| `credit_pool_id` | `uuid` | Yes | NULL | FK | `REFERENCES billing.credit_pool(id) ON DELETE RESTRICT` |
| `entry_type` | `varchar(32)` | No | — | — | `GRANT`, `CONSUME`, `OVERDRAFT`, `OVERDRAFT_SETTLE`, `WAIVE`, `REVERSAL`, `REFUND`, `EXPIRE`, `ADJUST` |
| `amount` | `int4` | No | — | — | Signed integer change: CONSUME=-1, GRANT=+n, WAIVE=0 |
| `balance_after` | `int4` | Yes | NULL | — | Resulting pool balance after entry (null for overdraft) |
| `session_id` | `uuid` | Yes | NULL | — | Plain UUID snapshot of candidate attempt (R5: No FK) |
| `drive_id` | `uuid` | Yes | NULL | — | Plain UUID snapshot of assessment event (R5: No FK) |
| `related_entry_id` | `uuid` | Yes | NULL | FK | `REFERENCES billing.credit_ledger_entry(id) ON DELETE RESTRICT` (Links REVERSAL to acquisition) |
| `grant_source` | `varchar(32)` | Yes | NULL | — | Source for GRANT entries (`PURCHASE`, `TRIAL`, `GOODWILL`, etc.) |
| `reason` | `varchar(64)` | No | — | — | Categorical reason code (`ATTEMPT_START`, `PLATFORM_FAULT`, `INCIDENT_WINDOW`, etc.) |
| `reason_note` | `varchar(200)`| Yes | NULL | — | Short human note, validated non-PII |
| `payment_id` | `uuid` | Yes | NULL | FK | `REFERENCES billing.payment(id) ON DELETE RESTRICT` |
| `request_id` | `uuid` | Yes | NULL | FK | `REFERENCES billing.manual_billing_request(id) ON DELETE RESTRICT` |
| `idempotency_key` | `varchar(128)`| No | — | UNIQUE | Deterministic deduplication key |
| `actor_id` | `varchar(128)`| No | — | — | Staff user ID or `'system'` |
| `approved_by_id` | `varchar(128)`| Yes | NULL | — | Approver staff ID for maker-checker |
| `shadow` | `boolean` | No | `false` | — | True for Phase 2 shadow rows (excluded from balances) |
| `created_at` | `timestamptz`| No | `clock_timestamp()` | — | Exact insertion time (**IMMUTABLE**) |

- **Constraints & Indexes:**
  - `chk_ledger_amount_sign`:
    ```sql
    CHECK (
         (entry_type IN ('GRANT','REVERSAL')                   AND amount > 0)
      OR (entry_type IN ('CONSUME','OVERDRAFT')                AND amount = -1)
      OR (entry_type IN ('OVERDRAFT_SETTLE','REFUND','EXPIRE') AND amount < 0)
      OR (entry_type = 'WAIVE'                                 AND amount = 0)
      OR (entry_type = 'ADJUST'                                AND amount <> 0)
    )
    ```
  - `chk_ledger_pool_presence`: `CHECK (credit_pool_id IS NOT NULL OR entry_type IN ('OVERDRAFT','WAIVE','REVERSAL'))`
  - `chk_ledger_required_refs`: Validates that GRANT has `grant_source`, REVERSAL has `related_entry_id`, REFUND has `payment_id`, and ADJUST has `request_id`.
  - `uq_ledger_idempotency_key`: `UNIQUE (idempotency_key)`
  - `uq_ledger_one_acquisition_per_session`: `UNIQUE (session_id) WHERE entry_type IN ('CONSUME','OVERDRAFT','WAIVE') AND shadow = false`
  - `uq_ledger_single_reversal`: `UNIQUE (related_entry_id) WHERE entry_type = 'REVERSAL'`
  - `idx_ledger_account_created`: `INDEX (billing_account_id, created_at)`
  - `idx_ledger_pool_created`: `INDEX (credit_pool_id, created_at)`
  - `idx_ledger_session_id`: `INDEX (session_id)`
  - `idx_ledger_drive_entry`: `INDEX (drive_id, entry_type)`
- **Permissions:**
  - `REVOKE UPDATE, DELETE, TRUNCATE ON billing.credit_ledger_entry FROM proctora_app, proctora_platform;`
  - `trg_ledger_append_only`: Blocks any UPDATE or DELETE.

---

#### 2.1.4 Table: `billing.manual_billing_request`
- **Purpose:** Maker-checker authorization queue for all manual credit creation, adjustments, refunds, and policy overrides.
- **Classification:** **NEW TABLE** (Authoritative, Half 2).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Unique request identifier |
| `billing_account_id` | `uuid` | No | — | FK | `REFERENCES billing.billing_account(id) ON DELETE RESTRICT` |
| `kind` | `varchar(32)` | No | — | — | `GRANT`, `ADJUST`, `REFUND`, `EXPIRY_EXTEND`, `OVERDRAFT_LIMIT`, `ACCOUNT_STATUS`, `BILLING_COUNTRY` |
| `payload` | `jsonb` | No | — | — | Validated JSON payload per kind (strictly non-PII) |
| `reason` | `text` | No | — | — | Business justification (min 10 chars) |
| `ticket_ref` | `varchar(64)` | No | — | — | External support/CRM ticket ID (e.g. `JIRA-1234`) |
| `requested_by_id` | `varchar(128)`| No | — | — | Staff ID of initiator |
| `approved_by_id` | `varchar(128)`| Yes | NULL | — | Staff ID of approver |
| `status` | `varchar(32)` | No | `'PENDING'` | — | `PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`, `CANCELLED` |
| `rejection_reason` | `text` | Yes | NULL | — | Explanation if rejected |
| `execution_error` | `text` | Yes | NULL | — | Error message if execution fails |
| `decided_at` | `timestamptz`| Yes | NULL | — | Timestamp of approval or rejection |
| `executed_at` | `timestamptz`| Yes | NULL | — | Timestamp of ledger transaction execution |
| `created_at` | `timestamptz`| No | `clock_timestamp()` | — | Submission timestamp |

- **Constraints & Indexes:**
  - `chk_maker_checker`: `CHECK (approved_by_id IS NULL OR approved_by_id <> requested_by_id)`
  - `idx_request_account_status`: `INDEX (billing_account_id, status)`
  - `idx_request_status_created`: `INDEX (status, created_at)`

---

#### 2.1.5 Table: `billing.payment`
- **Purpose:** Financial record of a successful payment gateway transaction or enterprise PO.
- **Classification:** **NEW TABLE** (Authoritative, Half 2).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Unique internal payment identifier |
| `billing_account_id` | `uuid` | No | — | FK | `REFERENCES billing.billing_account(id) ON DELETE RESTRICT` |
| `provider` | `varchar(32)` | No | — | — | `RAZORPAY`, `STRIPE`, `MANUAL_INVOICE` |
| `provider_payment_id`| `varchar(128)`| No | — | — | Gateway transaction ID (e.g. `pay_29Net1...`) |
| `provider_order_id` | `varchar(128)`| Yes | NULL | — | Gateway order ID (e.g. `order_29Net1...`) |
| `status` | `varchar(32)` | No | — | — | `CREATED`, `CAPTURED`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `DISPUTED` |
| `price_book_entry_id`| `uuid` | No | — | FK | `REFERENCES billing.price_book_entry(id) ON DELETE RESTRICT` |
| `quantity_credits` | `int4` | No | — | — | Number of credits purchased |
| `unit_price_minor` | `int4` | No | — | — | Unit price in minor units (paise/cents) |
| `amount_minor` | `int4` | No | — | — | Total charged amount including tax |
| `tax_minor` | `int4` | Yes | NULL | — | Tax component in minor units |
| `currency` | `varchar(3)` | No | — | — | Three-letter currency code |
| `invoice_number` | `varchar(64)` | Yes | NULL | — | Compliant invoice number |
| `captured_at` | `timestamptz`| Yes | NULL | — | Gateway capture timestamp |
| `created_at` | `timestamptz`| No | `clock_timestamp()` | — | Record creation timestamp |

- **Constraints & Indexes:**
  - `uq_payment_provider_id`: `UNIQUE (provider, provider_payment_id)`
  - `idx_payment_account_created`: `INDEX (billing_account_id, created_at)`

---

#### 2.1.6 Table: `billing.payment_event`
- **Purpose:** Webhook inbox table ensuring idempotent, asynchronous processing of payment gateway events.
- **Classification:** **NEW TABLE** (Operational Inbox, Half 2).
- **Columns:** `id (uuid PK)`, `provider (varchar)`, `event_id (varchar UNIQUE)`, `event_type (varchar)`, `payload (jsonb)`, `status ('PENDING'|'PROCESSED'|'FAILED')`, `error_message (text)`, `received_at (timestamptz)`, `processed_at (timestamptz)`.
- **Constraints:** `UNIQUE (provider, event_id)`.

---

#### 2.1.7 Table: `billing.price_book_entry`
- **Purpose:** Versioned, immutable pricing catalog.
- **Classification:** **NEW TABLE** (Authoritative, Half 2).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Catalog entry ID |
| `sku` | `varchar(64)` | No | — | — | SKU code (e.g. `CAMPUS_PASS_100`, `RESERVE_1000`) |
| `pool_type` | `varchar(32)` | No | — | — | `DRIVE_PASS`, `TALENT_RESERVE`, `ENTERPRISE` |
| `credits` | `int4` | No | — | — | Credit pack size |
| `validity_days` | `int4` | Yes | NULL | — | Standard lifespan in days |
| `billing_country` | `varchar(2)` | No | — | — | Country anchor (`IN`, `US`, `MY`) |
| `currency` | `varchar(3)` | No | — | — | Currency code (`INR`, `USD`, `MYR`) |
| `unit_price_minor` | `int4` | No | — | — | Minor currency units per credit (e.g. `6000` = ₹60.00) |
| `version` | `int4` | No | `1` | — | Version sequence |
| `effective_from` | `timestamptz`| No | — | — | Date pricing becomes active |
| `effective_to` | `timestamptz`| Yes | NULL | — | Expiration date of this version |

- **Constraints:** `UNIQUE (sku, billing_country, version)`.

---

#### 2.1.8 Table: `billing.session_billing_evidence`
- **Purpose:** Append-only session telemetry proving execution, presence, duration, and hardware state for billing dispute defense.
- **Classification:** **NEW TABLE** (Append-Only, Half 2).
- **Columns:** `session_id (uuid PK)`, `billing_account_id (uuid)`, `drive_id (uuid)`, `kind (varchar)`, `started_at (timestamptz)`, `first_content_rendered_at (timestamptz)`, `last_heartbeat_at (timestamptz)`, `ended_at (timestamptz)`, `end_reason (varchar)`, `event_count (int4)`, `modules_reached (int4)`, `cv_mode (varchar)`, `infra_flags (jsonb)`, `created_at (timestamptz)`.
- **Permissions:** Append-only. Triggers block UPDATE and DELETE.

---

#### 2.1.9 Table: `billing.reconciliation_run`
- **Purpose:** Execution log of the nightly automated 7-point audit check.
- **Classification:** **NEW TABLE** (Operational Audit, Half 2).
- **Columns:** `id (uuid PK)`, `run_type ('SCHEDULED'|'MANUAL')`, `status ('PASSED'|'FAILED')`, `check_results (jsonb)`, `drift_detected (boolean)`, `discrepancy_details (jsonb)`, `executed_by (varchar)`, `started_at (timestamptz)`, `completed_at (timestamptz)`.

---

### 2.2 Schema: `platform`

---

#### 2.2.1 Table: `platform.platform_staff`
- **Purpose:** Segregated internal platform staff identity population. Gated strictly to Proctora's internal operations team; completely isolated from tenant recruiters.
- **Classification:** **NEW TABLE** (Authoritative, Half 1).
- **Columns:**

| Column | Type | Nullable | Default | PK/FK | Description |
|---|---|---|---|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | PK | Unique platform staff ID |
| `email` | `varchar(255)` | No | — | UNIQUE | Staff corporate email address (`@proctora.com`) |
| `name` | `varchar(255)` | No | — | — | Staff full name |
| `role` | `varchar(32)` | No | `'SUPPORT'` | — | `SUPPORT`, `FINANCE`, `OWNER` (`PlatformStaffRole`) |
| `password_hash` | `text` | Yes | NULL | — | Memory-hard scrypt hash |
| `refresh_token_hash` | `text` | Yes | NULL | — | Single-use refresh token hash |
| `totp_secret_encrypted` | `text` | Yes | NULL | — | AES-256-GCM encrypted TOTP secret for mandatory MFA |
| `mfa_enabled` | `boolean` | No | `true` | — | True if MFA enrolled (**Mandatory for platform access**) |
| `is_active` | `boolean` | No | `true` | — | Soft disable flag |
| `created_at` | `timestamptz` | No | `clock_timestamp()` | — | Staff creation timestamp |

- **Constraints & Indexes:**
  - `uq_platform_staff_email`: `UNIQUE (email)`
  - `chk_platform_staff_role`: `CHECK (role IN ('SUPPORT', 'FINANCE', 'OWNER'))`
- **Permissions:**
  - `proctora_app`: Zero access (`REVOKE ALL ON platform.platform_staff FROM proctora_app`).
  - `proctora_platform`: `SELECT`, `INSERT`, `UPDATE`.

---

#### 2.2.2 Table: `platform.override_action`
- **Purpose:** Audit log of all non-financial operational overrides (proctoring sensitivity relaxation, schedule extensions, active-drive question fixes, invite bloat ratio overrides).
- **Classification:** **NEW TABLE** (Half 1).
- **Columns:** `id (uuid PK)`, `organization_id (uuid)`, `drive_id (uuid)`, `override_type (varchar)`, `payload (jsonb)`, `reason (text)`, `ticket_ref (varchar)`, `actor_id (varchar)`, `expires_at (timestamptz)`, `created_at (timestamptz)`.

---

#### 2.2.3 Table: `platform.impersonation_session`
- **Purpose:** Tracked, time-boxed (30 min) staff support session accessing tenant portal with dual-audit logging.
- **Classification:** **NEW TABLE** (Half 1).
- **Columns:** `id (uuid PK)`, `staff_id (varchar)`, `organization_id (uuid)`, `ticket_ref (varchar)`, `token_hash (varchar)`, `started_at (timestamptz)`, `expires_at (timestamptz)`, `revoked_at (timestamptz)`, `created_at (timestamptz)`.

---

#### 2.2.4 Table: `platform.incident_window`
- **Purpose:** Declared infrastructure fault window for automated T3 session credit reversals.
- **Classification:** **NEW TABLE** (Half 1 / Half 2).
- **Columns:** `id (uuid PK)`, `title (varchar)`, `reason (text)`, `ticket_ref (varchar)`, `started_at (timestamptz)`, `ended_at (timestamptz)`, `affected_drives (uuid[])`, `reversal_status ('PENDING'|'EXECUTED')`, `created_by (varchar)`, `created_at (timestamptz)`.

---

### 2.3 Search Path Hijacking Defense in PostgreSQL Stored Logic

#### What is Search Path Hijacking in a Nutshell?
When a PostgreSQL function runs an unqualified query like `UPDATE credit_pool SET ...`, the server resolves `credit_pool` by looking through schemas in the caller's `search_path`. If an attacker or untrusted user creates an identically named table in a preceding schema (such as `public`), PostgreSQL unintentionally executes against the attacker's table. In high-privilege functions (`SECURITY DEFINER`), this can lead to privilege escalation or data corruption.

#### Hardened SQL Stored Logic (`billing_begin` & Triggers):
Every stored PL/pgSQL function must:
1. Lock down `search_path` to trusted system and application schemas: `SET search_path = pg_catalog, billing, platform, public;`
2. **Explicitly schema-qualify every table reference**:

```sql
CREATE OR REPLACE FUNCTION billing.billing_begin(
  p_session_id uuid,
  p_mode text -- 'off', 'shadow', 'enforce'
)
RETURNS TABLE (outcome text, pool_id uuid, balance_remaining int) AS $$
DECLARE
  v_session RECORD;
  v_acct_id uuid;
  v_pool_id uuid;
  v_rem int;
BEGIN
  -- Prevent Search Path Hijacking & enforce bounded statement execution
  SET LOCAL search_path = pg_catalog, billing, platform, public;
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '5s';
  SET LOCAL proctora.begin_ok = 'on';

  -- Step 1: Claim Session Transition (Guards double-click, 2 tabs, retries)
  UPDATE public.session
     SET status = 'IN_PROGRESS'
   WHERE id = p_session_id AND status = 'NOT_STARTED'
  RETURNING kind, drive_id, organization_id INTO v_session;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ALREADY_STARTED'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  IF v_session.kind <> 'LIVE' OR p_mode = 'off' THEN
    UPDATE public.session SET started_at = clock_timestamp() WHERE id = p_session_id;
    RETURN QUERY SELECT 'STARTED'::text, NULL::uuid, 0;
    RETURN;
  END IF;

  -- Resolve Billing Account
  SELECT billing_account_id INTO v_acct_id FROM public.organization WHERE id = v_session.organization_id;

  -- Step 2: Claim 1 Credit. (Drive Pass first, then single ACTIVE general pool)
  WITH eligible_pool AS (
    SELECT p.id FROM billing.credit_pool p
     WHERE p.billing_account_id = v_acct_id
       AND p.status = 'ACTIVE'
       AND p.cached_remaining >= 1
       AND (p.expires_at IS NULL OR p.expires_at > clock_timestamp())
       AND (
         p.drive_id = v_session.drive_id
         OR (p.drive_id IS NULL AND (
           EXISTS (SELECT 1 FROM public.drive d WHERE d.id = v_session.drive_id AND d.fallthrough = 'ALLOW')
           OR NOT EXISTS (SELECT 1 FROM billing.credit_pool dp WHERE dp.drive_id = v_session.drive_id AND dp.status = 'ACTIVE')
         ))
       )
     ORDER BY (p.drive_id IS NULL), p.queue_order, p.created_at
     LIMIT 1
  )
  UPDATE billing.credit_pool p
     SET cached_remaining = p.cached_remaining - 1
    FROM eligible_pool
   WHERE p.id = eligible_pool.id
  RETURNING p.id, p.cached_remaining INTO v_pool_id, v_rem;

  -- If no pool had available balance, rollback session claim and signal slow path
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NEEDS_SLOW_PATH' USING ERRCODE = 'P0001';
  END IF;

  -- Step 3: Insert Immutable Ledger Entry
  IF p_mode = 'shadow' THEN
    INSERT INTO billing.credit_ledger_entry (
      id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
      session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
    ) VALUES (
      gen_random_uuid(), v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
      p_session_id, v_session.drive_id, 'shadow:acquire:' || p_session_id, 'system', 'ATTEMPT_START', true, clock_timestamp()
    );
  ELSE
    INSERT INTO billing.credit_ledger_entry (
      id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
      session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
    ) VALUES (
      gen_random_uuid(), v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
      p_session_id, v_session.drive_id, 'acquire:' || p_session_id, 'system', 'ATTEMPT_START', false, clock_timestamp()
    );
  END IF;

  -- Step 4: Candidate Clock Starts After Lock is Released (R3)
  UPDATE public.session SET started_at = clock_timestamp() WHERE id = p_session_id;

  RETURN QUERY SELECT 'STARTED'::text, v_pool_id, v_rem;
END;
$$ LANGUAGE plpgsql;
```

---

### 2.4 Additions to Existing `public` Schema Tables

#### 2.4.1 Alterations to `public.organization`
```sql
ALTER TABLE public.organization
  ADD COLUMN billing_account_id UUID REFERENCES billing.billing_account(id) ON DELETE RESTRICT,
  ADD COLUMN lifecycle_stage VARCHAR(32) DEFAULT 'ONBOARDING',
  ADD COLUMN domain_verified_at TIMESTAMPTZ,
  ADD COLUMN walkthrough_completed_at TIMESTAMPTZ,
  ADD COLUMN internal_owner_id VARCHAR(128),
  ADD COLUMN license_tier VARCHAR(32) DEFAULT 'STARTER',
  ADD COLUMN appeal_window_days_override INT4 DEFAULT NULL,
  ADD COLUMN entitlements JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN trial_nudge_log JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.organization
  ADD CONSTRAINT chk_appeal_window_override
  CHECK (appeal_window_days_override IS NULL OR appeal_window_days_override BETWEEN 14 AND 365);
```

#### 2.4.2 Alterations to `public.drive`
```sql
ALTER TABLE public.drive
  ADD COLUMN fallthrough VARCHAR(16) DEFAULT 'ALLOW',
  ADD COLUMN expected_attendance INT4 DEFAULT NULL;
```

#### 2.4.3 Alterations to `public.session`
```sql
ALTER TABLE public.session
  ADD COLUMN kind VARCHAR(16) DEFAULT 'LIVE',
  ADD COLUMN held_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN hold_reason VARCHAR(32) DEFAULT NULL,
  ADD COLUMN reattempt_of_session_id UUID DEFAULT NULL;
```

---

## 3. Migration Sequencing Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FIVE-PHASE ROLLOUT ROADMAP                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 0: Discovery & Side-Door Cleanup                                                 │
│ • Refactor auto-transitions in proctoring, sql, coding, mcq to route via beginSession. │
│ • Map session lifecycle scripts to avoid colliding with ledger snapshots.             │
│                                                                                        │
│ PHASE 1: Database Schemas & Invariants (Prisma Migration)                              │
│ • Apply schema migration creating billing.* and platform.* tables.                     │
│ • Apply raw SQL migration (triggers, check constraints, append-only revokes).          │
│ • Backfill exactly one BillingAccount per existing Organization.                       │
│ • Seed ZERO credit balances. CI schema tests green.                                    │
│                                                                                        │
│ PHASE 2: Shadow Validation Mode (BILLING_MODE=shadow)                                  │
│ • Deploy billing_begin() in shadow mode on all session starts.                         │
│ • Shadow rows (shadow=true) written inside SAVEPOINT (never fail real candidates).     │
│ • Run 2 weeks of real traffic. Exit gate: >10,000 attempts, 100% reconciled, 0 dups.   │
│                                                                                        │
│ PHASE 3: Live Cutover & Enforcement (BILLING_MODE=enforce)                             │
│ • Seed starting pilot balances via maker-checker GRANT.                                │
│ • Enable PostgreSQL session-start gateway trigger guard_session_start.                 │
│ • Activate Admin Web credit badges, capacity estimators, and HELD queue flow.          │
│                                                                                        │
│ PHASE 4: Payment Gateway & Webhook Integration                                         │
│ • Deploy public webhook receiver (/billing/webhooks/:provider) and BullMQ worker.      │
│ • Wire Razorpay and manual invoice flows. Verify duplicate webhook protection.         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
