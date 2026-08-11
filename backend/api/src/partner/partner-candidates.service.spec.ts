import { PartnerCandidatesService } from "./partner-candidates.service";
import { Department, ExperienceLevel } from "@prisma/client";
import assert from "node:assert";

async function runPartnerCandidatesServiceTests() {
  console.log("Running characterization tests for PartnerCandidatesService...");

  const mockPartner: any = {
    id: "partner-uuid-99",
    name: "Greenhouse ATS Partner",
  };

  const mockActiveTemplate: any = {
    id: "tpl-active-1",
    roleName: "Senior Software Engineer",
    department: "SOFTWARE_ENGINEERING",
    level: "EXPERIENCED",
    version: 1,
    isActive: true,
  };

  const mockRoleTemplateService: any = {
    findActiveTemplate: async (dept: string, lvl: string) => {
      if (dept === "SOFTWARE_ENGINEERING" && lvl === "EXPERIENCED") {
        return mockActiveTemplate;
      }
      throw new Error("NotFoundException: Active role template not found");
    },
  };

  let createdDrives: any[] = [];
  let auditLogs: any[] = [];
  let createdInvites: any[] = [];

  const mockPrisma: any = {
    drive: {
      findFirst: async ({ where }: any) => {
        const searchName = typeof where?.name === "string" ? where.name : where?.name?.startsWith;
        if (!searchName) return createdDrives[0] || null;
        const found = createdDrives.find((d) => d.name.includes(searchName));
        if (found) {
          return {
            ...found,
            invites: createdInvites.filter((inv) => inv.driveId === found.id),
          };
        }
        return null;
      },
    },
    invite: {
      findMany: async ({ where }: any) => {
        return createdInvites.filter((inv) => inv.driveId === where.driveId);
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
    $transaction: async (cb: any) => cb(mockPrisma),
  };

  const mockDriveService: any = {
    createFromTemplate: async (roleTemplateId: string, meta: any, actorStaffId: string) => {
      const drive = {
        id: "drive-partner-1",
        name: meta.name,
        roleTemplateId,
        status: meta.status,
        invites: [],
      };
      createdDrives.push(drive);
      return drive;
    },
  };

  const mockCandidateIngestionService: any = {
    processBulkCandidates: async (
      _tx: any,
      driveId: string,
      roleTemplateId: string,
      candidates: any[],
      staffId: string,
      isGenerated: boolean,
      options: any,
    ) => {
      candidates.forEach((c) => {
        createdInvites.push({
          id: "inv-" + c.candidateEmail,
          driveId,
          roleTemplateId,
          candidateEmail: c.candidateEmail,
          candidateName: c.name,
          token: "jwt_token_" + c.candidateEmail,
          expiresAt: options.expiresAt,
          scheduledTime: options.scheduledTime,
          createdById: staffId,
        });
      });
      return { count: candidates.length };
    },
  };

  const mockConfigService: any = {
    get: (key: string) => (key === "CANDIDATE_WEB_URL" ? "http://localhost:3000" : null),
  };

  const service = new PartnerCandidatesService(
    mockPrisma,
    mockRoleTemplateService,
    mockDriveService,
    mockCandidateIngestionService,
    mockConfigService,
  );

  // Test 1: Throws 422 UnprocessableEntityException when active template is missing
  let threw422 = false;
  try {
    await service.pushCandidates(mockPartner, {
      department_code: "SRE",
      level: "FRESHER",
      requisition_ref: "REQ-001",
      candidates: [{ name: "Alice", email: "alice@example.com" }],
    });
  } catch (err: any) {
    threw422 = true;
    assert.strictEqual(err.status, 422);
    assert(err.message.includes("No active role template found"));
  }
  assert.strictEqual(threw422, true, "Should throw 422 when active template missing");
  console.log("  ✔ Throws 422 UnprocessableEntityException when active role template missing");

  // Test 2: First call for requisition creates Drive via createFromTemplate and sets 24h rolling invites
  const res1 = await service.pushCandidates(mockPartner, {
    department_code: "SOFTWARE_ENGINEERING",
    level: "EXPERIENCED",
    requisition_ref: "REQ-100",
    candidates: [{ name: "Bob Martin", email: "bob@example.com" }],
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.requisition_ref, "REQ-100");
  assert.strictEqual(res1.invites.length, 1);
  assert.strictEqual(res1.invites[0].candidate_email, "bob@example.com");
  assert(res1.invites[0].assessment_link.includes("/invite/jwt_token_bob@example.com"));

  const lastAudit = auditLogs[auditLogs.length - 1];
  assert.strictEqual(lastAudit.staffId, "API:Greenhouse ATS Partner");
  console.log("  ✔ First call creates Drive via createFromTemplate and returns candidate assessment link");

  // Test 3: Subsequent call for same requisition reuses existing Drive
  const initialDriveCount = createdDrives.length;
  const res2 = await service.pushCandidates(mockPartner, {
    department_code: "SOFTWARE_ENGINEERING",
    level: "EXPERIENCED",
    requisition_ref: "REQ-100",
    candidates: [{ name: "Charlie Day", email: "charlie@example.com" }],
  });

  assert.strictEqual(createdDrives.length, initialDriveCount, "Should not create a duplicate Drive for same requisition");
  assert.strictEqual(res2.drive_id, res1.drive_id);
  console.log("  ✔ Subsequent call for same requisition reuses existing Drive");

  // Test 4: getRequisitionStatus returns status with PENDING score_status when Score row is missing
  const statusRes = await service.getRequisitionStatus(mockPartner, "REQ-100");
  assert.strictEqual(statusRes.requisition_ref, "REQ-100");
  assert.strictEqual(statusRes.total_candidates, 2);
  assert.strictEqual(statusRes.candidates[0].score_status, "PENDING");
  assert.strictEqual(statusRes.candidates[0].composite_score, null);
  assert.strictEqual(statusRes.candidates[0].composite_score_band, null);
  console.log("  ✔ getRequisitionStatus returns PENDING score_status when Score row is missing");

  // Test 5: getRequisitionStatus populates SCORED and composite_score_band when real Score row exists
  createdInvites[0].session = {
    id: "sess-1",
    status: "COMPLETED",
    score: {
      compositeScore: 88.5,
      gradingSource: "real_evaluation_engine",
    },
  };

  const scoredStatusRes = await service.getRequisitionStatus(mockPartner, "REQ-100");
  const scoredCand = scoredStatusRes.candidates.find((c: any) => c.candidate_email === "bob@example.com");
  assert.strictEqual(scoredCand.score_status, "SCORED");
  assert.strictEqual(scoredCand.composite_score, 88.5);
  assert.strictEqual(scoredCand.composite_score_band, "STRONG_PASS");
  console.log("  ✔ getRequisitionStatus populates SCORED and STRONG_PASS band when real Score row exists");

  console.log("✅ All PartnerCandidatesService characterization tests passed successfully!");
}

runPartnerCandidatesServiceTests().catch((err) => {
  console.error("❌ PartnerCandidatesService tests failed:", err);
  process.exit(1);
});
