-- CreateEnum (IF NOT EXISTS for idempotency)
DO $$ BEGIN
  CREATE TYPE "ProctoringUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable (ADD COLUMN IF NOT EXISTS)
ALTER TABLE "proctoring_event" ADD COLUMN IF NOT EXISTS "upload_status" "ProctoringUploadStatus" NOT NULL DEFAULT 'PENDING';
