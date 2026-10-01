-- AlterTable public.organization: drop NOT NULL on billing_account_id to match Artifact 03 §2.4.1 and enable multi-step onboarding
ALTER TABLE "public"."organization" ALTER COLUMN "billing_account_id" DROP NOT NULL;
