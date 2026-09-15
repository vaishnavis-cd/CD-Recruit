/*
  Warnings:

  - A unique constraint covering the columns `[department,category,experience_tier,version]` on the table `role_template` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX IF EXISTS "role_template_department_level_version_key";

-- AlterTable
DO $$ BEGIN
  ALTER TABLE "role_template" ADD COLUMN "category" "CandidateCategory";
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "role_template" ADD COLUMN "experience_tier" TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "role_template_department_category_experience_tier_version_key" ON "role_template"("department", "category", "experience_tier", "version");


