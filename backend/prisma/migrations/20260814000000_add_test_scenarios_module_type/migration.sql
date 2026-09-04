-- AlterEnum
ALTER TYPE "ModuleType" ADD VALUE 'TEST_SCENARIOS';

-- AlterTable
ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "target_level" TEXT;

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN IF NOT EXISTS "id_proof_extracted_name" TEXT,
ADD COLUMN IF NOT EXISTS "id_proof_ocr_raw" TEXT,
ADD COLUMN IF NOT EXISTS "ocr_confidence" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "baseline_selfie_embedding" JSONB,
ADD COLUMN IF NOT EXISTS "baseline_selfie_ref" TEXT,
ADD COLUMN IF NOT EXISTS "identity_verification_result" JSONB;

-- AlterTable
ALTER TABLE "invite" ADD COLUMN IF NOT EXISTS "category" TEXT,
ADD COLUMN IF NOT EXISTS "experience_tier" TEXT;

-- AlterTable
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "baseline_selfie_embedding" JSONB,
ADD COLUMN IF NOT EXISTS "id_proof_ref" TEXT,
ADD COLUMN IF NOT EXISTS "id_proof_embedding" JSONB,
ADD COLUMN IF NOT EXISTS "id_verified_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "identity_verification_result" JSONB;

-- CreateTable
CREATE TABLE "module_setting" (
    "id" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "module_type" "ModuleType" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "module_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_capture" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "window_index" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "captured_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "image_ref" TEXT,
    "matched" BOOLEAN,
    "distance" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "verified_at" TIMESTAMP(3),

    CONSTRAINT "identity_capture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "module_setting_department_module_type_key" ON "module_setting"("department", "module_type");

-- CreateIndex
CREATE INDEX "identity_capture_session_id_idx" ON "identity_capture"("session_id");

-- CreateIndex
CREATE INDEX "identity_capture_status_idx" ON "identity_capture"("status");

-- CreateIndex
CREATE UNIQUE INDEX "identity_capture_session_id_window_index_key" ON "identity_capture"("session_id", "window_index");

-- AddForeignKey
ALTER TABLE "identity_capture" ADD CONSTRAINT "identity_capture_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
