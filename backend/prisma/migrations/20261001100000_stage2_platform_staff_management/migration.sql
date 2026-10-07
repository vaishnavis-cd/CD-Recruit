-- Stage 2: Staff management schema extensions
ALTER TABLE platform.platform_staff
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Check constraint for status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_platform_staff_status'
  ) THEN
    ALTER TABLE platform.platform_staff
      ADD CONSTRAINT chk_platform_staff_status CHECK (status IN ('ACTIVE', 'INACTIVE'));
  END IF;
END $$;

-- Session reference_id column
ALTER TABLE public.session
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS session_reference_id_key ON public.session(reference_id);

