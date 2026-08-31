import { HealthController } from "./health.controller";

async function runHealthTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Health Subsystem");
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

  // ---------------------------------------------------------------------------
  // TEST 1: Healthy Database & Storage Probe (HTTP 200 OK)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing healthy probe response...");
    const mockPrisma: any = {
      $queryRaw: async () => [{ 1: 1 }],
    };

    const mockStorage: any = {
      checkHealth: async () => true,
    };

    const controller = new HealthController(mockPrisma, mockStorage);

    let capturedStatusCode = 0;
    const mockRes: any = {
      status: (code: number) => {
        capturedStatusCode = code;
        return mockRes;
      },
    };

    const result = await controller.check(mockRes);

    assert(capturedStatusCode === 200, "Healthy status code must be 200");
    assert(result.status === "ok", "Response status must be 'ok'");
    assert(result.database === "connected", "Database must be reported as connected");
    assert(typeof result.timestamp === "string", "Timestamp must be ISO string");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Degraded Database Probe (HTTP 503 SERVICE_UNAVAILABLE)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing degraded database probe response...");
    const mockPrismaError: any = {
      $queryRaw: async () => {
        throw new Error("Connection refused to PostgreSQL");
      },
    };

    const mockStorage: any = {
      checkHealth: async () => true,
    };

    const controller = new HealthController(mockPrismaError, mockStorage);

    let capturedStatusCode = 0;
    const mockRes: any = {
      status: (code: number) => {
        capturedStatusCode = code;
        return mockRes;
      },
    };

    const result = await controller.check(mockRes);

    assert(capturedStatusCode === 503, "Degraded probe must return status code 503");
    assert(result.status === "error", "Response status must be 'error'");
    assert(result.database === "disconnected", "Database must be reported as disconnected");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runHealthTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
