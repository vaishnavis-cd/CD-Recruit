import { DriveService } from "./drive.service";
import assert from "node:assert";

async function runCharacterizationTests() {
  console.log("Running characterization tests for DriveService...");

  // Mock dependencies
  const mockPrisma: any = {
    roleTemplate: {
      findUnique: async ({ where }: any) => {
        if (where.id === "valid-template") {
          return { id: "valid-template", roleName: "Software Engineer" };
        }
        return null;
      },
    },
    question: {
      count: async () => 1,
      findMany: async () => [{ id: "q1", moduleType: "CODING" }],
    },
    candidate: {
      findMany: async () => [],
      createMany: async () => ({ count: 1 }),
    },
    invite: {
      createMany: async () => ({ count: 1 }),
      count: async () => 0,
      findMany: async () => [
        {
          id: "inv-1",
          candidateEmail: "test@example.com",
          candidateName: "Test Candidate",
          token: "draft-token",
          isGenerated: false,
        },
      ],
      update: async () => ({}),
    },
    auditLog: {
      create: async () => ({}),
    },
    driveQuestion: {
      createMany: async () => ({ count: 1 }),
    },
    drive: {
      findUnique: async ({ where }: any) => {
        if (where.id === "drive-1") {
          return {
            id: "drive-1",
            name: "Test Drive",
            roleTemplateId: "valid-template",
            roleTemplate: { roleName: "Software Engineer" },
            createdBy: { name: "Admin" },
            questions: [{ questionId: "q1" }],
            invites: [],
            moduleConfig: {},
            status: "DRAFT",
            createdAt: new Date(),
          };
        }
        return null;
      },
    },
    $transaction: async (cb: any) => cb(mockPrisma),
  };

  const mockAuthService: any = {
    generateInviteToken: () => "mocked-jwt-token",
  };

  const mockCandidateIngestionService: any = {
    processBulkCandidates: async () => ({ count: 1, createdCount: 1 }),
  };

  const mockCsvIngestionService: any = {
    parseCandidateCsv: () => ({ valid: [], errors: [] }),
  };

  const driveService = new DriveService(
    mockPrisma,
    mockAuthService,
    mockCandidateIngestionService,
    mockCsvIngestionService,
  );

  // Test 1: create throws NotFoundException if role template missing
  try {
    await driveService.create(
      {
        name: "Test",
        roleTemplateId: "invalid-id",
        scheduleStart: "2026-01-01",
        scheduleEnd: "2026-01-02",
      } as any,
      "staff-1",
    );
    assert.fail("Should have thrown NotFoundException");
  } catch (err: any) {
    assert.strictEqual(err.message, "Role template not found with ID invalid-id");
  }

  // Test 2: findOne returns detail object
  const detail = await driveService.findOne("drive-1");
  assert.strictEqual(detail.id, "drive-1");
  assert.strictEqual(detail.name, "Test Drive");
  assert.strictEqual(detail.roleTemplateName, "Software Engineer");

  // Test 3: generateLinks generates tokens for ungenerated candidates
  const genResult = await driveService.generateLinks("drive-1", "staff-1");
  assert.strictEqual(genResult.count, 1);

  console.log("✅ All DriveService characterization tests passed successfully!");
}

runCharacterizationTests().catch((err) => {
  console.error("❌ Characterization tests failed:", err);
  process.exit(1);
});
