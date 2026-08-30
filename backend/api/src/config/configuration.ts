/**
 * Typed configuration factory for @nestjs/config.
 *
 * Every environment variable the API needs is declared here exactly once.
 * All other modules read values through ConfigService<AppConfig, true> — never
 * through process.env directly.  If a required variable is missing the app
 * fails fast at startup with a clear message rather than at runtime.
 */
export const configuration = () => ({
  // ── Runtime ─────────────────────────────────────────────────────────────
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.API_PORT ?? "3001", 10),

  // ── Database ─────────────────────────────────────────────────────────────
  databaseUrl: process.env.DATABASE_URL ?? "",
  sandboxDatabaseUrl: process.env.SANDBOX_DB_URL ?? "",

  // ── Redis / BullMQ ───────────────────────────────────────────────────────
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",

  // ── Invite-token JWT ─────────────────────────────────────────────────────
  // Used for candidate-path tokens only.  Keycloak handles admin/staff JWTs.
  jwtSecret: process.env.JWT_SECRET ?? "",
  inviteTokenTtlHours: parseInt(process.env.INVITE_TOKEN_TTL_HOURS ?? "48", 10),

  // ── Heartbeat / session integrity ────────────────────────────────────────
  // See docs/DECISIONS.md Decision 7 before changing these defaults.
  heartbeatStaleThresholdSeconds: parseInt(
    process.env.HEARTBEAT_STALE_THRESHOLD_SECONDS ?? "45",
    10,
  ),
  graceWindowSeconds: parseInt(process.env.GRACE_WINDOW_SECONDS ?? "300", 10),
  maxDisconnectCount: parseInt(process.env.MAX_DISCONNECT_COUNT ?? "3", 10),

  // ── External services ────────────────────────────────────────────────────
  judge0ApiUrl: process.env.JUDGE0_API_URL ?? "",
  judge0ApiKey: process.env.JUDGE0_API_KEY ?? "",
  judge0CpuTimeLimit: parseFloat(process.env.JUDGE0_CPU_TIME_LIMIT ?? "5.0"),
  judge0WallTimeLimit: parseFloat(process.env.JUDGE0_WALL_TIME_LIMIT ?? "10.0"),
  judge0MaxRetryAttempts: parseInt(process.env.JUDGE0_MAX_RETRY_ATTEMPTS ?? "3", 10),
  judge0RetryBaseDelayMs: parseInt(process.env.JUDGE0_RETRY_BASE_DELAY_MS ?? "500", 10),

  // ── Circuit Breaker ───────────────────────────────────────────────────────
  circuitBreakerErrorThresholdPercent: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENT ?? "50", 10),
  circuitBreakerResetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS ?? "5000", 10),
  circuitBreakerVolumeThreshold: parseInt(process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD ?? "20", 10),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  cerebrasApiKey: process.env.CEREBRAS_API_KEY ?? "",

  // ── MinIO ─────────────────────────────────────────────────────────────────
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? "localhost",
    port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
    useSsl: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    bucketGeneral: process.env.MINIO_BUCKET_GENERAL ?? "cd-recruit-general",
    bucketBiometric:
      process.env.MINIO_BUCKET_BIOMETRIC ?? "cd-recruit-biometric",
  },

  // ── Security ─────────────────────────────────────────────────────────────
  evidenceClipUrlTtlSeconds: parseInt(
    process.env.EVIDENCE_CLIP_URL_TTL_SECONDS ?? "300",
    10,
  ),
});

/** Inferred type — use as the generic parameter for ConfigService. */
export type AppConfig = ReturnType<typeof configuration>;
