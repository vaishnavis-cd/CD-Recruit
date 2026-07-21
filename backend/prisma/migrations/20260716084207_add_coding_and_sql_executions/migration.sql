/*
  Warnings:

  - You are about to drop the column `role_template_id` on the `question` table. All the data in the column will be lost.

*/
-- CreateEnum (IF NOT EXISTS guards for idempotency — these types may have been created by a prior db push)
DO $$ BEGIN
  CREATE TYPE "DriveStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SubmissionType" AS ENUM ('RUN', 'SUBMIT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'COMPILATION_ERROR', 'RUNTIME_ERROR', 'TIMEOUT', 'MEMORY_LIMIT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "SqlExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'QUERY_ERROR', 'TIMEOUT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- DropForeignKey (ignore if not exists)
ALTER TABLE IF EXISTS "question" DROP CONSTRAINT IF EXISTS "question_role_template_id_fkey";

-- AlterTable (ADD COLUMN IF NOT EXISTS)
ALTER TABLE "invite"
  ADD COLUMN IF NOT EXISTS "drive_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_generated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (ADD COLUMN IF NOT EXISTS)
ALTER TABLE "question"
  DROP COLUMN IF EXISTS "role_template_id";
ALTER TABLE "question"
  ADD COLUMN IF NOT EXISTS "difficulty" TEXT,
  ADD COLUMN IF NOT EXISTS "folder_id" TEXT,
  ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS "scoring_config" JSONB,
  ADD COLUMN IF NOT EXISTS "status" "QuestionStatus" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS "tags" TEXT[],
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "reviewer_decision" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- AlterTable
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "drive_id" TEXT;

-- CreateTable (IF NOT EXISTS for idempotency)
CREATE TABLE IF NOT EXISTS "drive" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role_template_id" TEXT NOT NULL,
    "module_config" JSONB NOT NULL,
    "status" "DriveStatus" NOT NULL DEFAULT 'DRAFT',
    "schedule_start" TIMESTAMP(3),
    "schedule_end" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "drive_question" (
    "id" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "module_type" "ModuleType" NOT NULL,

    CONSTRAINT "drive_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coding_execution" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "language_id" INTEGER NOT NULL,
    "submission_type" "SubmissionType" NOT NULL,
    "source_code" TEXT NOT NULL,
    "judge0_token" TEXT,
    "status" "ExecutionStatus" NOT NULL,
    "stdout" TEXT,
    "stderr" TEXT,
    "compile_output" TEXT,
    "passed_tests" INTEGER NOT NULL,
    "total_tests" INTEGER NOT NULL,
    "execution_time" DOUBLE PRECISION,
    "memory_usage" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "coding_execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sql_execution" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "submission_type" "SubmissionType" NOT NULL,
    "query" TEXT NOT NULL,
    "status" "SqlExecutionStatus" NOT NULL,
    "result_json" JSONB,
    "passed" BOOLEAN NOT NULL,
    "execution_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "sql_execution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "drive_question_drive_id_question_id_key" ON "drive_question"("drive_id", "question_id");

-- AddForeignKey (IF NOT EXISTS via DO block)
DO $$ BEGIN
  ALTER TABLE "drive" ADD CONSTRAINT "drive_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "drive" ADD CONSTRAINT "drive_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "drive_question" ADD CONSTRAINT "drive_question_drive_id_fkey" FOREIGN KEY ("drive_id") REFERENCES "drive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "drive_question" ADD CONSTRAINT "drive_question_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "session" ADD CONSTRAINT "session_drive_id_fkey" FOREIGN KEY ("drive_id") REFERENCES "drive"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "invite" ADD CONSTRAINT "invite_drive_id_fkey" FOREIGN KEY ("drive_id") REFERENCES "drive"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "coding_execution" ADD CONSTRAINT "coding_execution_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "coding_execution" ADD CONSTRAINT "coding_execution_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "sql_execution" ADD CONSTRAINT "sql_execution_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "sql_execution" ADD CONSTRAINT "sql_execution_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
