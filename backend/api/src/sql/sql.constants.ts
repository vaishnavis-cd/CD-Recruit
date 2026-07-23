export const SQL_DEFAULTS = {
  STATEMENT_TIMEOUT_MS: 5000,
  LOCK_TIMEOUT_MS: 2000,
  IDLE_IN_TRANSACTION_TIMEOUT_MS: 5000,
  WORK_MEM: "16MB",

  // Connection pool limits for sandbox execution
  POOL_MAX_CONNECTIONS: 20,
  POOL_CONNECTION_TIMEOUT_MS: 3000,
  POOL_IDLE_TIMEOUT_MS: 10000,

  // Orphan schema TTL (10 minutes)
  ORPHAN_SCHEMA_MAX_AGE_MINUTES: 10,
};

export const SQL_VALIDATION_PATTERNS = {
  ALLOWED_START: /^\s*(SELECT|WITH)\b/i,
  FORBIDDEN_KEYWORDS:
    /\b(DROP|TRUNCATE|ALTER|GRANT|REVOKE|CREATE\s+ROLE|CREATE\s+USER|COPY|pg_sleep|pg_terminate_backend|pg_read_file|dblink|lo_import|lo_export)\b/i,
  MULTI_STATEMENT: /;.*\S/,
};
