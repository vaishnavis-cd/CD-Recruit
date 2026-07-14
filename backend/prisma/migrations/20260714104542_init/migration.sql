-- CreateEnum
CREATE TYPE "ModuleType" AS ENUM ('MCQ', 'SQL', 'CODING', 'AI_PROMPTING', 'SIMULATION');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DISCONNECTED', 'AUTO_SUBMITTED', 'SUBMITTED', 'CLOSED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CvMode" AS ENUM ('FULL', 'REDUCED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('RECRUITER', 'ADMIN');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('ADVANCE', 'REJECT');

-- CreateTable
CREATE TABLE "role_template" (
    "id" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "weighting_preset" JSONB NOT NULL,
    "duration_minutes" INTEGER NOT NULL,

    CONSTRAINT "role_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" TEXT NOT NULL,
    "role_template_id" TEXT NOT NULL,
    "module_type" "ModuleType" NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "role_template_id" TEXT NOT NULL,
    "cv_mode" "CvMode" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "baseline_selfie_ref" TEXT,
    "started_at" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "active_tab_id" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_response" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "response_payload" JSONB NOT NULL,
    "time_spent_seconds" INTEGER,
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "last_autosaved_at" TIMESTAMP(3),

    CONSTRAINT "module_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_log" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_flag" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "flagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_clip" (
    "id" TEXT NOT NULL,
    "flag_id" TEXT NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "composite_score" DOUBLE PRECISION NOT NULL,
    "module_scores" JSONB NOT NULL,
    "say_do_consistency_score" DOUBLE PRECISION NOT NULL,
    "ai_confidence" DOUBLE PRECISION NOT NULL,
    "human_reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'RECRUITER',
    "keycloak_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewer_decision" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "decision" "DecisionType" NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewer_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_email_key" ON "candidate"("email");

-- CreateIndex
CREATE INDEX "session_candidate_id_idx" ON "session"("candidate_id");

-- CreateIndex
CREATE INDEX "session_status_idx" ON "session"("status");

-- CreateIndex
CREATE INDEX "session_deadline_at_idx" ON "session"("deadline_at");

-- CreateIndex
CREATE INDEX "session_last_heartbeat_at_idx" ON "session"("last_heartbeat_at");

-- CreateIndex
CREATE UNIQUE INDEX "module_response_session_id_question_id_key" ON "module_response"("session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_clip_flag_id_key" ON "evidence_clip"("flag_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_session_id_key" ON "score"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_keycloak_user_id_key" ON "staff"("keycloak_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_decision_session_id_key" ON "reviewer_decision"("session_id");

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_role_template_id_fkey" FOREIGN KEY ("role_template_id") REFERENCES "role_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_response" ADD CONSTRAINT "module_response_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_response" ADD CONSTRAINT "module_response_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_flag" ADD CONSTRAINT "integrity_flag_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_clip" ADD CONSTRAINT "evidence_clip_flag_id_fkey" FOREIGN KEY ("flag_id") REFERENCES "integrity_flag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score" ADD CONSTRAINT "score_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_decision" ADD CONSTRAINT "reviewer_decision_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviewer_decision" ADD CONSTRAINT "reviewer_decision_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
