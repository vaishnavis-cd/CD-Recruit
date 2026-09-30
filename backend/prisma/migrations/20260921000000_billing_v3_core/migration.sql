-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'BILLING_ADMIN';

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('GRANT', 'CONSUME', 'OVERDRAFT', 'OVERDRAFT_SETTLE', 'WAIVE', 'REVERSAL', 'REFUND', 'EXPIRE', 'ADJUST');

-- CreateEnum
CREATE TYPE "GrantSource" AS ENUM ('PURCHASE', 'CONTRACT', 'TRIAL', 'PROMO', 'GOODWILL', 'MIGRATION', 'ROLLOVER');

-- CreateEnum
CREATE TYPE "LedgerReason" AS ENUM ('ATTEMPT_START', 'OVERDRAFT_USED', 'HARDWARE_CAMERA_FAILURE', 'HARDWARE_OTHER', 'PLATFORM_FAULT', 'INCIDENT_WINDOW', 'DISPUTE_RESOLVED', 'PAYMENT_CAPTURED', 'PAYMENT_REFUNDED', 'CHARGEBACK', 'POOL_EXPIRED', 'ROLLOVER', 'TRIAL', 'PROMO', 'GOODWILL', 'MIGRATION_SEED', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('DRIVE_PASS', 'TALENT_RESERVE', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('QUEUED', 'ACTIVE', 'SUSPENDED', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('LIVE', 'PREVIEW', 'SANDBOX');

-- CreateEnum
CREATE TYPE "BillingAccountStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DrivePoolFallthrough" AS ENUM ('ALLOW', 'HOLD');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'STRIPE', 'MANUAL_INVOICE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ManualRequestKind" AS ENUM ('GRANT', 'ADJUST', 'REFUND', 'EXPIRY_EXTEND', 'OVERDRAFT_LIMIT', 'ACCOUNT_STATUS', 'BILLING_COUNTRY');

-- CreateEnum
CREATE TYPE "ManualRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('SUBMITTED', 'TIME_EXPIRED', 'ABANDONED', 'CANDIDATE_LEFT', 'PLATFORM_FAULT');

-- CreateEnum
CREATE TYPE "HoldReason" AS ENUM ('CAPACITY');

-- CreateTable
CREATE TABLE "billing_account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_entity_name" TEXT,
    "billing_country" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "tax_id" TEXT,
    "status" "BillingAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "overdraft_limit" INTEGER NOT NULL DEFAULT 0,
    "overdraft_used" INTEGER NOT NULL DEFAULT 0,
    "has_paid_purchase" BOOLEAN NOT NULL DEFAULT false,
    "trial_domain" TEXT,
    "trial_granted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_pool" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "drive_id" TEXT,
    "pool_type" "PoolType" NOT NULL,
    "name" TEXT NOT NULL,
    "source" "GrantSource" NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "cached_remaining" INTEGER NOT NULL,
    "validity_days" INTEGER,
    "max_wait_days" INTEGER NOT NULL DEFAULT 365,
    "queue_order" INTEGER,
    "status" "PoolStatus" NOT NULL DEFAULT 'QUEUED',
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clock_started_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "unit_price_minor" INTEGER,
    "currency" TEXT,
    "payment_id" TEXT,
    "terms_version" TEXT,
    "terms_accepted_by" TEXT,
    "terms_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entry" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "credit_pool_id" TEXT,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER,
    "session_id" TEXT,
    "drive_id" TEXT,
    "related_entry_id" TEXT,
    "grant_source" "GrantSource",
    "reason" "LedgerReason" NOT NULL,
    "reason_note" TEXT,
    "payment_id" TEXT,
    "request_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "shadow" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "status" "PaymentStatus" NOT NULL,
    "price_book_entry_id" TEXT NOT NULL,
    "quantity_credits" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "tax_minor" INTEGER,
    "currency" TEXT NOT NULL,
    "invoice_number" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_book_entry" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "pool_type" "PoolType" NOT NULL,
    "credits" INTEGER NOT NULL,
    "validity_days" INTEGER,
    "billing_country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "price_book_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_billing_request" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "kind" "ManualRequestKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "status" "ManualRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_billing_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_audit_event" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actor_id" TEXT,
    "approved_by_id" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_billing_evidence" (
    "session_id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "drive_id" TEXT,
    "kind" "SessionKind" NOT NULL DEFAULT 'LIVE',
    "started_at" TIMESTAMP(3) NOT NULL,
    "first_content_rendered_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "end_reason" "SessionEndReason",
    "event_count" INTEGER NOT NULL,
    "modules_reached" INTEGER NOT NULL,
    "cv_mode" TEXT,
    "tutorial_mode" TEXT,
    "infra_flags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_billing_evidence_pkey" PRIMARY KEY ("session_id")
);

-- AlterTable drive
ALTER TABLE "drive" ADD COLUMN IF NOT EXISTS "fallthrough" "DrivePoolFallthrough" NOT NULL DEFAULT 'ALLOW';
ALTER TABLE "drive" ADD COLUMN IF NOT EXISTS "expected_attendance" INTEGER;

-- AlterTable session
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "kind" "SessionKind" NOT NULL DEFAULT 'LIVE';
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "held_at" TIMESTAMP(3);
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "hold_reason" "HoldReason";
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "reattempt_of_session_id" TEXT;

-- AlterTable organization and backfill
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "billing_account_id" TEXT;

-- Backfill one BillingAccount for every existing Organization
DO $$
DECLARE
  org RECORD;
  v_ba_id TEXT;
BEGIN
  FOR org IN SELECT id, name FROM "organization" WHERE billing_account_id IS NULL LOOP
    v_ba_id := gen_random_uuid()::text;
    INSERT INTO "billing_account" (
      id, name, legal_entity_name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at
    ) VALUES (
      v_ba_id, org.name, org.name, 'IND', 'INR', 'ACTIVE', 0, 0, clock_timestamp()
    );
    UPDATE "organization" SET billing_account_id = v_ba_id WHERE id = org.id;
  END LOOP;
END $$;

ALTER TABLE "organization" ALTER COLUMN "billing_account_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "billing_account_trial_domain_key" ON "billing_account"("trial_domain");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_pool_billing_account_id_status_idx" ON "credit_pool"("billing_account_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_pool_drive_id_idx" ON "credit_pool"("drive_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_entry_idempotency_key_key" ON "credit_ledger_entry"("idempotency_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_ledger_entry_billing_account_id_created_at_idx" ON "credit_ledger_entry"("billing_account_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_ledger_entry_credit_pool_id_created_at_idx" ON "credit_ledger_entry"("credit_pool_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_ledger_entry_session_id_idx" ON "credit_ledger_entry"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_ledger_entry_drive_id_entry_type_idx" ON "credit_ledger_entry"("drive_id", "entry_type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_provider_payment_id_key" ON "payment"("provider", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "price_book_entry_sku_billing_country_version_key" ON "price_book_entry"("sku", "billing_country", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "billing_audit_event_billing_account_id_created_at_idx" ON "billing_audit_event"("billing_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "organization" DROP CONSTRAINT IF EXISTS "organization_billing_account_id_fkey";
ALTER TABLE "organization" ADD CONSTRAINT "organization_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_pool" DROP CONSTRAINT IF EXISTS "credit_pool_billing_account_id_fkey";
ALTER TABLE "credit_pool" ADD CONSTRAINT "credit_pool_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_pool" DROP CONSTRAINT IF EXISTS "credit_pool_payment_id_fkey";
ALTER TABLE "credit_pool" ADD CONSTRAINT "credit_pool_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" DROP CONSTRAINT IF EXISTS "credit_ledger_entry_billing_account_id_fkey";
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" DROP CONSTRAINT IF EXISTS "credit_ledger_entry_credit_pool_id_fkey";
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_credit_pool_id_fkey" FOREIGN KEY ("credit_pool_id") REFERENCES "credit_pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" DROP CONSTRAINT IF EXISTS "credit_ledger_entry_payment_id_fkey";
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" DROP CONSTRAINT IF EXISTS "credit_ledger_entry_related_entry_id_fkey";
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_related_entry_id_fkey" FOREIGN KEY ("related_entry_id") REFERENCES "credit_ledger_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "payment_billing_account_id_fkey";
ALTER TABLE "payment" ADD CONSTRAINT "payment_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 1. Amount Sign & Reference Integrity Constraints ─────────────────
ALTER TABLE credit_ledger_entry DROP CONSTRAINT IF EXISTS chk_ledger_amount_sign;
ALTER TABLE credit_ledger_entry ADD CONSTRAINT chk_ledger_amount_sign CHECK (
     (entry_type IN ('GRANT','REVERSAL')                        AND amount > 0)
  OR (entry_type IN ('CONSUME','OVERDRAFT')                     AND amount = -1)
  OR (entry_type IN ('OVERDRAFT_SETTLE','REFUND','EXPIRE')      AND amount < 0)
  OR (entry_type = 'WAIVE'                                      AND amount = 0)
  OR (entry_type = 'ADJUST'                                     AND amount <> 0));

ALTER TABLE credit_ledger_entry DROP CONSTRAINT IF EXISTS chk_ledger_pool_presence;
ALTER TABLE credit_ledger_entry ADD CONSTRAINT chk_ledger_pool_presence CHECK (
  credit_pool_id IS NOT NULL OR entry_type IN ('OVERDRAFT','WAIVE','REVERSAL'));

ALTER TABLE credit_ledger_entry DROP CONSTRAINT IF EXISTS chk_ledger_required_refs;
ALTER TABLE credit_ledger_entry ADD CONSTRAINT chk_ledger_required_refs CHECK (
      (entry_type <> 'GRANT'    OR grant_source IS NOT NULL)
  AND (entry_type <> 'REVERSAL' OR related_entry_id IS NOT NULL)
  AND (entry_type <> 'REFUND'   OR payment_id IS NOT NULL)
  AND (entry_type <> 'ADJUST'   OR request_id IS NOT NULL)
  AND (NOT (entry_type = 'GRANT' AND grant_source = 'PURCHASE') OR payment_id IS NOT NULL)
  AND (NOT (entry_type = 'GRANT' AND grant_source IN ('PROMO','GOODWILL','CONTRACT','MIGRATION','ROLLOVER'))
       OR request_id IS NOT NULL));

ALTER TABLE credit_pool            DROP CONSTRAINT IF EXISTS chk_pool_nonneg;
ALTER TABLE credit_pool            ADD CONSTRAINT chk_pool_nonneg      CHECK (cached_remaining >= 0);

ALTER TABLE billing_account        DROP CONSTRAINT IF EXISTS chk_overdraft_nonneg;
ALTER TABLE billing_account        ADD CONSTRAINT chk_overdraft_nonneg CHECK (overdraft_used >= 0);

ALTER TABLE manual_billing_request DROP CONSTRAINT IF EXISTS chk_maker_checker;
ALTER TABLE manual_billing_request ADD CONSTRAINT chk_maker_checker    CHECK (approved_by_id IS NULL OR approved_by_id <> requested_by_id);

-- ── 2. Double-Billing & Double-Promotion Partial Indexes ──────────────
-- Exactly one live acquisition (CONSUME | OVERDRAFT | WAIVE) per session
DROP INDEX IF EXISTS uq_ledger_one_acquisition_per_session;
CREATE UNIQUE INDEX uq_ledger_one_acquisition_per_session ON credit_ledger_entry (session_id)
  WHERE entry_type IN ('CONSUME','OVERDRAFT','WAIVE') AND shadow = false;

-- An acquisition can be reversed at most once
DROP INDEX IF EXISTS uq_ledger_single_reversal;
CREATE UNIQUE INDEX uq_ledger_single_reversal ON credit_ledger_entry (related_entry_id)
  WHERE entry_type = 'REVERSAL';

-- Pool Topology: At most one ACTIVE general pool per account
DROP INDEX IF EXISTS uq_pool_one_active_general;
CREATE UNIQUE INDEX uq_pool_one_active_general ON credit_pool (billing_account_id)
  WHERE status = 'ACTIVE' AND drive_id IS NULL;

-- Pool Topology: At most one ACTIVE pass per drive
DROP INDEX IF EXISTS uq_pool_one_active_per_drive;
CREATE UNIQUE INDEX uq_pool_one_active_per_drive ON credit_pool (drive_id)
  WHERE status = 'ACTIVE' AND drive_id IS NOT NULL;

-- Pool Topology: Unique queue order per account
DROP INDEX IF EXISTS uq_pool_queue_order;
CREATE UNIQUE INDEX uq_pool_queue_order ON credit_pool (billing_account_id, queue_order)
  WHERE status IN ('QUEUED','ACTIVE') AND drive_id IS NULL;

-- ── 3. Append-Only Immutability Enforcement ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'proctora_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON credit_ledger_entry, billing_audit_event, session_billing_evidence FROM proctora_app;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is strictly forbidden (financial ledger is append-only)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_append_only ON credit_ledger_entry;
CREATE TRIGGER trg_ledger_append_only   BEFORE UPDATE OR DELETE ON credit_ledger_entry      FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS trg_audit_append_only ON billing_audit_event;
CREATE TRIGGER trg_audit_append_only    BEFORE UPDATE OR DELETE ON billing_audit_event      FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS trg_evidence_append_only ON session_billing_evidence;
CREATE TRIGGER trg_evidence_append_only BEFORE UPDATE OR DELETE ON session_billing_evidence FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ── 4. CreditPool Immutability & Audit Trigger ────────────────────────
CREATE OR REPLACE FUNCTION guard_credit_pool_mutation() RETURNS trigger AS $$
BEGIN
  -- Immutable columns once created:
  IF OLD.total_credits <> NEW.total_credits OR
     OLD.drive_id IS DISTINCT FROM NEW.drive_id OR
     OLD.purchased_at <> NEW.purchased_at OR
     OLD.unit_price_minor IS DISTINCT FROM NEW.unit_price_minor OR
     OLD.currency IS DISTINCT FROM NEW.currency OR
     OLD.payment_id IS DISTINCT FROM NEW.payment_id OR
     OLD.terms_version IS DISTINCT FROM NEW.terms_version THEN
    RAISE EXCEPTION 'Core commercial columns on credit_pool % are immutable', OLD.id;
  END IF;

  -- Expiry extension requires active maker-checker request context:
  IF OLD.expires_at IS NOT NULL AND NEW.expires_at <> OLD.expires_at THEN
    IF COALESCE(current_setting('proctora.request_id', true), '') = '' THEN
      RAISE EXCEPTION 'Extending expires_at on pool % requires an approved maker-checker request', OLD.id;
    END IF;
  END IF;

  -- Automatic Audit Trail: Write audit event on status/date changes
  IF OLD.status <> NEW.status OR OLD.expires_at IS DISTINCT FROM NEW.expires_at OR
     OLD.clock_started_at IS DISTINCT FROM NEW.clock_started_at OR OLD.activated_at IS DISTINCT FROM NEW.activated_at THEN
    INSERT INTO billing_audit_event (
      id, billing_account_id, subject_type, subject_id, action, before, after, request_id, created_at
    ) VALUES (
      gen_random_uuid()::text, OLD.billing_account_id, 'POOL', OLD.id, 'POOL_UPDATE',
      json_build_object('status', OLD.status, 'expires_at', OLD.expires_at, 'cached_remaining', OLD.cached_remaining),
      json_build_object('status', NEW.status, 'expires_at', NEW.expires_at, 'cached_remaining', NEW.cached_remaining),
      nullif(current_setting('proctora.request_id', true), ''),
      clock_timestamp()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_credit_pool ON credit_pool;
CREATE TRIGGER trg_guard_credit_pool BEFORE UPDATE ON credit_pool
  FOR EACH ROW EXECUTE FUNCTION guard_credit_pool_mutation();

-- ── 5. billing_begin Function (Engine Fast Path) ────────────────────────
CREATE OR REPLACE FUNCTION billing_begin(
  p_session_id text,
  p_mode text -- 'off', 'shadow', 'enforce'
)
RETURNS TABLE (outcome text, pool_id text, balance_remaining int) AS $$
DECLARE
  v_session RECORD;
  v_acct_id text;
  v_pool_id text;
  v_rem int;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '5s';
  SET LOCAL proctora.begin_ok = 'on';

  -- Step 1: Claim Session Transition (Guards double-click, 2 tabs, retries)
  UPDATE session
     SET status = 'IN_PROGRESS'
   WHERE id = p_session_id AND status = 'NOT_STARTED'
  RETURNING kind, drive_id, organization_id INTO v_session;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ALREADY_STARTED'::text, NULL::text, 0;
    RETURN;
  END IF;

  IF v_session.kind <> 'LIVE' OR p_mode = 'off' THEN
    UPDATE session SET started_at = clock_timestamp() WHERE id = p_session_id;
    RETURN QUERY SELECT 'STARTED'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Resolve Billing Account
  SELECT billing_account_id INTO v_acct_id FROM organization WHERE id = v_session.organization_id;

  -- Step 2: Claim 1 Credit. (Drive Pass first, then single ACTIVE general pool)
  WITH eligible_pool AS (
    SELECT p.id FROM credit_pool p
     WHERE p.billing_account_id = v_acct_id
       AND p.status = 'ACTIVE'
       AND p.cached_remaining >= 1
       AND (p.expires_at IS NULL OR p.expires_at > clock_timestamp())
       AND (
         p.drive_id = v_session.drive_id
         OR (p.drive_id IS NULL AND (
           EXISTS (SELECT 1 FROM drive d WHERE d.id = v_session.drive_id AND d.fallthrough = 'ALLOW')
           OR NOT EXISTS (SELECT 1 FROM credit_pool dp WHERE dp.drive_id = v_session.drive_id AND dp.status = 'ACTIVE')
         ))
       )
     ORDER BY (p.drive_id IS NULL), p.queue_order, p.created_at
     LIMIT 1
  )
  UPDATE credit_pool p
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
    INSERT INTO credit_ledger_entry (
      id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
      session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
    ) VALUES (
      gen_random_uuid()::text, v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
      p_session_id, v_session.drive_id, 'shadow:acquire:' || p_session_id, 'system', 'ATTEMPT_START', true, clock_timestamp()
    );
  ELSE
    INSERT INTO credit_ledger_entry (
      id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
      session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
    ) VALUES (
      gen_random_uuid()::text, v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
      p_session_id, v_session.drive_id, 'acquire:' || p_session_id, 'system', 'ATTEMPT_START', false, clock_timestamp()
    );
  END IF;

  -- Step 4: Candidate Clock Starts After Lock is Released (R3)
  UPDATE session SET started_at = clock_timestamp() WHERE id = p_session_id;

  RETURN QUERY SELECT 'STARTED'::text, v_pool_id, v_rem;
END;
$$ LANGUAGE plpgsql;
