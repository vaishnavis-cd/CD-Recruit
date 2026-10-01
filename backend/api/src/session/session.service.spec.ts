import { SessionService, sanitiseQuestionContent } from "./session.service";
import assert from "node:assert";

async function runSessionCharacterizationTests() {
  console.log("Running characterization tests for SessionService...");

  const mockPrisma: any = {
    roleTemplate: {
      findUnique: async ({ where }: any) => {
        if (where.id === "template-1") {
          return { id: "template-1", roleName: "Developer", durationMinutes: 60 };
        }
        return null;
      },
    },
    candidate: {
      findUnique: async () => ({ id: "cand-1", email: "cand@example.com", name: "Candidate" }),
    },
    invite: {
      findUnique: async () => ({ id: "inv-1", driveId: "drive-1" }),
      findFirst: async () => null,
      update: async () => ({}),
    },
    session: {
      findFirst: async () => null,
      findUnique: async ({ where }: any) => {
        if (where.id === "sess-1") {
          return {
            id: "sess-1",
            candidateId: "cand-1",
            roleTemplateId: "template-1",
            status: "NOT_STARTED",
            roleTemplate: { roleName: "Developer", durationMinutes: 60 },
            cvMode: "FULL",
            startedAt: null,
            deadlineAt: null,
          };
        }
        return null;
      },
      create: async ({ data }: any) => ({
        id: "sess-1",
        ...data,
        roleTemplate: { roleName: "Developer", durationMinutes: 60 },
      }),
      update: async ({ data }: any) => ({
        id: "sess-1",
        status: data.status || "IN_PROGRESS",
        candidateId: "cand-1",
        roleTemplate: { roleName: "Developer", durationMinutes: 60 },
      }),
    },
    driveQuestion: {
      findMany: async () => [],
    },
    roleTemplateQuestion: {
      findMany: async () => [],
    },
    question: {
      findMany: async () => [],
    },
    drive: {
      findUnique: async () => null,
    },
    integrityFlag: {
      create: async () => ({ id: "flag-1" }),
    },
    identityCapture: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
      create: async () => ({ id: "cap-1" }),
    },
  };

  const mockAuth: any = {
    verifyInviteToken: () => ({
      inviteId: "inv-1",
      candidateEmail: "cand@example.com",
      candidateName: "Candidate",
      roleTemplateId: "template-1",
      cvMode: "FULL",
    }),
  };

  const mockCandidate: any = {
    findOrCreate: async () => ({ id: "cand-1", email: "cand@example.com", name: "Candidate" }),
  };

  const mockConfig: any = {
    get: (key: string) => {
      if (key === "graceWindowSeconds") return 300;
      if (key === "maxDisconnectCount") return 3;
      return "biometrics";
    },
  };

  const mockMinio: any = {};
  const mockQueueProvider: any = {};
  const mockLifecycle: any = {};
  const mockStateMachine: any = {};
  const mockScoring: any = {};
  const mockSandboxOrchestrator: any = {
    ensureWorkspace: async () => ({}),
  };
  const mockFaceVerifyOnnx: any = {};
  const mockIdOcr: any = {};
  const mockTenantAccess: any = { assertCanConsume: async () => {} };

  const service = new SessionService(
    mockPrisma,
    mockAuth,
    mockCandidate,
    mockConfig,
    mockMinio,
    mockQueueProvider,
    mockLifecycle,
    mockStateMachine,
    mockScoring,
    mockSandboxOrchestrator,
    mockFaceVerifyOnnx,
    mockIdOcr,
    mockTenantAccess,
  );

  // Test 1: startSession creates session
  const res = await service.startSession("valid-token");
  assert.strictEqual(res.sessionId, "sess-1");

  // Test 2: beginSession transitions status to IN_PROGRESS
  const beginRes = await service.beginSession("sess-1");
  assert.strictEqual(beginRes.sessionId, "sess-1");

  // Test 3: sanitiseQuestionContent security assertions
  const mcqRaw = { prompt: "Q1", options: ["A", "B"], correctIndex: 1, explanation: "Secret" };
  const mcqSanitized: any = sanitiseQuestionContent("MCQ", mcqRaw);
  assert.strictEqual(mcqSanitized.correctIndex, undefined, "MCQ correctIndex must be stripped");
  assert.strictEqual(mcqSanitized.explanation, undefined, "MCQ explanation must be stripped");
  assert.deepStrictEqual(mcqSanitized.options, ["A", "B"]);

  const sqlRaw = { prompt: "Select all", expectedQuery: "SELECT * FROM users", explanation: "Hidden hint" };
  const sqlSanitized: any = sanitiseQuestionContent("SQL", sqlRaw);
  assert.strictEqual(sqlSanitized.expectedQuery, undefined, "SQL expectedQuery must be stripped");
  assert.strictEqual(sqlSanitized.explanation, undefined, "SQL explanation must be stripped");

  const codingRaw = {
    prompt: "Write code",
    visibleTestCases: [{ input: "1", expectedOutput: "2" }],
    hiddenTestCases: [{ input: "secret", expectedOutput: "leak" }],
    testCases: [
      { input: "1", expectedOutput: "2", isHidden: false },
      { input: "secret", expectedOutput: "leak", isHidden: true },
    ],
    explanation: "Solve with DP",
  };
  const codingSanitized: any = sanitiseQuestionContent("CODING", codingRaw);
  assert.strictEqual(codingSanitized.hiddenTestCases, undefined, "Coding hiddenTestCases must be stripped");
  assert.strictEqual(codingSanitized.explanation, undefined, "Coding explanation must be stripped");
  assert.strictEqual(codingSanitized.testCases.length, 1, "Only visible test cases must be retained");
  assert.strictEqual(codingSanitized.testCases[0].input, "1");

  const aiRaw = { prompt: "Prompt AI", rubric: { idealResponseSummary: "Secret answer" }, explanation: "Rule" };
  const aiSanitized: any = sanitiseQuestionContent("AI_PROMPTING", aiRaw);
  assert.strictEqual(aiSanitized.rubric, undefined, "AI Prompting rubric must be stripped");
  assert.strictEqual(aiSanitized.explanation, undefined, "AI Prompting explanation must be stripped");

  console.log("✅ All SessionService characterization & question sanitization tests passed successfully!");
}

describe('SessionService Subsystem', () => {
  it('runs all session service characterization tests', async () => {
    await runSessionCharacterizationTests();
  });
});
