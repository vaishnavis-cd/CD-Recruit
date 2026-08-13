-- AlterTable
ALTER TABLE "score" ADD COLUMN     "say_do_mismatches" JSONB;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "workspace_status" TEXT DEFAULT 'provisioning';
