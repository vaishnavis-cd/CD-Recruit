import { McqService } from "./mcq.service";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";
import { ModuleType, ExecutionStatus, SessionStatus } from "@cd-recruit/shared-types";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runMcqTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for MCQ Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const responsesDb = new Map<string, any>();
  const sessionsDb = new Map<string, any>();
  const questionsDb = new Map<string, any>();

  sessionsDb.set("sess-active", { id: "sess-active", status: "IN_PROGRESS" });
  sessionsDb.set("sess-closed", { id: "sess-closed", status: SessionStatus.CLOSED });
  sessionsDb.set("sess-autosub", { id: "sess-autosub", status: SessionStatus.AUTO_SUBMITTED });

  questionsDb.set("q-mcq-1", {
    id: "q-mcq-1",
    moduleType: "MCQ",
    content: {
      prompt: "What is the time complexity of array index lookup?",
      options: ["O(1)", "O(n)", "O(log n)"],
      correctAnswer: "O(1)",
    },
  });

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => sessionsDb.get(where.id) || null,
      upsert: async ({ where, create }: any) => {
        const item = { id: where.id, ...create };
        sessionsDb.set(where.id, item);
        return item;
      },
    },
    invite: {
      findFirst: async () => null,
    },
    question: {
      findUnique: async ({ where }: any) => questionsDb.get(where.id) || null,
      create: async ({ data }: any) => {
        questionsDb.set(data.id, data);
        return data;
      },
    },
    moduleResponse: {
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.sessionId_questionId.sessionId}_${where.sessionId_questionId.questionId}`;
        const item = { ...create, ...update, id: `resp-${responsesDb.size + 1}` };
        responsesDb.set(key, item);
        return item;
      },
    },
    roleTemplate: {
      findFirst: async () => ({ id: "role-1" }),
      create: async () => ({ id: "role-1" }),
    },
    candidate: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: "c-1", ...data }),
    },
  };

  const registry = new AssessmentEngineRegistry();
  const mcqService = new McqService(mockPrisma, registry);
  mcqService.onModuleInit();

  // ---------------------------------------------------------------------------
  // TEST 1: AssessmentEngineRegistry Registration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing AssessmentEngineRegistry registration...");
    assert.strictEqual(registry.hasEngine(ModuleType.MCQ), true, "MCQ engine must be registered in registry");
    assert.strictEqual(registry.getEngine(ModuleType.MCQ), mcqService, "Engine reference must match McqService");
    pass("McqService registers with AssessmentEngineRegistry on onModuleInit");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: submit() and draft() Response Persistence
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing submit and draft response persistence...");

    // 2.1 Draft save
    const draftRes = await mcqService.draft({
      sessionId: "sess-active",
      questionId: "q-mcq-1",
      selectedOptions: ["O(n)"],
      timeSpentSeconds: 12,
    });
    assert.strictEqual(draftRes.success, true);
    const draftStored = responsesDb.get("sess-active_q-mcq-1");
    assert.strictEqual(draftStored.isDraft, true, "Draft must be flagged isDraft: true");
    assert.deepStrictEqual(draftStored.responsePayload.selectedOptions, ["O(n)"]);
    pass("draft() saves interim response with isDraft: true");

    // 2.2 Final submit
    const submitRes = await mcqService.submit({
      sessionId: "sess-active",
      questionId: "q-mcq-1",
      selectedOptions: ["O(1)"],
      timeSpentSeconds: 25,
    });
    assert.strictEqual(submitRes.success, true);
    const submitStored = responsesDb.get("sess-active_q-mcq-1");
    assert.strictEqual(submitStored.isDraft, false, "Submit must be flagged isDraft: false");
    assert.deepStrictEqual(submitStored.responsePayload.selectedOptions, ["O(1)"]);
    pass("submit() saves final response with isDraft: false");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Session Immutability & Production Hygiene
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing session immutability on closed sessions...");

    // 3.1 Closed session
    let threwClosed = false;
    try {
      await mcqService.submit({
        sessionId: "sess-closed",
        questionId: "q-mcq-1",
        selectedOptions: ["O(1)"],
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes("CLOSED")) {
        threwClosed = true;
      }
    }
    assert.strictEqual(threwClosed, true, "Closed session must reject updates with BadRequestException");
    pass("submit() rejects updates on CLOSED sessions");

    // 3.2 Unknown session UUID in production
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_SYNTHETIC_SESSIONS;

    let threwNotFound = false;
    try {
      await mcqService.submit({
        sessionId: "00000000-0000-0000-0000-000000000099",
        questionId: "q-mcq-1",
        selectedOptions: ["O(1)"],
      });
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        threwNotFound = true;
      }
    } finally {
      process.env.NODE_ENV = origEnv;
    }
    assert.strictEqual(threwNotFound, true, "Unknown session in production must throw NotFoundException");
    pass("Production hygiene blocks rogue synthetic records for invalid session UUIDs");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: AssessmentModuleEngine Validation & Evaluation
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing validateSubmission and evaluateSubmission grading...");

    // 4.1 Validation
    assert.strictEqual(await mcqService.validateSubmission({ selectedOptions: ["A"] }), true);
    assert.strictEqual(await mcqService.validateSubmission({ selectedOption: "A" }), true);
    assert.strictEqual(await mcqService.validateSubmission({ answer: "A" }), true);
    assert.strictEqual(await mcqService.validateSubmission(null), false);
    assert.strictEqual(await mcqService.validateSubmission({}), false);
    pass("validateSubmission validates payload formats correctly");

    // 4.2 Evaluation - Correct Answer
    const evalCorrect = await registry.evaluateSubmission(
      ModuleType.MCQ,
      "sess-active",
      "q-mcq-1",
      { selectedOptions: ["O(1)"] },
    );
    assert.strictEqual(evalCorrect.status, ExecutionStatus.COMPLETED);
    assert.strictEqual(evalCorrect.score, 1.0, "Correct option must score 1.0");
    pass("evaluateSubmission assigns score 1.0 on matching correctAnswer");

    // 4.3 Evaluation - Incorrect Answer
    const evalIncorrect = await registry.evaluateSubmission(
      ModuleType.MCQ,
      "sess-active",
      "q-mcq-1",
      { selectedOptions: ["O(n)"] },
    );
    assert.strictEqual(evalIncorrect.status, ExecutionStatus.COMPLETED);
    assert.strictEqual(evalIncorrect.score, 0.0, "Incorrect option must score 0.0");
    pass("evaluateSubmission assigns score 0.0 on mismatching answer");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runMcqTests().catch((err) => {
  console.error("❌ MCQ tests failed:", err);
  process.exit(1);
});
