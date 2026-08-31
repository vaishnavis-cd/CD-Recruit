import appConfig from "./app.config";
import { configuration } from "./configuration";

async function runConfigTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Config Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, message: string) {
    testTotal++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ PASS: ${message}`);
      testPassed++;
    }
  }

  // Backup process.env
  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: app.config.ts validation of required variables
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] Testing app.config.ts required variables validation...");

    // 1.1 Missing DATABASE_URL -> must throw error
    delete process.env.DATABASE_URL;
    let threwMissingDb = false;
    try {
      (appConfig as any)();
    } catch (err: any) {
      if (err.message.includes("missing environment variable DATABASE_URL")) {
        threwMissingDb = true;
      }
    }
    assert(threwMissingDb, "Missing DATABASE_URL must fail validation");

    // Restore required env
    process.env.DATABASE_URL = "postgresql://cdrecruit:cdrecruit123@localhost:5434/cdrecruit";
    process.env.JWT_SECRET = "test-secret";
    process.env.MINIO_ENDPOINT = "localhost";
    process.env.MINIO_PORT = "9000";
    process.env.MINIO_ACCESS_KEY = "minioadmin";
    process.env.MINIO_SECRET_KEY = "minioadmin";
    process.env.MINIO_BUCKET_BIOMETRIC = "cd-recruit-biometric";

    // 1.2 Valid config -> must return typed object
    const validatedConfig = (appConfig as any)();
    assert(validatedConfig.databaseUrl === process.env.DATABASE_URL, "databaseUrl must match process.env");
    assert(validatedConfig.jwtSecret === "test-secret", "jwtSecret must match process.env");
    assert(validatedConfig.minio.endpoint === "localhost", "minio.endpoint must match process.env");

    // -------------------------------------------------------------------------
    // TEST 2: Security check: DATABASE_URL !== SANDBOX_DB_URL
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Testing security isolation between production and sandbox databases...");

    process.env.SANDBOX_DB_URL = process.env.DATABASE_URL; // Simulate security violation
    let threwSecurityError = false;
    try {
      (appConfig as any)();
    } catch (err: any) {
      if (err.message.includes("Security validation error")) {
        threwSecurityError = true;
      }
    }
    assert(threwSecurityError, "Identical DATABASE_URL and SANDBOX_DB_URL must fail security validation");

    // Reset sandbox DB URL to safe distinct URL
    process.env.SANDBOX_DB_URL = "postgresql://cdrecruit:cdrecruit123@localhost:5434/cdrecruit_sandbox";
    const safeConfig = (appConfig as any)();
    assert(safeConfig.sandboxDatabaseUrl !== safeConfig.databaseUrl, "sandboxDatabaseUrl must differ from databaseUrl");

    // -------------------------------------------------------------------------
    // TEST 3: configuration.ts defaults
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing configuration.ts fallback defaults...");

    const rootConfig = configuration();
    assert(rootConfig.port === 3001, "Default port must be 3001");
    assert(rootConfig.redisUrl === "redis://localhost:6379", "Default redisUrl must be redis://localhost:6379");
    assert(rootConfig.heartbeatStaleThresholdSeconds === 45, "Default heartbeat threshold must be 45s");
    assert(rootConfig.graceWindowSeconds === 300, "Default grace window must be 300s");
    assert(rootConfig.maxDisconnectCount === 3, "Default max disconnect count must be 3");

  } finally {
    process.env = originalEnv;
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runConfigTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
