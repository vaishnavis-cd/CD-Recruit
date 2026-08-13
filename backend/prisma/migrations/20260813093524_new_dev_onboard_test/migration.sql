-- AlterTable
ALTER TABLE "partner" ADD COLUMN     "api_hit_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_revoked" BOOLEAN NOT NULL DEFAULT false;
