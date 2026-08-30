-- CreateIndex
CREATE INDEX IF NOT EXISTS "coding_execution_session_id_idx" ON "coding_execution"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coding_execution_status_idx" ON "coding_execution"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coding_execution_created_at_idx" ON "coding_execution"("created_at");
