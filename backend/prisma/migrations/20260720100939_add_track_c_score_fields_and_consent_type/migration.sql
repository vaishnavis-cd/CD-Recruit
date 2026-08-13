/*
  Warnings:

  - Added the required column `consent_type` to the `consent_record` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'BIOMETRIC', 'SELFIE', 'AUDIO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProctoringEventType" ADD VALUE 'SPEECH_DETECTED';
ALTER TYPE "ProctoringEventType" ADD VALUE 'SECOND_VOICE_SUSPECTED';
ALTER TYPE "ProctoringEventType" ADD VALUE 'IDENTITY_MISMATCH';
ALTER TYPE "ProctoringEventType" ADD VALUE 'TAB_SWITCH';
ALTER TYPE "ProctoringEventType" ADD VALUE 'PASTE';
ALTER TYPE "ProctoringEventType" ADD VALUE 'FULLSCREEN_EXIT';

-- AlterTable
ALTER TABLE "consent_record" ADD COLUMN     "consent_type" "ConsentType" NOT NULL;

-- AlterTable
ALTER TABLE "drive" ADD COLUMN     "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "grace_minutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "slot_distribution" JSONB;

-- AlterTable
ALTER TABLE "drive_question" ADD COLUMN     "question_version_snapshot" INTEGER;

-- AlterTable
ALTER TABLE "invite" ADD COLUMN     "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "grace_minutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "scheduled_time" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviewer_decision" ADD COLUMN     "agreed_with_ai" BOOLEAN;

-- AlterTable
ALTER TABLE "score" ADD COLUMN     "grading_source" TEXT NOT NULL DEFAULT 'placeholder',
ADD COLUMN     "say_do_rationale" TEXT;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "actual_start_at" TIMESTAMP(3),
ADD COLUMN     "tutorial_mode" TEXT NOT NULL DEFAULT 'full';
