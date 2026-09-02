import assert from "node:assert";
import { SessionScoringService } from "./session-scoring.service";
import { NotFoundException } from "@nestjs/common";

async function runSessionScoringTests() {
  console.log("Running characterization tests for SessionScoringService...");

  let persistedScoreData: any = null;

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => {
        if (where.id === "sess-1") {
          return {
            id: "sess-1",
            moduleResponses: [
              {
                questionId: "q-mcq-1",
                responsePayload: { selectedOptionIndex: 1, selfConfidence: 100 },
              },
              {
                questionId: "q-sql-1",
                responsePayload: { executionResult: { status: "SUCCESS" }, selfConfidence: 0.9 },
              },
              {
                questionId: "q-code-1",
                responsePayload: { code: "function test() { return true; }" },
              },
            ],
            codingExecutions: [
              { questionId: "q-code-1", totalTests: 10, passedTests: 9 },
            ],
            sqlExecutions: [
              { questionId: "q-sql-1", status: "COMPLETED" },
            ],
            drive: {
              moduleConfig: {
                MCQ: { enabled: true, weight: 40 },
                SQL: { enabled: true, weight: 30 },
                CODING: { enabled: true, weight: 30 },
              },
              questions: [
                { questionId: "q-mcq-1", pointShare: 10 },
                { questionId: "q-sql-1", pointShare: 20 },
                { questionId: "q-code-1", pointShare: 30 },
              ],
            },
          };
        }
        if (where.id === "sess-empty") {
          return {
            id: "sess-empty",
            moduleResponses: [],
            codingExecutions: [],
            sqlExecutions: [],
            drive: { moduleConfig: {} },
          };
        }
        return null;
      },
    },
    question: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where.id.in || [];
        return ids.map((id) => {
          if (id === "q-mcq-1") {
            return { id, moduleType: "MCQ", content: { correctIndex: 1, options: ["A", "B", "C"] } };
          }
          if (id === "q-sql-1") {
            return { id, moduleType: "SQL", content: {} };
          }
          if (id === "q-code-1") {
            return { id, moduleType: "CODING", content: {} };
          }
          return { id, moduleType: "MCQ", content: {} };
        });
      },
    },
    score: {
      findUnique: async () => null,
      upsert: async ({ where, create, update }: any) => {
        persistedScoreData = { where, create, update };
        return create;
      },
    },
  };

  const mockSettingsService: any = {
    getScoringConfig: async () => ({ aiConfidenceThreshold: 0.8 }),
  };

  const service = new SessionScoringService(mockPrisma, mockSettingsService);

  // Test 1: Throw NotFoundException if session doesn't exist
  await assert.rejects(
    async () => {
      await service.computeSessionScores("invalid-id");
    },
    (err: any) => err instanceof NotFoundException,
    "Expected NotFoundException for non-existent session",
  );

  // Test 2: Compute session scores for sess-1
  const result = await service.computeSessionScores("sess-1");

  assert.ok(result, "Result should be defined");
  assert.strictEqual(result.gradingSource, "module_scoring");
  assert.strictEqual(result.moduleScores["MCQ"], 1.0, "MCQ module score should be 1.0");
  assert.strictEqual(result.moduleScores["SQL"], 1.0, "SQL module score should be 1.0");
  assert.strictEqual(result.moduleScores["CODING"], 0.9, "Coding module score should be 0.9 (9/10 tests)");

  // Weighted Core Score calculation: 1.0*40 + 1.0*30 + 0.9*30 = 40 + 30 + 27 = 97
  assert.strictEqual(result.coreScore, 97);
  assert.strictEqual(result.compositeScore, 97);

  // Say-Do Consistency Check
  assert.ok(typeof result.sayDoConsistencyScore === "number", "sayDoConsistencyScore should be a number");
  assert.ok(result.sayDoRationale.includes("candidate self-assessments"), "sayDoRationale should describe self-assessments");

  // AI Confidence Check: completion ratio (3/3 = 1.0)*0.7 + execution bonus 0.2 = 0.9
  assert.strictEqual(result.aiConfidence, 0.9);

  // Persistence Check
  assert.ok(persistedScoreData, "Score should have been persisted");
  assert.strictEqual(persistedScoreData.where.sessionId, "sess-1");
  assert.strictEqual(persistedScoreData.create.humanReviewed, true, "humanReviewed should be true since aiConfidence (0.9) >= threshold (0.8)");

  // Test 3: Compute scores for session with empty responses (verifying NO_DATA handling)
  const emptyResult = await service.computeSessionScores("sess-empty");
  assert.strictEqual(emptyResult.gradingSource, "no_data", "Grading source should be no_data for empty responses");
  assert.strictEqual(emptyResult.compositeScore, null, "Composite score should be null for empty responses");
  assert.strictEqual(emptyResult.aiConfidence, 0.0, "AI confidence should be 0.0 for empty responses");

  console.log("✅ All SessionScoringService characterization unit tests passed successfully!");
}

runSessionScoringTests().catch((err) => {
  console.error("❌ SessionScoringService unit tests failed:", err);
  process.exit(1);
});
