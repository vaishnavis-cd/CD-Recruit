import { QuestionService } from "./question.service";
import { ModuleType, QuestionStatus } from "@cd-recruit/shared-types";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runQuestionTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Question Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const questionsDb: any[] = [];
  const driveQuestionsDb: any[] = [];
  const moduleResponsesDb: any[] = [];

  const mockPrisma: any = {
    question: {
      findMany: async ({ where, skip, take }: any = {}) => {
        let res = [...questionsDb];
        if (where?.status?.not) {
          res = res.filter((q) => q.status !== where.status.not);
        }
        if (where?.moduleType) {
          if (where.moduleType.in) {
            res = res.filter((q) => where.moduleType.in.includes(q.moduleType));
          } else if (where.moduleType === "NONE") {
            res = [];
          } else {
            res = res.filter((q) => q.moduleType === where.moduleType);
          }
        }
        if (where?.difficulty) {
          res = res.filter((q) => q.difficulty === where.difficulty);
        }
        return res.map((q) => ({
          ...q,
          _count: {
            driveQuestions: driveQuestionsDb.filter((dq) => dq.questionId === q.id).length,
            moduleResponses: moduleResponsesDb.filter((mr) => mr.questionId === q.id).length,
          },
        }));
      },
      count: async () => questionsDb.length,
      findUnique: async ({ where }: any) => questionsDb.find((q) => q.id === where.id) || null,
      create: async ({ data }: any) => {
        const item = {
          id: `q-${questionsDb.length + 1}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        questionsDb.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = questionsDb.find((q) => q.id === where.id);
        if (!item) throw new Error("Not found");
        if (data.version && typeof data.version === "object" && data.version.increment) {
          item.version = (item.version || 1) + 1;
          delete data.version;
        }
        Object.assign(item, data);
        return item;
      },
      updateMany: async () => ({ count: 0 }),
    },
    driveQuestion: {
      count: async ({ where }: any) => driveQuestionsDb.filter((dq) => dq.questionId === where.questionId).length,
      updateMany: async () => ({ count: 0 }),
    },
    moduleResponse: {
      findMany: async ({ where }: any) => moduleResponsesDb.filter((mr) => mr.questionId === where.questionId),
    },
    $queryRaw: async () => [],
  };

  const service = new QuestionService(mockPrisma);

  // ---------------------------------------------------------------------------
  // TEST 1: create() Content Schema Validation Across Module Types
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing create() schema validation for all module types...");

    // 1.1 MCQ Validation
    const validMcq = await service.create({
      moduleType: ModuleType.MCQ,
      content: { prompt: "Which data structure is LIFO?", options: ["Queue", "Stack"], correctIndex: 1 },
      role: "General",
    } as any);
    assert.strictEqual(validMcq.moduleType, ModuleType.MCQ);
    pass("Valid MCQ question created successfully");

    let threwInvalidMcq = false;
    try {
      await service.create({
        moduleType: ModuleType.MCQ,
        content: { prompt: "Broken MCQ", options: ["Single option"] },
      } as any);
    } catch (err: any) {
      if (err instanceof BadRequestException) threwInvalidMcq = true;
    }
    assert.strictEqual(threwInvalidMcq, true, "MCQ with <2 options must throw BadRequestException");
    pass("Invalid MCQ correctly rejected with BadRequestException");

    // 1.2 SQL Validation
    const validSql = await service.create({
      moduleType: ModuleType.SQL,
      content: { prompt: "Select all users", schema: "CREATE TABLE users...", seedData: "INSERT INTO users..." },
    } as any);
    assert.strictEqual(validSql.moduleType, ModuleType.SQL);
    pass("Valid SQL question created successfully");

    // 1.3 Coding Validation
    const validCoding = await service.create({
      moduleType: ModuleType.CODING,
      content: { prompt: "Implement twoSum", starterCode: "def twoSum(nums): pass" },
    } as any);
    assert.strictEqual(validCoding.moduleType, ModuleType.CODING);
    pass("Valid Coding question created successfully");

    // 1.4 AI Prompting Validation & Keyword Extraction
    const validAiPrompt = await service.create({
      moduleType: ModuleType.AI_PROMPTING,
      content: {
        prompt: "Write a prompt to design an asynchronous event-driven microservice architecture with Kafka message broker.",
        rubric: "Evaluate on event schema, dead letter queues, and consumer group design.",
      },
    } as any);
    assert.strictEqual(validAiPrompt.moduleType, ModuleType.AI_PROMPTING);
    assert(Array.isArray((validAiPrompt.content as any).extractedKeywords), "Keywords must be extracted");
    assert((validAiPrompt.content as any).extractedKeywords.length > 0, "Keywords list must not be empty");
    pass("AI Prompting question validates rubric and extracts keywords with RakeExtractor");

    // 1.5 Test Scenarios Validation
    const validScenario = await service.create({
      moduleType: ModuleType.TEST_SCENARIOS,
      content: {
        prompt: "How would you handle a memory leak in a production Node.js cluster?",
        expectedAnswer: "Capture heap snapshot, analyze object retention paths, restart worker gracefully.",
      },
    } as any);
    assert.strictEqual(validScenario.moduleType, ModuleType.TEST_SCENARIOS);
    pass("Valid Test Scenarios question validated and created");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: update() Version Forking vs In-Place Edits
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing update() immutable version-forking vs in-place mutations...");

    // 2.1 In-place edit when question has 0 active drive usages
    const q1 = questionsDb[0];
    const updatedInPlace = await service.update(q1.id, {
      content: { prompt: "Updated LIFO question", options: ["Queue", "Stack", "Heap"], correctIndex: 1 },
    } as any);
    assert.strictEqual(updatedInPlace.id, q1.id, "Question with 0 drive usage must update in-place");
    assert.strictEqual(updatedInPlace.version, 2, "In-place update must increment version");
    pass("Unlinked question updates in-place with incremented version");

    // 2.2 Version fork when question is used in an active Drive
    driveQuestionsDb.push({ driveId: "drive-1", questionId: q1.id });

    const versionFork = await service.update(q1.id, {
      content: { prompt: "Forked v3 LIFO question", options: ["Queue", "Stack", "Tree"], correctIndex: 1 },
    } as any);
    assert.notStrictEqual(versionFork.id, q1.id, "Drive-linked question update must fork new question ID");
    assert.strictEqual(versionFork.version, 3, "Forked question must increment version to 3");
    assert.strictEqual(versionFork.folderId, q1.id, "Forked question folderId must link to original question");
    assert.strictEqual(q1.status, QuestionStatus.ARCHIVED, "Previous version must be soft-archived");
    pass("Drive-linked question forks new immutable version and soft-archives parent");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: list() Faceted Querying & Department Module Constraints
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing list() filtering and department constraints...");

    // 3.1 PMO Department filter allows only MCQ & TEST_SCENARIOS
    const pmoList = await service.list({
      page: 1,
      pageSize: 10,
      department: "PMO",
    } as any);

    assert(pmoList.items.every((q) => q.moduleType === "MCQ" || q.moduleType === "TEST_SCENARIOS"));
    pass("PMO department query constrains results to MCQ and TEST_SCENARIOS only");

    // 3.2 List excludes ARCHIVED questions by default
    const allList = await service.list({ page: 1, pageSize: 20 } as any);
    assert(allList.items.every((q) => q.status !== QuestionStatus.ARCHIVED));
    pass("list() excludes ARCHIVED questions by default");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: getStats() and remove()
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing getStats() telemetry aggregation and soft remove()...");

    const targetQ = questionsDb.find((q) => q.moduleType === ModuleType.CODING);

    // Mock module response with score
    moduleResponsesDb.push({
      questionId: targetQ.id,
      session: {
        score: {
          moduleScores: { [ModuleType.CODING]: 0.85 },
        },
      },
    });

    const stats = await service.getStats(targetQ.id);
    assert.strictEqual(stats.avgScore, 0.85, "Average score must match responses");
    assert.strictEqual(stats.passRate, 100, "Pass rate must be 100% for 0.85 score");
    pass("getStats calculates average score and pass rate accurately");

    // Soft remove
    const removeRes = await service.remove(targetQ.id);
    assert.strictEqual(removeRes.status, QuestionStatus.ARCHIVED);
    assert.strictEqual(targetQ.status, QuestionStatus.ARCHIVED);
    pass("remove() soft-archives question");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runQuestionTests().catch((err) => {
  console.error("❌ Question tests failed:", err);
  process.exit(1);
});
