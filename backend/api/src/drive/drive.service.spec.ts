import { DriveService } from "./drive.service";
import assert from "node:assert";

async function runCharacterizationTests() {
  console.log("Running characterization tests for DriveService...");

  // Mock dependencies
  const mockPrisma: any = {
    roleTemplate: {
      findFirst: async ({ where }: any) => {
        if (where?.id === "valid-template" || where?.OR?.some((o: any) => o.id === "valid-template")) {
          return { id: "valid-template", roleName: "Software Engineer" };
        }
        return null;
      },
      findUnique: async ({ where }: any) => {
        if (where.id === "valid-template") {
          return { id: "valid-template", roleName: "Software Engineer" };
        }
        return null;
      },
      create: async ({ data }: any) => ({ id: "created-tpl", ...data }),
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
      create: async ({ data }: any) => ({ id: "drive-created", ...data }),
      update: async ({ data }: any) => ({ id: "drive-updated", ...data }),
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

  // Test 1: createFromTemplate throws NotFoundException if role template missing
  try {
    await driveService.createFromTemplate("invalid-id", { name: "Test" }, "staff-1");
    assert.fail("Should have thrown NotFoundException");
  } catch (err: any) {
    assert.strictEqual(err.message, "RoleTemplate not found with ID invalid-id");
  }

  // Test 2: findOne returns detail object
  const detail = await driveService.findOne("drive-1");
  assert.strictEqual(detail.id, "drive-1");
  assert.strictEqual(detail.name, "Test Drive");
  assert.strictEqual(detail.roleTemplateName, "Software Engineer");

  // Test 3: generateLinks generates tokens for ungenerated candidates
  const genResult = await driveService.generateLinks("drive-1", "staff-1");
  assert.strictEqual(genResult.count, 1);

  // Test 4: createFromTemplate copies template questions into driveQuestion with version snapshot
  let createdDriveData: any = null;
  let createdDriveQuestions: any = null;

  const mockPrismaTemplate: any = {
    roleTemplate: {
      findUnique: async ({ where }: any) => {
        if (where.id === "tpl-123") {
          return {
            id: "tpl-123",
            roleName: "Backend Engineer",
            department: "SOFTWARE_ENGINEERING",
            level: "EXPERIENCED",
            durationMinutes: 75,
            weightingPreset: { MCQ: 0.4, CODING: 0.6 },
            version: 2,
            questions: [
              {
                id: "rtq-1",
                questionId: "q-10",
                moduleType: "CODING",
                orderIndex: 0,
                questionVersionSnapshot: 3,
                pointShare: 1.0,
                question: { id: "q-10", version: 3 },
              },
            ],
          };
        }
        return null;
      },
    },
    drive: {
      create: async ({ data }: any) => {
        createdDriveData = { id: "drive-from-tpl", ...data };
        return createdDriveData;
      },
      findUnique: async ({ where }: any) => ({
        id: where.id,
        name: createdDriveData.name,
        roleTemplateId: "tpl-123",
        questions: [{ questionId: "q-10", questionVersionSnapshot: 3 }],
      }),
    },
    driveQuestion: {
      createMany: async ({ data }: any) => {
        createdDriveQuestions = data;
        return { count: data.length };
      },
    },
    auditLog: {
      create: async () => ({}),
    },
    $transaction: async (cb: any) => cb(mockPrismaTemplate),
  };

  const templateDriveService = new DriveService(
    mockPrismaTemplate,
    mockAuthService,
    mockCandidateIngestionService,
    mockCsvIngestionService,
  );

  const tplDrive = await templateDriveService.createFromTemplate("tpl-123", { name: "Custom Drive Name" }, "staff-1");
  assert.strictEqual(createdDriveData.name, "Custom Drive Name");
  assert.strictEqual(createdDriveData.roleTemplateId, "tpl-123");
  assert.strictEqual(createdDriveQuestions.length, 1);
  assert.strictEqual(createdDriveQuestions[0].questionId, "q-10");
  assert.strictEqual(createdDriveQuestions[0].questionVersionSnapshot, 3);
  assert.strictEqual(createdDriveData.moduleConfig.CODING.weight, 0.6);
  assert.strictEqual(createdDriveData.moduleConfig.CODING.durationMinutes, 75);

  console.log("✅ All DriveService characterization tests passed successfully!");
}

runCharacterizationTests().catch((err) => {
  console.error("❌ Characterization tests failed:", err);
  process.exit(1);
});
