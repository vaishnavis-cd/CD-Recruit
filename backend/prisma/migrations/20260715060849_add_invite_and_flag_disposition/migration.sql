-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'REDEEMED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "integrity_flag" ADD COLUMN     "disposition" TEXT,
ADD COLUMN     "disposition_at" TIMESTAMP(3),
ADD COLUMN     "disposition_by_id" TEXT;

-- CreateTable
CREATE TABLE "invite" (
    "id" TEXT NOT NULL,
    "candidate_email" TEXT NOT NULL,
    "candidate_name" TEXT NOT NULL,
    "role_template_id" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "redeemed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "session_id" TEXT,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_token_key" ON "invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invite_session_id_key" ON "invite"("session_id");

-- CreateIndex
CREATE INDEX "invite_candidate_email_idx" ON "invite"("candidate_email");

-- CreateIndex
CREATE INDEX "invite_status_idx" ON "invite"("status");

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
