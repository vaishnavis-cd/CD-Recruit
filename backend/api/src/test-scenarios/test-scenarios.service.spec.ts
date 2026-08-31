import { TestScenariosService } from "./test-scenarios.service";
import { TestScenarioScoringService } from "./test-scenario-scoring.service";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";
import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import assert from "node:assert";

async function runTestScenariosSubsystemTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Test Scenarios Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const moduleResponsesDb: any[] = [];
  const sessionsDb: any[] = [{ id: "sess-ts-1" }];
  const questionsDb: any[] = [
    {
      id: "q-ts-1",
      moduleType: ModuleType.TEST_SCENARIOS,
      content: {
        prompt: "A critical payment webhook fails intermittently in production. Explain how you reproduce, fix, and verify this issue.",
        expectedAnswer: "Reproduce by inspecting logs and replaying webhook payload with idempotency key, identify race condition, apply fix, and run integration tests.",
      },
    },
  ];

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => sessionsDb.find((s) => s.id === where.id) || null,
    },
    invite: {
      findFirst: async () => null,
    },
    question: {
      findUnique: async ({ where }: any) => questionsDb.find((q) => q.id === where.id) || null,
      create: async ({ data }: any) => {
        const item = { ...data };
        questionsDb.push(item);
        return item;
      },
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
    },
  };

  const mockAiEvaluation: any = {
    evaluateTestScenarioResponse: async (_prompt: string, _expected: string, candidate: string) => {
      if (candidate.includes("reproduce") && candidate.includes("fix")) {
        return {
          score: 90,
          reasoning: "Candidate covered root-cause reproduction, fix implementation, and regression verification.",
          feedback: "Strong structured answer.",
          providerUsed: "GEMINI_2_FLASH",
        };
      }
      return {
        score: 40,
        reasoning: "Candidate only provided high-level overview without concrete testing steps.",
        feedback: "Include specific reproduction and regression test procedures.",
        providerUsed: "GEMINI_2_FLASH",
      };
    },
    evaluateTestScenarioConcepts: async (_prompt: string, expectedConcepts: string[], candidate: string) => {
      const matches = expectedConcepts.map((concept) => ({
        concept,
        matched: candidate.toLowerCase().includes(concept.toLowerCase().slice(0, 5)),
        reasoning: "Matched based on technical keyword occurrence.",
      }));
      const score = Math.round((matches.filter((m) => m.matched).length / expectedConcepts.length) * 100);
      return {
        score,
        conceptMatches: matches,
        providerUsed: "GEMINI_2_FLASH",
      };
    },
  };

  const engineRegistry = new AssessmentEngineRegistry();
  const service = new TestScenariosService(mockPrisma, mockAiEvaluation, engineRegistry);
  const scoringService = new TestScenarioScoringService(mockAiEvaluation);

  // ---------------------------------------------------------------------------
  // TEST 1: AssessmentModuleEngine Dynamic Registration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing dynamic engine registration with AssessmentEngineRegistry...");

    assert.strictEqual(service.moduleType, ModuleType.TEST_SCENARIOS);
    service.onModuleInit();

    const registered = engineRegistry.getEngine(ModuleType.TEST_SCENARIOS);
    assert.strictEqual(registered, service, "TestScenariosService must be registered in AssessmentEngineRegistry");
    pass("TestScenariosService dynamically registers under AssessmentEngineRegistry on onModuleInit");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Candidate Test Scenario Submission & Grading
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing candidate answer submission and AI evaluation...");

    const submitRes = await service.submit({
      sessionId: "sess-ts-1",
      questionId: "q-ts-1",
      answer: "First I will reproduce the webhook failure in a staging environment by replaying payload headers, then implement a mutex lock to fix the race condition, and finally run regression tests.",
      timeSpentSeconds: 120,
    });

    assert.strictEqual(submitRes.success, true);
    assert.ok(submitRes.responseId);
    assert.strictEqual(submitRes.evaluation.overallScore, 90);
    assert.strictEqual(submitRes.evaluation.providerUsed, "GEMINI_2_FLASH");

    const savedResp = moduleResponsesDb.find((m) => m.sessionId === "sess-ts-1" && m.questionId === "q-ts-1");
    assert.strictEqual(savedResp?.isDraft, false);
    assert.strictEqual(savedResp?.responsePayload?.moduleType, "TEST_SCENARIOS");
    pass("submit() evaluates candidate answer using structured LLM and saves ModuleResponse");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Multi-Concept Rubric Evaluation (TestScenarioScoringService)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing TestScenarioScoringService multi-concept rubric evaluation...");

    const scoringRes = await scoringService.scoreTestScenarioResponse(
      "Explain how you debug intermittent webhook failures.",
      ["reproduce failure", "fix race condition", "regression test"],
      "I reproduce the failure using logs and run regression tests after deploying the fix.",
    );

    assert.ok(scoringRes.score !== null);
    assert(scoringRes.totalConcepts === 3);
    assert(scoringRes.matchedCount >= 2);
    assert.strictEqual(scoringRes.providerUsed, "GEMINI_2_FLASH");
    pass("scoreTestScenarioResponse evaluates expected rubric concepts and returns itemized matches");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: AssessmentModuleEngine Contract Validation
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing AssessmentModuleEngine validateSubmission & evaluateSubmission...");

    // 4.1 Validate submission
    const isValid = await service.validateSubmission({ answer: "My plan..." });
    assert.strictEqual(isValid, true);
    const isInvalid = await service.validateSubmission({});
    assert.strictEqual(isInvalid, false);
    pass("validateSubmission validates presence of answer payload");

    // 4.2 Evaluate submission
    const evalRes = await service.evaluateSubmission("sess-ts-1", "q-ts-1", {
      answer: "I will reproduce the failure, apply the fix, and run integration tests.",
    });

    assert.strictEqual(evalRes.status, ExecutionStatus.COMPLETED);
    assert.strictEqual(evalRes.score, 0.9);
    assert.ok(evalRes.scoreDetail);
    pass("evaluateSubmission returns normalized score (0.9) and evaluation detail");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runTestScenariosSubsystemTests().catch((err) => {
  console.error("❌ Test Scenarios subsystem tests failed:", err);
  process.exit(1);
});
