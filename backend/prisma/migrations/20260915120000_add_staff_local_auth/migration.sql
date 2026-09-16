-- AlterTable
ALTER TABLE "staff" ADD COLUMN "password_hash" TEXT,
ADD COLUMN "refresh_token_hash" TEXT;
