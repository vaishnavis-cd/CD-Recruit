-- ───────────────────────────────────────────────────────────────────────────
-- CD-Recruit — SQL Sandbox Database Bootstrap Script
-- Run once as superuser against the sandbox PostgreSQL instance (sandbox_db).
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Restricted execution role (candidate query runner)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sql_sandbox_runner') THEN
    CREATE ROLE sql_sandbox_runner LOGIN PASSWORD 'runner_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
      CONNECTION LIMIT 20;
  END IF;
END $$;

-- 2. Schema admin role (creates/drops temporary sandbox schemas)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sql_sandbox_admin') THEN
    CREATE ROLE sql_sandbox_admin LOGIN PASSWORD 'admin_password'
      NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION
      CONNECTION LIMIT 10;
  END IF;
END $$;

-- 3. Lock down runner role from default public permissions
REVOKE ALL ON SCHEMA public FROM sql_sandbox_runner;

-- 4. Grant runner role to admin role so admin can switch to it during execution
GRANT sql_sandbox_runner TO sql_sandbox_admin;

