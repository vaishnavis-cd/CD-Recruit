import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { CompetencyEngine } from "./competency-engine";
import { SandboxOrchestratorService } from "./sandbox/sandbox-orchestrator.service";
import { SimulationTelemetryService } from "./simulation-telemetry.service";
import { ContextSimulationEvaluatorService } from "./context-simulation-evaluator.service";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";
import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import assert from "node:assert";

async function runSimulationSubsystemTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Simulation Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const moduleResponsesDb: any[] = [];
  const eventLogsDb: any[] = [];
  const snapshotsDb: Record<string, any> = {};

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        roleTemplateId: "rt-1",
        roleTemplate: { roleName: "Software Engineer", durationMinutes: 60 },
        candidate: { name: "Test Candidate", email: "candidate@test.com" },
        simulationSnapshot: snapshotsDb[where.id] || null,
        drive: { questions: [] },
      }),
      update: async ({ where, data }: any) => {
        if (data.simulationSnapshot) {
          snapshotsDb[where.id] = { ...(snapshotsDb[where.id] || {}), ...data.simulationSnapshot };
        }
        return { id: where.id, simulationSnapshot: snapshotsDb[where.id] };
      },
    },
    question: {
      findFirst: async () => ({
        id: "qa-bug-login-validation",
        title: "QA Bug Report",
        moduleType: "SIMULATION",
        content: {
          id: "qa-bug-login-validation",
          title: "QA Bug Report",
        },
      }),
    },
    moduleResponse: {
      upsert: async ({ where, create, update }: any) => {
        let item = moduleResponsesDb.find(
          (m) => m.sessionId === where.sessionId_questionId?.sessionId && m.questionId === where.sessionId_questionId?.questionId,
        );
        if (item) {
          Object.assign(item, update);
        } else {
          item = { id: `mr-${moduleResponsesDb.length + 1}`, ...create };
          moduleResponsesDb.push(item);
        }
        return item;
      },
      findUnique: async ({ where }: any) => {
        return (
          moduleResponsesDb.find(
            (m) => m.sessionId === where.sessionId_questionId?.sessionId && m.questionId === where.sessionId_questionId?.questionId,
          ) || null
        );
      },
    },
    sessionLog: {
      create: async ({ data }: any) => {
        eventLogsDb.push(data);
        return { id: `log-${eventLogsDb.length}`, ...data };
      },
    },
    score: {
      upsert: async () => ({}),
    },
  };

  const mockAiEval: any = {
    evaluateSimulationResponse: async () => ({
      score: 85,
      reasoning: "Comprehensive diagnosis and clear ETA communication.",
    }),
  };

  const mockConfig: any = {
    get: () => "node:18-alpine",
  };

  const sessionLogService = new SessionLogService(mockPrisma);
  const competencyEngine = new CompetencyEngine();
  const sandboxOrchestrator: any = {
    executeCommand: async (_sessionId: string, _cmd: string) => ({
      stdout: "2 passing (15ms)",
      stderr: "",
      exitCode: 0,
      durationMs: 15,
    }),
  };
  const telemetryService = new SimulationTelemetryService();
  const evaluatorService = new ContextSimulationEvaluatorService(mockAiEval);
  const engineRegistry = new AssessmentEngineRegistry();

  const service = new SimulationService(
    mockPrisma,
    sessionLogService,
    null as any, // eventGenerationService
    competencyEngine,
    sandboxOrchestrator,
    telemetryService,
    evaluatorService,
    null as any, // minioService
    engineRegistry,
  );

  // ---------------------------------------------------------------------------
  // TEST 1: AssessmentModuleEngine Registration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing dynamic engine registration with AssessmentEngineRegistry...");

    assert.strictEqual(service.moduleType, ModuleType.SIMULATION);
    service.onModuleInit();

    const registered = engineRegistry.getEngine(ModuleType.SIMULATION);
    assert.strictEqual(registered, service, "SimulationService must be registered in AssessmentEngineRegistry");
    pass("SimulationService dynamically registers under AssessmentEngineRegistry on onModuleInit");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Scenario Configuration & Sanitization
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing scenario configuration sanitization (stripping hidden tests)...");

    const sanitized = await service.getSanitizedScenarioConfig("sess-sim-1");
    assert.ok(sanitized.id, "Scenario ID must be present");
    assert.ok(sanitized.title, "Scenario title must be present");
    assert.ok(sanitized.starterCode, "Starter code must be present");
    assert.ok(Array.isArray(sanitized.testCases), "Test cases array must exist");
    assert(sanitized.testCases.every((tc: any) => tc.isHidden === undefined || tc.isHidden === false));
    pass("getSanitizedScenarioConfig returns workspace assets without hidden test cases");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Two-Phase SAY Ingestion (Initial Plan & Manager Email Reply)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing Two-Phase SAY state persistence and inbox management...");

    const sessId = "sess-sim-1";

    // 3.1 Initial SAY
    const sayRes = await service.saveInitialSay(
      sessId,
      "I will inspect the username validation regex and update boundary checks to allow valid alphanumeric characters.",
    );
    assert.strictEqual(sayRes.ok, true);
    pass("saveInitialSay captures candidate diagnosis and logs telemetry");

    // 3.2 Inbox & Email SAY
    const inbox = await service.getInbox(sessId);
    assert(Array.isArray(inbox), "Inbox should be an array");

    const emailRes = await service.saveEmailReply(
      sessId,
      101,
      "Hi Manager, I identified the bug in validateUsername regex. ETA for fix and tests is 20 minutes with zero downtime.",
    );
    assert.strictEqual(emailRes.ok, true);

    const updatedInbox = await service.getInbox(sessId);
    assert.strictEqual(updatedInbox[0]?.replyText?.includes("ETA for fix"), true);
    pass("saveEmailReply records candidate stakeholder communication in inbox");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Sandboxed Code Execution & Terminal Command Handling
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing sandboxed in-process code execution & terminal simulation...");

    const sessId = "sess-sim-1";

    // 4.1 In-Process JS Code Execution
    const codeResult = await service.runSimulationCode(sessId, {
      code: `function validateUsername(username) { return /^[a-zA-Z0-9_]{3,20}$/.test(username); }`,
      language: "javascript",
      testCases: [
        { input: '"valid_user1"', expectedOutput: "true", label: "Valid username" },
        { input: '"a"', expectedOutput: "false", label: "Too short" },
      ],
    });

    assert(Array.isArray(codeResult), "codeResult should be an array of test case outcomes");
    assert.strictEqual(codeResult.length, 2);
    assert.strictEqual(codeResult[0].passed, true);
    assert.strictEqual(codeResult[1].passed, true);
    pass("runSimulationCode executes JavaScript in sandboxed VM and passes test cases");

    // 4.2 Terminal Command Execution
    const termResult = await service.executeTerminalCommand(sessId, "npm test");
    assert.ok(termResult, "Terminal result should be returned");
    pass("executeTerminalCommand executes simulated terminal tools");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Holistic Composite Evaluation & Radar Breakdown
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing full composite Say-Do evaluation & radar metrics...");

    const sessId = "sess-sim-1";
    const evalResult = await service.submitSimulation(sessId, {
      testResults: { isCorrect: true, passedTests: 3, totalTests: 3 },
    });

    assert.ok(evalResult.overallScore >= 50, "Overall score should be >= 50");
    assert.ok(evalResult.competencyBreakdown.problemSolving >= 50);
    assert.ok(evalResult.competencyBreakdown.communication >= 50);
    assert.ok(evalResult.competencyBreakdown.technicalExecution >= 50);
    assert.ok(["Recommended", "Needs Further Evaluation"].includes(evalResult.recommendation));
    pass("submitSimulation generates composite Say-Do evaluation and 5-dimensional competency radar");
  }

  // ---------------------------------------------------------------------------
  // TEST 6: AssessmentModuleEngine Contract Validation
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 6] Testing AssessmentModuleEngine validateSubmission & evaluateSubmission...");

    // Validate submission
    const isValid = await service.validateSubmission({ code: "console.log(1)", initialSayText: "Plan" });
    assert.strictEqual(isValid, true);
    const isInvalid = await service.validateSubmission({});
    assert.strictEqual(isInvalid, false);
    pass("validateSubmission adheres to AssessmentModuleEngine contract");

    // Evaluate submission
    const engineResult = await service.evaluateSubmission("sess-sim-1", "qa-bug-login-validation", {
      code: "function validateUsername() { return true; }",
      testResults: { isCorrect: true, passedTests: 3, totalTests: 3 },
    });

    assert.strictEqual(engineResult.status, ExecutionStatus.COMPLETED);
    assert(engineResult.score >= 0.5 && engineResult.score <= 1.0, "Normalized score should be between 0.5 and 1.0");
    assert.ok(engineResult.scoreDetail, "scoreDetail should contain FullSimulationEvaluationResult");
    pass("evaluateSubmission returns normalized score and FullSimulationEvaluationResult detail");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runSimulationSubsystemTests().catch((err) => {
  console.error("❌ Simulation subsystem tests failed:", err);
  process.exit(1);
});
