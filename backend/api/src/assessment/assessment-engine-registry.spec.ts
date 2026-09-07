import { AssessmentEngineRegistry } from "./assessment-engine-registry.service";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "./assessment-module-engine.interface";
import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import { NotFoundException } from "@nestjs/common";

async function runAssessmentEngineRegistryTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for AssessmentEngineRegistry");
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

  const registry = new AssessmentEngineRegistry();

  // Mock Engines
  const mockCodingEngine: AssessmentModuleEngine = {
    moduleType: ModuleType.CODING,
    validateSubmission: async (sub: any) => !!(sub && sub.code && sub.language),
    evaluateSubmission: async (sessionId, questionId, sub: any): Promise<ModuleEvaluationResult> => ({
      status: ExecutionStatus.COMPLETED,
      score: 1.0,
      scoreDetail: { passedTests: 5, totalTests: 5 },
      evaluatedAt: new Date(),
    }),
  };

  const mockSqlEngine: AssessmentModuleEngine = {
    moduleType: ModuleType.SQL,
    validateSubmission: async (sub: any) => !!(sub && sub.sql),
    evaluateSubmission: async (sessionId, questionId, sub: any): Promise<ModuleEvaluationResult> => ({
      status: ExecutionStatus.COMPLETED,
      score: 0.85,
      scoreDetail: { matched: true, executionTimeMs: 42 },
      evaluatedAt: new Date(),
    }),
  };

  const mockSimulationEngine: AssessmentModuleEngine = {
    moduleType: ModuleType.SIMULATION,
    validateSubmission: async () => true,
    evaluateSubmission: async (sessionId, questionId, sub: any): Promise<ModuleEvaluationResult> => ({
      status: ExecutionStatus.COMPLETED,
      score: 0.95,
      scoreDetail: { overallScore: 95 },
      evaluatedAt: new Date(),
    }),
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Engine Registration & Discovery
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing engine registration and lookup...");
    registry.registerEngine(mockCodingEngine);
    registry.registerEngine(mockSqlEngine);
    registry.registerEngine(mockSimulationEngine);

    assert(registry.hasEngine(ModuleType.CODING), "Registry must have CODING engine");
    assert(registry.hasEngine(ModuleType.SQL), "Registry must have SQL engine");
    assert(registry.hasEngine(ModuleType.SIMULATION), "Registry must have SIMULATION engine");
    assert(!registry.hasEngine(ModuleType.MCQ), "Registry must NOT have MCQ engine by default");

    assert(registry.getEngine(ModuleType.CODING) === mockCodingEngine, "getEngine(CODING) must return mockCodingEngine");
    assert(registry.getAllEngines().length === 3, "getAllEngines() must return all 3 registered engines");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Submission Validation Delegation
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing submission validation delegation...");
    const validCoding = await registry.validateSubmission(ModuleType.CODING, { code: "console.log(1)", language: "typescript" });
    assert(validCoding === true, "Valid coding submission must pass validation");

    const invalidCoding = await registry.validateSubmission(ModuleType.CODING, { code: "" });
    assert(invalidCoding === false, "Invalid coding submission must fail validation");

    const unhandledValidation = await registry.validateSubmission(ModuleType.MCQ, { selectedOption: "A" });
    assert(unhandledValidation === false, "Validation for unregistered module type must return false");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Evaluation Delegation & Duration Tracking
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing evaluation delegation and duration tracking...");
    const result = await registry.evaluateSubmission(
      ModuleType.SQL,
      "sess-123",
      "q-sql-1",
      { sql: "SELECT * FROM users;" },
    );

    assert(result.status === ExecutionStatus.COMPLETED, "Evaluation status must match engine output");
    assert(result.score === 0.85, "Evaluation score must match engine output");
    assert(typeof result.durationMs === "number" && result.durationMs >= 0, "Evaluation durationMs must be recorded");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Unregistered Module Error Handling
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing error handling for unregistered module evaluation...");
    let threwNotFound = false;
    try {
      await registry.evaluateSubmission(
        ModuleType.MCQ,
        "sess-123",
        "q-mcq-1",
        { option: 1 },
      );
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        threwNotFound = true;
      }
    }
    assert(threwNotFound, "evaluateSubmission for unregistered module type must throw NotFoundException");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Engine Unregistration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing engine unregistration...");
    const unregistered = registry.unregisterEngine(ModuleType.SQL);
    assert(unregistered === true, "Unregistering SQL engine must return true");
    assert(!registry.hasEngine(ModuleType.SQL), "SQL engine must no longer be present in registry");
    assert(registry.getAllEngines().length === 2, "Remaining engines count must be 2");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runAssessmentEngineRegistryTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
