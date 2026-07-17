-- CreateEnum
CREATE TYPE "ProctoringUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'FAILED');

-- AlterTable
ALTER TABLE "proctoring_event" ADD COLUMN     "upload_status" "ProctoringUploadStatus" NOT NULL DEFAULT 'PENDING';
