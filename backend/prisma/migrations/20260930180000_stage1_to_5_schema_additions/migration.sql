-- AlterTable platform.tenant_profile
ALTER TABLE "platform"."tenant_profile" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3);
ALTER TABLE "platform"."tenant_profile" ADD COLUMN IF NOT EXISTS "suspended_by_id" TEXT;
ALTER TABLE "platform"."tenant_profile" ADD COLUMN IF NOT EXISTS "walkthrough_checklist" JSONB DEFAULT '{}';

-- AlterTable platform.platform_audit_event
ALTER TABLE "platform"."platform_audit_event" ADD COLUMN IF NOT EXISTS "target_tenant_id" VARCHAR(128);
CREATE INDEX IF NOT EXISTS "platform_audit_event_target_tenant_id_idx" ON "platform"."platform_audit_event"("target_tenant_id");

-- AlterTable platform.onboarding_draft
ALTER TABLE "platform"."onboarding_draft" ADD COLUMN IF NOT EXISTS "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "platform"."onboarding_draft" ADD COLUMN IF NOT EXISTS "committed_organization_id" TEXT;
ALTER TABLE "platform"."onboarding_draft" ADD COLUMN IF NOT EXISTS "last_commit_error" TEXT;
