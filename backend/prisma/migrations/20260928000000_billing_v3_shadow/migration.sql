-- ============================================================================
-- PROCTORA — Migration: 20260928000000_billing_v3_shadow
-- Description: Updates billing_begin SQL function with SAVEPOINT isolation
--              and non-mutating credit pool simulation for Phase 2 Shadow Mode.
-- ============================================================================

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

  -- ── Shadow Mode (Phase 2) ─────────────────────────────────────────────────
  -- Simulates pool selection and records shadow ledger entry with shadow = true.
  -- Wraps writes in internal PL/pgSQL exception block (SAVEPOINT) so shadow errors
  -- NEVER fail or abort the candidate session start.
  IF p_mode = 'shadow' THEN
    BEGIN
      -- Step 2A: Query eligible pool (without mutating cached_remaining)
      SELECT p.id, p.cached_remaining INTO v_pool_id, v_rem
        FROM credit_pool p
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
       LIMIT 1;

      -- Step 2B: Record shadow ledger entry
      IF v_pool_id IS NOT NULL THEN
        INSERT INTO credit_ledger_entry (
          id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
          session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
        ) VALUES (
          gen_random_uuid()::text, v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem - 1,
          p_session_id, v_session.drive_id, 'shadow:acquire:' || p_session_id, 'system', 'ATTEMPT_START', true, clock_timestamp()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      ELSE
        -- Fallback simulation (unfunded / overdraft) in shadow mode
        INSERT INTO credit_ledger_entry (
          id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
          session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
        ) VALUES (
          gen_random_uuid()::text, v_acct_id, v_session.organization_id, NULL, 'OVERDRAFT', -1, NULL,
          p_session_id, v_session.drive_id, 'shadow:acquire:' || p_session_id, 'system', 'OVERDRAFT_USED', true, clock_timestamp()
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- SAVEPOINT isolation: rollback shadow subtransaction and continue session start
      RAISE WARNING 'Shadow billing simulation failed for session %: %', p_session_id, SQLERRM;
    END;

    UPDATE session SET started_at = clock_timestamp() WHERE id = p_session_id;
    RETURN QUERY SELECT 'STARTED'::text, v_pool_id, COALESCE(v_rem, 0);
    RETURN;
  END IF;

  -- ── Enforce Mode (Phase 3) ────────────────────────────────────────────────
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NEEDS_SLOW_PATH' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO credit_ledger_entry (
    id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after,
    session_id, drive_id, idempotency_key, actor_id, reason, shadow, created_at
  ) VALUES (
    gen_random_uuid()::text, v_acct_id, v_session.organization_id, v_pool_id, 'CONSUME', -1, v_rem,
    p_session_id, v_session.drive_id, 'acquire:' || p_session_id, 'system', 'ATTEMPT_START', false, clock_timestamp()
  );

  UPDATE session SET started_at = clock_timestamp() WHERE id = p_session_id;

  RETURN QUERY SELECT 'STARTED'::text, v_pool_id, v_rem;
END;
$$ LANGUAGE plpgsql;
