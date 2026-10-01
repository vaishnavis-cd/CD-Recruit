-- Enums in platform schema
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantLifecycleStage') THEN
        CREATE TYPE "platform"."TenantLifecycleStage" AS ENUM ('ONBOARDING', 'TRIAL', 'ACTIVE', 'DORMANT', 'SUSPENDED', 'CHURNED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LicenseTier') THEN
        CREATE TYPE "platform"."LicenseTier" AS ENUM ('STARTER', 'GROWTH', 'ENTERPRISE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OverrideType') THEN
        CREATE TYPE "platform"."OverrideType" AS ENUM ('PROCTORING_SENSITIVITY', 'SCHEDULE_EXTENSION', 'QUESTION_FIX', 'INVITE_RATIO', 'INCIDENT_WINDOW');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OverrideStatus') THEN
        CREATE TYPE "platform"."OverrideStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentScopeType') THEN
        CREATE TYPE "platform"."IncidentScopeType" AS ENUM ('PLATFORM_WIDE', 'TENANT_SPECIFIC');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IncidentStatus') THEN
        CREATE TYPE "platform"."IncidentStatus" AS ENUM ('ACTIVE', 'RESOLVED');
    END IF;
END $$;

-- CreateTable platform.tenant_profile
CREATE TABLE IF NOT EXISTS "platform"."tenant_profile" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lifecycle_stage" "platform"."TenantLifecycleStage" NOT NULL DEFAULT 'ONBOARDING',
    "domain_verified_at" TIMESTAMP(3),
    "walkthrough_completed_at" TIMESTAMP(3),
    "internal_owner_id" TEXT,
    "license_tier" "platform"."LicenseTier" NOT NULL DEFAULT 'STARTER',
    "entitlements" JSONB NOT NULL DEFAULT '{}',
    "appeal_window_days_override" INTEGER,
    "trial_nudge_log" JSONB NOT NULL DEFAULT '[]',
    "is_manually_suspended" BOOLEAN NOT NULL DEFAULT false,
    "is_manually_churned" BOOLEAN NOT NULL DEFAULT false,
    "suspension_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform.override_action
CREATE TABLE IF NOT EXISTS "platform"."override_action" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "drive_id" TEXT,
    "override_type" "platform"."OverrideType" NOT NULL,
    "before_state" JSONB NOT NULL,
    "after_state" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "status" "platform"."OverrideStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "override_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform.impersonation_session
CREATE TABLE IF NOT EXISTS "platform"."impersonation_session" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "impersonated_user_id" TEXT NOT NULL,
    "ticket_ref" TEXT NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "terminated_at" TIMESTAMP(3),
    "termination_reason" TEXT,
    "client_ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonation_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform.onboarding_draft
CREATE TABLE IF NOT EXISTS "platform"."onboarding_draft" (
    "id" TEXT NOT NULL,
    "corporate_domain" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "draft_data" JSONB NOT NULL DEFAULT '{}',
    "created_by_staff_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_draft_pkey" PRIMARY KEY ("id")
);

-- Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_profile_organization_id_key" ON "platform"."tenant_profile"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_draft_corporate_domain_key" ON "platform"."onboarding_draft"("corporate_domain");

-- Foreign keys
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_profile_organization_id_fkey') THEN
        ALTER TABLE "platform"."tenant_profile" ADD CONSTRAINT "tenant_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'override_action_organization_id_fkey') THEN
        ALTER TABLE "platform"."override_action" ADD CONSTRAINT "override_action_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'override_action_drive_id_fkey') THEN
        ALTER TABLE "platform"."override_action" ADD CONSTRAINT "override_action_drive_id_fkey" FOREIGN KEY ("drive_id") REFERENCES "public"."drive"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'override_action_requested_by_id_fkey') THEN
        ALTER TABLE "platform"."override_action" ADD CONSTRAINT "override_action_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "platform"."platform_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'override_action_approved_by_id_fkey') THEN
        ALTER TABLE "platform"."override_action" ADD CONSTRAINT "override_action_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "platform"."platform_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'impersonation_session_staff_id_fkey') THEN
        ALTER TABLE "platform"."impersonation_session" ADD CONSTRAINT "impersonation_session_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "platform"."platform_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'impersonation_session_organization_id_fkey') THEN
        ALTER TABLE "platform"."impersonation_session" ADD CONSTRAINT "impersonation_session_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'onboarding_draft_created_by_staff_id_fkey') THEN
        ALTER TABLE "platform"."onboarding_draft" ADD CONSTRAINT "onboarding_draft_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "platform"."platform_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Indexes for Platform Tenants List & Filtering Performance
CREATE INDEX IF NOT EXISTS "organization_name_idx" ON "public"."organization"("name");
CREATE INDEX IF NOT EXISTS "organization_created_at_idx" ON "public"."organization"("created_at");
CREATE INDEX IF NOT EXISTS "drive_organization_id_idx" ON "public"."drive"("organization_id");
CREATE INDEX IF NOT EXISTS "tenant_profile_lifecycle_stage_idx" ON "platform"."tenant_profile"("lifecycle_stage");
CREATE INDEX IF NOT EXISTS "tenant_profile_license_tier_idx" ON "platform"."tenant_profile"("license_tier");
CREATE INDEX IF NOT EXISTS "tenant_profile_created_at_idx" ON "platform"."tenant_profile"("created_at");
