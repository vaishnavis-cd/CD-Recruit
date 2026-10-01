-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "billing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- AlterTable public.drive
ALTER TABLE "public"."drive" ADD COLUMN "fallthrough" VARCHAR(16) NOT NULL DEFAULT 'ALLOW';

-- AlterTable public.session
ALTER TABLE "public"."session" ADD COLUMN "end_reason" VARCHAR(32);
ALTER TABLE "public"."session" ADD COLUMN "held_at" TIMESTAMP(3);
ALTER TABLE "public"."session" ADD COLUMN "hold_reason" VARCHAR(32);
ALTER TABLE "public"."session" ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'LIVE';

-- AlterTable public.organization (Add nullable billing_account_id to permit backfill)
ALTER TABLE "public"."organization" ADD COLUMN "appeal_window_days_override" INTEGER;
ALTER TABLE "public"."organization" ADD COLUMN "billing_account_id" TEXT;

-- CreateTable billing.billing_account
CREATE TABLE "billing"."billing_account" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "legal_entity_name" VARCHAR(255),
    "billing_country" VARCHAR(2) NOT NULL DEFAULT 'IN',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "tax_id" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "overdraft_limit" INTEGER NOT NULL DEFAULT 0,
    "overdraft_used" INTEGER NOT NULL DEFAULT 0,
    "has_paid_purchase" BOOLEAN NOT NULL DEFAULT false,
    "trial_domain" VARCHAR(255),
    "trial_granted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.credit_pool
CREATE TABLE "billing"."credit_pool" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "drive_id" TEXT,
    "pool_type" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "cached_remaining" INTEGER NOT NULL,
    "validity_days" INTEGER,
    "max_wait_days" INTEGER NOT NULL DEFAULT 365,
    "queue_order" INTEGER,
    "status" VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clock_started_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "unit_price_minor" INTEGER,
    "currency" VARCHAR(3),
    "payment_id" TEXT,
    "terms_version" VARCHAR(32),
    "terms_accepted_by" VARCHAR(255),
    "terms_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.credit_ledger_entry
CREATE TABLE "billing"."credit_ledger_entry" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "credit_pool_id" TEXT,
    "entry_type" VARCHAR(32) NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER,
    "session_id" TEXT,
    "drive_id" TEXT,
    "related_entry_id" TEXT,
    "grant_source" VARCHAR(32),
    "reason" VARCHAR(64) NOT NULL,
    "reason_note" VARCHAR(200),
    "payment_id" TEXT,
    "request_id" TEXT,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "actor_id" VARCHAR(128) NOT NULL,
    "approved_by_id" VARCHAR(128),
    "shadow" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.payment
CREATE TABLE "billing"."payment" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_payment_id" VARCHAR(128) NOT NULL,
    "provider_order_id" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL,
    "price_book_entry_id" TEXT NOT NULL,
    "quantity_credits" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "tax_minor" INTEGER,
    "currency" VARCHAR(3) NOT NULL,
    "invoice_number" VARCHAR(64),
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.manual_billing_request
CREATE TABLE "billing"."manual_billing_request" (
    "id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "ticket_ref" VARCHAR(64) NOT NULL,
    "requested_by_id" VARCHAR(128) NOT NULL,
    "approved_by_id" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "execution_error" TEXT,
    "decided_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_billing_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.price_book_entry
CREATE TABLE "billing"."price_book_entry" (
    "id" TEXT NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "pool_type" VARCHAR(32) NOT NULL,
    "credits" INTEGER NOT NULL,
    "validity_days" INTEGER,
    "billing_country" VARCHAR(2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "price_book_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.billing_audit_event
CREATE TABLE "billing"."billing_audit_event" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" VARCHAR(128) NOT NULL,
    "actor_role" VARCHAR(32) NOT NULL,
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ticket_ref" VARCHAR(64),
    "impersonation_context" JSONB,
    "request_id" TEXT,
    "execution_result" VARCHAR(16) NOT NULL,

    CONSTRAINT "billing_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.session_billing_evidence
CREATE TABLE "billing"."session_billing_evidence" (
    "session_id" TEXT NOT NULL,
    "billing_account_id" TEXT NOT NULL,
    "drive_id" TEXT,
    "kind" VARCHAR(16),
    "started_at" TIMESTAMP(3),
    "first_content_rendered_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "end_reason" VARCHAR(32),
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "modules_reached" INTEGER NOT NULL DEFAULT 0,
    "cv_mode" VARCHAR(32),
    "infra_flags" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_billing_evidence_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable billing.payment_event
CREATE TABLE "billing"."payment_event" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable billing.reconciliation_run
CREATE TABLE "billing"."reconciliation_run" (
    "id" TEXT NOT NULL,
    "run_type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "check_results" JSONB NOT NULL,
    "drift_detected" BOOLEAN NOT NULL DEFAULT false,
    "discrepancy_details" JSONB,
    "executed_by" VARCHAR(128) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reconciliation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform.platform_staff
CREATE TABLE "platform"."platform_staff" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'SUPPORT',
    "password_hash" TEXT,
    "refresh_token_hash" TEXT,
    "totp_secret_encrypted" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform.platform_audit_event
CREATE TABLE "platform"."platform_audit_event" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" VARCHAR(128) NOT NULL,
    "actor_role" VARCHAR(32) NOT NULL,
    "subject_type" VARCHAR(32) NOT NULL,
    "subject_id" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ticket_ref" VARCHAR(64),
    "impersonation_context" JSONB,
    "request_id" TEXT,
    "execution_result" VARCHAR(16) NOT NULL,

    CONSTRAINT "platform_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform.incident_window
CREATE TABLE "platform"."incident_window" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "reason" TEXT NOT NULL,
    "ticket_ref" VARCHAR(64) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "affected_drives" TEXT[],
    "reversal_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "created_by" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_window_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- BACKFILL: Existing Organizations -> BillingAccount
-- ============================================================================
DO $$
DECLARE
    org_rec RECORD;
    new_ba_id TEXT;
BEGIN
    FOR org_rec IN 
        SELECT id, name FROM "public"."organization" WHERE "billing_account_id" IS NULL
    LOOP
        new_ba_id := gen_random_uuid()::text;
        
        INSERT INTO "billing"."billing_account" (
            "id",
            "name",
            "billing_country",
            "currency",
            "status",
            "overdraft_limit",
            "overdraft_used",
            "has_paid_purchase",
            "created_at",
            "updated_at"
        ) VALUES (
            new_ba_id,
            org_rec.name,
            'IN',
            'INR',
            'ACTIVE',
            0,
            0,
            false,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );

        UPDATE "public"."organization"
        SET "billing_account_id" = new_ba_id
        WHERE "id" = org_rec.id;
    END LOOP;
END $$;

-- Enforce NOT NULL on billing_account_id now that every organization is backfilled
ALTER TABLE "public"."organization" ALTER COLUMN "billing_account_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "billing_account_trial_domain_key" ON "billing"."billing_account"("trial_domain");

-- CreateIndex
CREATE INDEX "billing_account_status_idx" ON "billing"."billing_account"("status");

-- CreateIndex
CREATE INDEX "credit_pool_billing_account_id_status_idx" ON "billing"."credit_pool"("billing_account_id", "status");

-- CreateIndex
CREATE INDEX "credit_pool_expires_at_idx" ON "billing"."credit_pool"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_entry_idempotency_key_key" ON "billing"."credit_ledger_entry"("idempotency_key");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_billing_account_id_created_at_idx" ON "billing"."credit_ledger_entry"("billing_account_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_credit_pool_id_created_at_idx" ON "billing"."credit_ledger_entry"("credit_pool_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_session_id_idx" ON "billing"."credit_ledger_entry"("session_id");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_drive_id_entry_type_idx" ON "billing"."credit_ledger_entry"("drive_id", "entry_type");

-- CreateIndex
CREATE INDEX "payment_billing_account_id_created_at_idx" ON "billing"."payment"("billing_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_provider_payment_id_key" ON "billing"."payment"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "manual_billing_request_billing_account_id_status_idx" ON "billing"."manual_billing_request"("billing_account_id", "status");

-- CreateIndex
CREATE INDEX "manual_billing_request_status_created_at_idx" ON "billing"."manual_billing_request"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "price_book_entry_sku_billing_country_version_key" ON "billing"."price_book_entry"("sku", "billing_country", "version");

-- CreateIndex
CREATE INDEX "billing_audit_event_subject_type_subject_id_idx" ON "billing"."billing_audit_event"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "billing_audit_event_timestamp_idx" ON "billing"."billing_audit_event"("timestamp");

-- CreateIndex
CREATE INDEX "session_billing_evidence_billing_account_id_idx" ON "billing"."session_billing_evidence"("billing_account_id");

-- CreateIndex
CREATE INDEX "session_billing_evidence_drive_id_idx" ON "billing"."session_billing_evidence"("drive_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_event_provider_event_id_key" ON "billing"."payment_event"("provider", "event_id");

-- CreateIndex
CREATE INDEX "reconciliation_run_started_at_idx" ON "billing"."reconciliation_run"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_staff_email_key" ON "platform"."platform_staff"("email");

-- CreateIndex
CREATE INDEX "platform_audit_event_subject_type_subject_id_idx" ON "platform"."platform_audit_event"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "platform_audit_event_timestamp_idx" ON "platform"."platform_audit_event"("timestamp");

-- CreateIndex
CREATE INDEX "incident_window_started_at_ended_at_idx" ON "platform"."incident_window"("started_at", "ended_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_billing_account_id_key" ON "public"."organization"("billing_account_id");

-- AddForeignKey
ALTER TABLE "public"."organization" ADD CONSTRAINT "organization_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing"."billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_pool" ADD CONSTRAINT "credit_pool_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing"."billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_pool" ADD CONSTRAINT "credit_pool_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing"."payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing"."billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_credit_pool_id_fkey" FOREIGN KEY ("credit_pool_id") REFERENCES "billing"."credit_pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_related_entry_id_fkey" FOREIGN KEY ("related_entry_id") REFERENCES "billing"."credit_ledger_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing"."payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "billing"."manual_billing_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."payment" ADD CONSTRAINT "payment_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing"."billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."payment" ADD CONSTRAINT "payment_price_book_entry_id_fkey" FOREIGN KEY ("price_book_entry_id") REFERENCES "billing"."price_book_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing"."manual_billing_request" ADD CONSTRAINT "manual_billing_request_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing"."billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
