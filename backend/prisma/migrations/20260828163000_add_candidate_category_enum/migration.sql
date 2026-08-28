-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CandidateCategory" AS ENUM ('FRESHER', 'EXPERIENCED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable role_template
DO $$ BEGIN
  ALTER TABLE "role_template" ADD COLUMN "category" "CandidateCategory";
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "role_template" ADD COLUMN "experience_tier" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- AlterTable invite
DO $$ BEGIN
  ALTER TABLE "invite" ADD COLUMN "category" "CandidateCategory";
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "invite" ADD COLUMN "experience_tier" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;
