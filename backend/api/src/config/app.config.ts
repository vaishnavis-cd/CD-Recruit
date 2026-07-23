import { registerAs } from "@nestjs/config";

export default registerAs("app", () => {
  const requiredEnv = [
    "DATABASE_URL",
    "SANDBOX_DB_URL",
    "JWT_SECRET",
    "MINIO_ENDPOINT",
    "MINIO_PORT",
    "MINIO_ACCESS_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_BUCKET_BIOMETRIC",
  ];

  const sandboxDbUrl = process.env.SANDBOX_DB_URL || "postgresql://cdrecruit:cdrecruit123@localhost:5433/cdrecruit_sandbox";

  for (const envVar of requiredEnv) {
    if (envVar === "SANDBOX_DB_URL") continue;
    if (!process.env[envVar]) {
      throw new Error(
        `Config validation error: missing environment variable ${envVar}`,
      );
    }
  }

  if (sandboxDbUrl === process.env.DATABASE_URL) {
    throw new Error(
      "Security validation error: SANDBOX_DB_URL must not equal DATABASE_URL. SQL sandbox queries cannot execute against production database.",
    );
  }

  return {
    port: parseInt(process.env.API_PORT || "3001", 10),
    databaseUrl: process.env.DATABASE_URL,
    sandboxDatabaseUrl: sandboxDbUrl,
    jwtSecret: process.env.JWT_SECRET,
    minio: {
      endpoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT || "9000", 10),
      useSsl: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
      bucketBiometric:
        process.env.MINIO_BUCKET_BIOMETRIC || "cd-recruit-biometric",
      bucketGeneral: process.env.MINIO_BUCKET_GENERAL || "cd-recruit-general",
      evidenceUrlTtl: parseInt(
        process.env.EVIDENCE_CLIP_URL_TTL_SECONDS || "300",
        10,
      ),
    },
    env: process.env.NODE_ENV || "development",
  };
});
