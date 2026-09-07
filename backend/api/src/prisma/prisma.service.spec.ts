import { PrismaService } from "./prisma.service";

async function runPrismaTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Prisma Subsystem");
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

  const mockConfig: any = {
    get: (key: string) => (key === "databaseUrl" ? "postgresql://user:pass@localhost:5432/test" : null),
  };

  // ---------------------------------------------------------------------------
  // TEST 1: PrismaService connect retry success
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing PrismaService connection retry success on transient error...");

    const service = new PrismaService(mockConfig);
    let attempts = 0;

    // Mock $connect to fail on first attempt, then succeed
    (service as any).$connect = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("Temporary socket error");
      }
    };

    await service.connectWithRetry(3, 10);
    assert(attempts === 2, "Should have retried and connected on attempt 2");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: PrismaService production fail-fast on retry exhaustion
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing production fail-fast on exhausted retries...");

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const service = new PrismaService(mockConfig);
      (service as any).$connect = async () => {
        throw new Error("FATAL: Database down");
      };

      let threwFatalError = false;
      try {
        await service.connectWithRetry(2, 5);
      } catch (err: any) {
        if (err.message.includes("Fatal: Prisma could not connect")) {
          threwFatalError = true;
        }
      }
      assert(threwFatalError, "Should throw fatal error in production when retries are exhausted");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runPrismaTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
