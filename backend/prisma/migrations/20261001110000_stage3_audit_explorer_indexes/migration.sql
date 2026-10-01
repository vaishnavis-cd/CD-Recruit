-- Stage 3: Audit Explorer Performance & Keyset Pagination Indexes
-- Strictly idempotent: IF NOT EXISTS applied on platform schema only

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor_id
  ON platform.platform_audit_event (actor_id);

CREATE INDEX IF NOT EXISTS idx_platform_audit_action
  ON platform.platform_audit_event (action);

CREATE INDEX IF NOT EXISTS idx_platform_audit_occurred_id_desc
  ON platform.platform_audit_event (timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_ticket_ref
  ON platform.platform_audit_event (ticket_ref)
  WHERE ticket_ref IS NOT NULL;
