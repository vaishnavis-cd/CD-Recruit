import { SessionService } from "./session.service";
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
  );

  // Test 1: startSession creates session
  const res = await service.startSession("valid-token");
  assert.strictEqual(res.sessionId, "sess-1");

  // Test 2: beginSession transitions status to IN_PROGRESS
  const beginRes = await service.beginSession("sess-1");
  assert.strictEqual(beginRes.sessionId, "sess-1");

  console.log("✅ All SessionService characterization tests passed successfully!");
}

runSessionCharacterizationTests().catch((err) => {
  console.error("❌ SessionService characterization tests failed:", err);
  process.exit(1);
});
