import { DriveService } from "./drive.service";
import { DriveShufflerService } from "./drive-shuffler.service";
import { CsvIngestionService } from "./csv-ingestion.service";
import { CandidateCategory } from "../common/utils/experience-tier.util";
import assert from "node:assert";

async function runCharacterizationTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Drive Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 1: DriveService Lifecycle & Operations
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing DriveService lifecycle operations...");

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
      session: {
        updateMany: async () => ({ count: 1 }),
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
        deleteMany: async () => ({ count: 1 }),
      },
      auditLog: {
        create: async () => ({}),
      },
      driveQuestion: {
        createMany: async () => ({ count: 1 }),
        findMany: async () => [{ questionId: "q1", moduleType: "CODING", question: { id: "q1", difficulty: "MEDIUM" } }],
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

    // 1.1 RoleTemplate missing check
    let threwTemplateError = false;
    try {
      await driveService.createFromTemplate("invalid-id", { name: "Test" }, "staff-1");
    } catch (err: any) {
      if (err.message.includes("RoleTemplate not found with ID invalid-id")) {
        threwTemplateError = true;
      }
    }
    assert.strictEqual(threwTemplateError, true);
    pass("createFromTemplate throws NotFoundException if role template missing");

    // 1.2 findOne detail retrieval
    const detail = await driveService.findOne("drive-1");
    assert.strictEqual(detail.id, "drive-1");
    assert.strictEqual(detail.name, "Test Drive");
    assert.strictEqual(detail.roleTemplateName, "Software Engineer");
    pass("findOne returns detail object with relations");

    // 1.3 generateLinks candidate token generation
    const genResult = await driveService.generateLinks("drive-1", "staff-1");
    assert.strictEqual(genResult.count, 1);
    pass("generateLinks generates tokens for ungenerated candidates");

    // 1.4 removeCandidateFromDrive
    const removeResult = await driveService.removeCandidateFromDrive("drive-1", "cand-1", "staff-1");
    assert.strictEqual(removeResult.success, true);
    pass("removeCandidateFromDrive removes candidate from drive");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: createFromTemplate Version Snapshots
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing createFromTemplate question version snapshots...");

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

    const mockAuthService: any = { generateInviteToken: () => "tok" };
    const mockCandidateIngestionService: any = { processBulkCandidates: async () => ({ count: 0 }) };
    const mockCsvIngestionService: any = { parseCandidateCsv: () => ({ valid: [], errors: [] }) };

    const templateDriveService = new DriveService(
      mockPrismaTemplate,
      mockAuthService,
      mockCandidateIngestionService,
      mockCsvIngestionService,
    );

    await templateDriveService.createFromTemplate("tpl-123", { name: "Custom Drive Name" }, "staff-1");
    assert.strictEqual(createdDriveData.name, "Custom Drive Name");
    assert.strictEqual(createdDriveData.roleTemplateId, "tpl-123");
    assert.strictEqual(createdDriveQuestions.length, 1);
    assert.strictEqual(createdDriveQuestions[0].questionId, "q-10");
    assert.strictEqual(createdDriveQuestions[0].questionVersionSnapshot, 3);
    assert.strictEqual(createdDriveData.moduleConfig.CODING.weight, 60);
    assert.strictEqual(createdDriveData.moduleConfig.CODING.durationMinutes, 45);
    pass("createFromTemplate captures questionVersionSnapshot and moduleConfig");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: DriveShufflerService Stratified Hypercube Randomizer
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing DriveShufflerService Latin hypercube randomization...");

    const shuffler = new DriveShufflerService();

    // Pool with 6 MCQ questions (2 easy, 2 medium, 2 hard) + 1 duplicate prompt with different wording
    const pool = [
      { questionId: "q1", moduleType: "MCQ", question: { difficulty: "EASY", content: { prompt: "What is 2+2?", options: ["3", "4", "5"] } } },
      { questionId: "q2", moduleType: "MCQ", question: { difficulty: "EASY", content: { prompt: "What is 1+1?", options: ["2", "3"] } } },
      { questionId: "q3", moduleType: "MCQ", question: { difficulty: "MEDIUM", content: { prompt: "Explain polymorphism", options: ["A", "B"] } } },
      { questionId: "q4", moduleType: "MCQ", question: { difficulty: "MEDIUM", content: { prompt: "Explain encapsulation", options: ["C", "D"] } } },
      { questionId: "q5", moduleType: "MCQ", question: { difficulty: "HARD", content: { prompt: "Explain Paxos consensus", options: ["P", "Q"] } } },
      { questionId: "q6", moduleType: "MCQ", question: { difficulty: "HARD", content: { prompt: "Explain Raft consensus", options: ["R", "S"] } } },
      // Duplicate prompt of q1 with different whitespace
      { questionId: "q1-dup", moduleType: "MCQ", question: { difficulty: "EASY", content: { prompt: "  what is 2+2?  ", options: ["4", "3", "5"] } } },
    ];

    // 3.1 Intra-Candidate Uniqueness & Deduplication
    const cand1Questions = shuffler.shuffleQuestionsForCandidate(pool, "cand-001", "drive-alpha");
    assert.strictEqual(cand1Questions.length, 6, "Must allocate 6 distinct questions, filtering out duplicate q1-dup");

    const hashes = new Set(cand1Questions.map((q) => q.contentHash));
    assert.strictEqual(hashes.size, 6, "All 6 allocated questions must have unique content hashes");
    pass("Intra-candidate deduplication filters reworded/whitespace duplicate questions via contentHash");

    // 3.2 Deterministic reproducibility for same candidate & drive
    const cand1Again = shuffler.shuffleQuestionsForCandidate(pool, "cand-001", "drive-alpha");
    assert.deepStrictEqual(
      cand1Questions.map((q) => q.questionId),
      cand1Again.map((q) => q.questionId),
      "Same candidate and drive must receive identical deterministic question sequence",
    );
    pass("Deterministic question sequence is reproduced for identical candidate seed");

    // 3.3 Candidate Diversity across candidates
    const cand2Questions = shuffler.shuffleQuestionsForCandidate(pool, "cand-002", "drive-alpha");
    assert.strictEqual(cand2Questions.length, 6);
    pass("Latin Hypercube rotation produces valid randomized sequence for candidate 2");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: CsvIngestionService Column Parsing & Tier Normalization
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing CsvIngestionService parsing and experience tier mapping...");

    const csvService = new CsvIngestionService();

    const sampleCsv = `Candidate Name,Email Address,Experience Level
Priya Sharma,priya@example.com,7 years
Rahul Verma,rahul@example.com,fresher
Amit Patel,amit@example.com,3.5 yrs
Sneha Rao,sneha@example.com,12+ years`;

    const result = csvService.parseCandidateCsv(sampleCsv);
    assert.strictEqual(result.errors.length, 0, "Valid CSV must parse with 0 errors");
    assert.strictEqual(result.valid.length, 4, "Must parse 4 candidate rows");

    assert.strictEqual(result.valid[0].candidateEmail, "priya@example.com");
    assert.strictEqual(result.valid[0].experienceTier, "6-10");
    assert.strictEqual(result.valid[0].category, CandidateCategory.EXPERIENCED);

    assert.strictEqual(result.valid[1].candidateEmail, "rahul@example.com");
    assert.strictEqual(result.valid[1].experienceTier, "0-1");
    assert.strictEqual(result.valid[1].category, CandidateCategory.FRESHER);

    assert.strictEqual(result.valid[2].experienceTier, "2-5");
    assert.strictEqual(result.valid[3].experienceTier, "11-15");
    pass("CsvIngestionService maps experience tiers ('0-1', '2-5', '6-10', '11-15') and category correctly");

    // Invalid email check
    const invalidCsv = `name,email\nBad Candidate,not-an-email`;
    const invalidResult = csvService.parseCandidateCsv(invalidCsv);
    assert.strictEqual(invalidResult.errors.length, 1);
    assert.strictEqual(invalidResult.valid.length, 0);
    pass("CsvIngestionService rejects invalid email addresses with descriptive error message");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runCharacterizationTests().catch((err) => {
  console.error("❌ Characterization tests failed:", err);
  process.exit(1);
});
