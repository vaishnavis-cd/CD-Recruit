-- Stage 1 Metrics hot filter indexes
CREATE INDEX IF NOT EXISTS idx_drive_status ON public.drive(status);
CREATE INDEX IF NOT EXISTS idx_session_status ON public.session(status);
CREATE INDEX IF NOT EXISTS idx_session_started_at ON public.session(started_at);
CREATE INDEX IF NOT EXISTS idx_session_submitted_at ON public.session(submitted_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_draft_status_expires ON platform.onboarding_draft(status, expires_at);
