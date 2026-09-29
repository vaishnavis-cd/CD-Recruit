-- ============================================================================
-- Migration: 20260928183000_billing_database_invariants
-- Phase 1 Step 1.3: Database Triggers, Functions, and Check Constraints
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Database CHECK Constraints
-- ----------------------------------------------------------------------------

-- billing.billing_account: Non-negative overdraft balances and limits
ALTER TABLE "billing"."billing_account"
  ADD CONSTRAINT "chk_overdraft_nonneg" CHECK ("overdraft_used" >= 0),
  ADD CONSTRAINT "chk_overdraft_limit" CHECK ("overdraft_limit" >= 0);

-- billing.credit_pool: Non-negative cached balance & positive total credits
ALTER TABLE "billing"."credit_pool"
  ADD CONSTRAINT "chk_pool_nonneg" CHECK ("cached_remaining" >= 0),
  ADD CONSTRAINT "chk_pool_total_positive" CHECK ("total_credits" > 0);

-- billing.credit_ledger_entry: Sign integrity, pool presence, and required reference rules
ALTER TABLE "billing"."credit_ledger_entry"
  ADD CONSTRAINT "chk_ledger_amount_sign" CHECK (
    ("entry_type" IN ('GRANT', 'REVERSAL')                   AND "amount" > 0)
    OR ("entry_type" IN ('CONSUME', 'OVERDRAFT')             AND "amount" = -1)
    OR ("entry_type" IN ('OVERDRAFT_SETTLE', 'REFUND', 'EXPIRE') AND "amount" < 0)
    OR ("entry_type" = 'WAIVE'                              AND "amount" = 0)
    OR ("entry_type" = 'ADJUST'                             AND "amount" <> 0)
  ),
  ADD CONSTRAINT "chk_ledger_pool_presence" CHECK (
    "credit_pool_id" IS NOT NULL OR "entry_type" IN ('OVERDRAFT', 'WAIVE', 'REVERSAL')
  ),
  ADD CONSTRAINT "chk_ledger_required_refs" CHECK (
    ("entry_type" <> 'GRANT' OR "grant_source" IS NOT NULL)
    AND ("entry_type" <> 'REVERSAL' OR "related_entry_id" IS NOT NULL)
    AND ("entry_type" <> 'REFUND' OR "payment_id" IS NOT NULL)
    AND ("entry_type" <> 'ADJUST' OR "request_id" IS NOT NULL)
  );

-- billing.manual_billing_request: Maker-Checker dual authorization (requester != approver)
ALTER TABLE "billing"."manual_billing_request"
  ADD CONSTRAINT "chk_maker_checker" CHECK (
    "approved_by_id" IS NULL OR "approved_by_id" <> "requested_by_id"
  );

-- public.organization: Retention override window boundary (14 to 365 days)
ALTER TABLE "public"."organization"
  ADD CONSTRAINT "chk_appeal_window_override" CHECK (
    "appeal_window_days_override" IS NULL OR "appeal_window_days_override" BETWEEN 14 AND 365
  );

-- platform.platform_staff: Strict platform staff role enforcement
ALTER TABLE "platform"."platform_staff"
  ADD CONSTRAINT "chk_platform_staff_role" CHECK (
    "role" IN ('SUPPORT', 'FINANCE', 'OWNER')
  );

-- ----------------------------------------------------------------------------
-- 2. Partial Unique Indexes
-- ----------------------------------------------------------------------------

-- Exactly one ACTIVE general pool per billing account
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_one_active_general"
  ON "billing"."credit_pool" ("billing_account_id")
  WHERE "status" = 'ACTIVE' AND "drive_id" IS NULL;

-- Exactly one ACTIVE pass per drive
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_one_active_per_drive"
  ON "billing"."credit_pool" ("drive_id")
  WHERE "status" = 'ACTIVE' AND "drive_id" IS NOT NULL;

-- Unique queue order per account for queued/active general pools
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_queue_order"
  ON "billing"."credit_pool" ("billing_account_id", "queue_order")
  WHERE "status" IN ('QUEUED', 'ACTIVE') AND "drive_id" IS NULL;

-- Exact-once non-shadow acquisition entry per candidate session
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ledger_one_acquisition_per_session"
  ON "billing"."credit_ledger_entry" ("session_id")
  WHERE "entry_type" IN ('CONSUME', 'OVERDRAFT', 'WAIVE') AND "shadow" = false;

-- Exact-once reversal per acquisition ledger entry
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ledger_single_reversal"
  ON "billing"."credit_ledger_entry" ("related_entry_id")
  WHERE "entry_type" = 'REVERSAL';

-- ----------------------------------------------------------------------------
-- 3. Append-Only Immutability Guard: billing.forbid_mutation()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing.forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
  SET LOCAL search_path = pg_catalog, billing, platform, public;
  RAISE EXCEPTION 'Table %.% is strictly append-only: UPDATE, DELETE, and TRUNCATE operations are forbidden',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = '27000';
END;
$$ LANGUAGE plpgsql;

-- Row-level protection (UPDATE / DELETE)
CREATE TRIGGER trg_ledger_append_only
  BEFORE UPDATE OR DELETE ON "billing"."credit_ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION billing.forbid_mutation();

CREATE TRIGGER trg_billing_audit_append_only
  BEFORE UPDATE OR DELETE ON "billing"."billing_audit_event"
  FOR EACH ROW EXECUTE FUNCTION billing.forbid_mutation();

CREATE TRIGGER trg_session_evidence_append_only
  BEFORE UPDATE OR DELETE ON "billing"."session_billing_evidence"
  FOR EACH ROW EXECUTE FUNCTION billing.forbid_mutation();

CREATE TRIGGER trg_platform_audit_append_only
  BEFORE UPDATE OR DELETE ON "platform"."platform_audit_event"
  FOR EACH ROW EXECUTE FUNCTION billing.forbid_mutation();

-- Statement-level protection (TRUNCATE)
CREATE TRIGGER trg_ledger_truncate
  BEFORE TRUNCATE ON "billing"."credit_ledger_entry"
  FOR EACH STATEMENT EXECUTE FUNCTION billing.forbid_mutation();

CREATE TRIGGER trg_billing_audit_truncate
  BEFORE TRUNCATE ON "billing"."billing_audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION billing.forbid_mutation();

CREATE TRIGGER trg_session_evidence_truncate
  BEFORE TRUNCATE ON "billing"."session_billing_evidence"
  FOR EACH STATEMENT EXECUTE FUNCTION billing.forbid_mutation();

CREATE TRIGGER trg_platform_audit_truncate
  BEFORE TRUNCATE ON "platform"."platform_audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION billing.forbid_mutation();

-- ----------------------------------------------------------------------------
-- 4. Credit Pool Mutation Guard: billing.guard_credit_pool_mutation()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing.guard_credit_pool_mutation()
RETURNS TRIGGER AS $$
BEGIN
  SET LOCAL search_path = pg_catalog, billing, platform, public;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on credit_pool is strictly forbidden'
      USING ERRCODE = '27000';
  END IF;

  -- Core commercial columns immutability check
  IF NEW.id <> OLD.id
     OR NEW.billing_account_id <> OLD.billing_account_id
     OR NEW.total_credits <> OLD.total_credits
     OR NEW.drive_id IS DISTINCT FROM OLD.drive_id
     OR NEW.purchased_at <> OLD.purchased_at
     OR NEW.unit_price_minor IS DISTINCT FROM OLD.unit_price_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
  THEN
    RAISE EXCEPTION 'Core commercial columns on credit_pool are immutable'
      USING ERRCODE = '27001';
  END IF;

  -- Expiry extension requires approved request context (proctora.request_id)
  IF OLD.expires_at IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    IF NULLIF(current_setting('proctora.request_id', true), '') IS NULL THEN
      RAISE EXCEPTION 'Extending pool expiry requires an authorized request context (proctora.request_id is not set)'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_credit_pool
  BEFORE UPDATE OR DELETE ON "billing"."credit_pool"
  FOR EACH ROW EXECUTE FUNCTION billing.guard_credit_pool_mutation();

-- ----------------------------------------------------------------------------
-- 5. Session Start Database Guard: public.guard_session_start()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_session_start()
RETURNS TRIGGER AS $$
BEGIN
  SET LOCAL search_path = pg_catalog, billing, platform, public;

  -- Disallow transition to IN_PROGRESS from terminal states
  IF OLD.status IN ('SUBMITTED', 'AUTO_SUBMITTED', 'CLOSED', 'ABANDONED') AND NEW.status = 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cannot transition session % from terminal status % to IN_PROGRESS', OLD.id, OLD.status
      USING ERRCODE = 'P0003';
  END IF;

  -- Guard transition from NOT_STARTED to IN_PROGRESS
  IF OLD.status = 'NOT_STARTED' AND NEW.status = 'IN_PROGRESS' THEN
    -- 1. Authorized via billing gateway (billing_begin)
    IF current_setting('proctora.begin_ok', true) = 'on' THEN
      RETURN NEW;
    END IF;

    -- 2. Non-live session (e.g. PRACTICE, DEMO)
    IF NEW.kind <> 'LIVE' THEN
      RETURN NEW;
    END IF;

    -- 3. Legitimate application session service execution (SessionService.beginSession)
    IF current_setting('proctora.session_service_ok', true) = 'on'
       OR (NEW.started_at IS NOT NULL AND NEW.deadline_at IS NOT NULL)
    THEN
      RETURN NEW;
    END IF;

    -- Direct unauthorized transition without billing authorization is rejected
    RAISE EXCEPTION 'Unauthorized session start: direct transition from NOT_STARTED to IN_PROGRESS is forbidden without billing gateway authorization'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_session_start
  BEFORE UPDATE ON "public"."session"
  FOR EACH ROW EXECUTE FUNCTION public.guard_session_start();

-- ----------------------------------------------------------------------------
-- 6. Concurrency Primitive: billing.billing_begin()
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing.billing_begin(
  p_session_id text,
  p_mode text DEFAULT 'enforce'
)
RETURNS TABLE (outcome text, pool_id text, balance_remaining int) AS $$
DECLARE
  v_session RECORD;
  v_acct_id text;
  v_pool_id text;
  v_rem int;
  v_existing_ledger RECORD;
BEGIN
  -- Prevent Search Path Hijacking & enforce bounded statement execution
  SET LOCAL search_path = pg_catalog, billing, platform, public;
  SET LOCAL lock_timeout = '2s';
  SET LOCAL statement_timeout = '5s';
  SET LOCAL proctora.begin_ok = 'on';

  -- Check if session exists
  SELECT s.id, s.status, s.kind, s.drive_id, s.organization_id
    INTO v_session
    FROM "public"."session" s
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session % not found', p_session_id USING ERRCODE = 'P0005';
  END IF;

  -- Idempotency check: if session already started or already acquired credit
  IF v_session.status <> 'NOT_STARTED' THEN
    SELECT l.credit_pool_id, l.balance_after INTO v_existing_ledger
      FROM "billing"."credit_ledger_entry" l
     WHERE l.session_id = p_session_id
       AND l.entry_type IN ('CONSUME', 'OVERDRAFT', 'WAIVE')
     LIMIT 1;

    RETURN QUERY SELECT 'ALREADY_STARTED'::text, v_existing_ledger.credit_pool_id, COALESCE(v_existing_ledger.balance_after, 0);
    RETURN;
  END IF;

  -- Step 1: Claim Session Transition (Guards double-click, 2 tabs, retries)
  UPDATE "public"."session"
     SET status = 'IN_PROGRESS'
   WHERE id = p_session_id AND status = 'NOT_STARTED';

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'ALREADY_STARTED'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Non-live sessions or bypass mode ('off')
  IF v_session.kind <> 'LIVE' OR p_mode = 'off' THEN
    UPDATE "public"."session" SET started_at = clock_timestamp() WHERE id = p_session_id;
    RETURN QUERY SELECT 'STARTED'::text, NULL::text, 0;
    RETURN;
  END IF;

  -- Resolve Billing Account
  SELECT billing_account_id INTO v_acct_id FROM "public"."organization" WHERE id = v_session.organization_id;

  IF v_acct_id IS NULL THEN
    RAISE EXCEPTION 'No billing account associated with organization % for session %', v_session.organization_id, p_session_id
      USING ERRCODE = 'P0006';
  END IF;

  -- Step 2: Claim 1 Credit (Drive Pass first, then single ACTIVE general pool)
  -- FOR UPDATE locks the selected credit pool row to prevent concurrent race conditions
  WITH eligible_pool AS (
    SELECT p.id FROM "billing"."credit_pool" p
     WHERE p.billing_account_id = v_acct_id
       AND p.status = 'ACTIVE'
       AND p.cached_remaining >= 1
       AND (p.expires_at IS NULL OR p.expires_at > clock_timestamp())
       AND (
         p.drive_id = v_session.drive_id
         OR (p.drive_id IS NULL AND (
           EXISTS (SELECT 1 FROM "public"."drive" d WHERE d.id = v_session.drive_id AND d.fallthrough = 'ALLOW')
           OR NOT EXISTS (SELECT 1 FROM "billing"."credit_pool" dp WHERE dp.drive_id = v_session.drive_id AND dp.status = 'ACTIVE')
         ))
       )
     ORDER BY (p.drive_id IS NULL), p.queue_order, p.created_at
     LIMIT 1
     FOR UPDATE
  )
  UPDATE "billing"."credit_pool" p
     SET cached_remaining = p.cached_remaining - 1
    FROM eligible_pool
   WHERE p.id = eligible_pool.id
  RETURNING p.id, p.cached_remaining INTO v_pool_id, v_rem;

  -- If no eligible pool had available balance:
  IF NOT FOUND THEN
    UPDATE "public"."session"
       SET status = 'NOT_STARTED',
           held_at = clock_timestamp(),
           hold_reason = 'CREDITS_EXHAUSTED'
     WHERE id = p_session_id;
    
    RAISE EXCEPTION 'NEEDS_SLOW_PATH' USING ERRCODE = 'P0001';
  END IF;

  -- Step 3: Insert Immutable Ledger Entry
  IF p_mode = 'shadow' THEN
    INSERT INTO "billing"."credit_ledger_entry" (
      id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
      session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
    ) VALUES (
      gen_random_uuid()::text, v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
      p_session_id, v_session.drive_id, 'shadow:acquire:' || p_session_id, 'system', 'ATTEMPT_START', true, clock_timestamp()
    );
  ELSE
    INSERT INTO "billing"."credit_ledger_entry" (
      id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
      session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
    ) VALUES (
      gen_random_uuid()::text, v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
      p_session_id, v_session.drive_id, 'acquire:' || p_session_id, 'system', 'ATTEMPT_START', false, clock_timestamp()
    );
  END IF;

  -- Step 4: Candidate Clock Starts After Lock is Released (R3)
  UPDATE "public"."session" SET started_at = clock_timestamp() WHERE id = p_session_id;

  -- Step 5: Initialize Session Billing Evidence
  INSERT INTO "billing"."session_billing_evidence" (
    session_id, billing_account_id, drive_id, kind, started_at, created_at
  ) VALUES (
    p_session_id, v_acct_id, v_session.drive_id, v_session.kind, clock_timestamp(), clock_timestamp()
  ) ON CONFLICT (session_id) DO NOTHING;

  RETURN QUERY SELECT 'STARTED'::text, v_pool_id, v_rem;
END;
$$ LANGUAGE plpgsql;

-- UUID Overload for billing.billing_begin()
CREATE OR REPLACE FUNCTION billing.billing_begin(
  p_session_id uuid,
  p_mode text DEFAULT 'enforce'
)
RETURNS TABLE (outcome text, pool_id text, balance_remaining int) AS $$
BEGIN
  RETURN QUERY SELECT * FROM billing.billing_begin(p_session_id::text, p_mode);
END;
$$ LANGUAGE plpgsql;
