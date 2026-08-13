-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OriginChannel" AS ENUM ('DIRECT', 'PARTNER_API');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "drive" ADD COLUMN "origin_channel" "OriginChannel" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN "is_editing_unlocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "invite" ADD COLUMN "origin_channel" "OriginChannel" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "session" ADD COLUMN "origin_channel" "OriginChannel" NOT NULL DEFAULT 'DIRECT';
