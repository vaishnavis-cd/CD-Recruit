import { PartnerCandidatesService } from "./partner-candidates.service";
import assert from "node:assert";

async function runPartnerCandidatesServiceTests() {
  console.log("Running characterization tests for PartnerCandidatesService...");

  const mockPartner: any = {
    id: "partner-uuid-99",
    name: "Greenhouse ATS Partner",
  };

  const mockActiveTemplates: any[] = [
    {
      id: "tpl-fresher",
      roleName: "Software Engineer - Fresher",
      department: "SOFTWARE_ENGINEERING",
      category: "FRESHER",
      level: "FRESHER",
      experienceTier: "0-1",
      version: 1,
      isActive: true,
    },
    {
      id: "tpl-l1",
      roleName: "Software Engineer - Level 1",
      department: "SOFTWARE_ENGINEERING",
      category: "EXPERIENCED",
      level: "EXPERIENCED",
      experienceTier: "2-5",
      version: 1,
      isActive: true,
    },
    {
      id: "tpl-l2",
      roleName: "Software Engineer - Level 2",
      department: "SOFTWARE_ENGINEERING",
      category: "EXPERIENCED",
      level: "EXPERIENCED",
      experienceTier: "6-10",
      version: 1,
      isActive: true,
    },
    {
      id: "tpl-l3",
      roleName: "Software Engineer - Level 3",
      department: "SOFTWARE_ENGINEERING",
      category: "EXPERIENCED",
      level: "EXPERIENCED",
      experienceTier: "11-15",
      version: 1,
      isActive: true,
    },
  ];

  const mockRoleTemplateService: any = {
    findActiveTemplate: async (dept: string, category: string, tier?: string) => {
      const match = mockActiveTemplates.find(
        (t) =>
          t.department === dept &&
          (t.category === category || t.level === category) &&
          (!tier || t.experienceTier === tier),
      );
      if (match) return match;
      throw new Error("NotFoundException: Active role template not found");
    },
    findActiveTemplatesForDepartment: async (dept: string) => {
      return mockActiveTemplates.filter((t) => t.department === dept && t.isActive);
    },
  };

  let createdDrives: any[] = [];
  let auditLogs: any[] = [];
  let createdInvites: any[] = [];

  const mockPrisma: any = {
    drive: {
      findFirst: async ({ where }: any) => {
        let found = createdDrives[0] || null;
        if (where?.OR && Array.isArray(where.OR)) {
          found = createdDrives.find((d) =>
            where.OR.some((clause: any) =>
              clause.name?.contains
                ? d.name.includes(clause.name.contains)
                : clause.name?.startsWith
                ? d.name.startsWith(clause.name.startsWith)
                : false,
            ),
          ) || createdDrives[0];
        } else if (where?.name) {
          const searchName = typeof where.name === "string" ? where.name : where.name?.startsWith;
          if (searchName) {
            found = createdDrives.find((d) => d.name.includes(searchName)) || null;
          }
        }
        if (found) {
          return {
            ...found,
            invites: createdInvites.filter((inv) => inv.driveId === found.id),
          };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const d = createdDrives.find((drv) => drv.id === where.id);
        if (d) Object.assign(d, data);
        return d || data;
      },
    },
    invite: {
      findMany: async ({ where }: any) => {
        return createdInvites.filter((inv) => inv.driveId === where.driveId);
      },
      updateMany: async () => ({ count: 1 }),
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
    staff: {
      findFirst: async () => ({ id: "staff-admin-1", name: "Admin Staff", role: "ADMIN" }),
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
      const summaries = candidates.map((c) => {
        const item = {
          id: "inv-" + c.candidateEmail,
          driveId,
          roleTemplateId: c.roleTemplateId || roleTemplateId,
          candidateEmail: c.candidateEmail,
          candidateName: c.name,
          category: c.category || "EXPERIENCED",
          experienceTier: c.experienceTier || "2-5",
          token: "jwt_token_" + c.candidateEmail,
          expiresAt: options.expiresAt,
          scheduledTime: options.scheduledTime,
          createdById: staffId,
        };
        createdInvites.push(item);
        return {
          id: item.id,
          candidateEmail: item.candidateEmail,
          candidateName: item.candidateName,
          token: item.token,
          expiresAt: item.expiresAt,
          roleTemplateId: item.roleTemplateId,
          category: item.category,
          experienceTier: item.experienceTier,
        };
      });
      return { count: candidates.length, createdCount: candidates.length, createdInvites: summaries, skippedCount: 0 };
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

  // Test 1: Throws 422 UnprocessableEntityException when active template is missing for department
  let threw422 = false;
  try {
    await service.pushCandidates(mockPartner, {
      department_code: "SRE",
      category: "FRESHER",
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

  // Test 2: Ingest candidates with multi-tier levels (2-5, 6-10, 11-15) and map to calibrated role templates
  const res1 = await service.pushCandidates(mockPartner, {
    department_code: "SOFTWARE_ENGINEERING",
    category: "EXPERIENCED",
    requisition_ref: "REQ-100",
    candidates: [
      { name: "Bob Martin", email: "bob@example.com", level: "2-5" },
      { name: "Carol Danvers", email: "carol@example.com", level: "6-10" },
      { name: "Dave Miller", email: "dave@example.com", level: "11-15" },
    ],
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.requisition_ref, "REQ-100");
  assert.strictEqual(res1.invites.length, 3);
  assert.strictEqual(res1.invites[0].candidate_email, "bob@example.com");
  assert.strictEqual(res1.invites[0].experience_tier, "2-5");
  assert.strictEqual(res1.invites[1].experience_tier, "6-10");
  assert.strictEqual(res1.invites[2].experience_tier, "11-15");
  assert(res1.invites[0].assessment_link.includes("/invite/jwt_token_bob@example.com"));

  const lastAudit = auditLogs[auditLogs.length - 1];
  assert.strictEqual(lastAudit.metadata.actorLabel, "API:Greenhouse ATS Partner");
  console.log("  ✔ Ingests multi-tier candidates and maps to calibrated RoleTemplates");

  // Test 3: Subsequent call for same requisition reuses existing Drive
  const initialDriveCount = createdDrives.length;
  const res2 = await service.pushCandidates(mockPartner, {
    department_code: "SOFTWARE_ENGINEERING",
    category: "EXPERIENCED",
    requisition_ref: "REQ-100",
    candidates: [{ name: "Charlie Day", email: "charlie@example.com", level: "2-5" }],
  });

  assert.strictEqual(createdDrives.length, initialDriveCount, "Should not create a duplicate Drive for same requisition");
  assert.strictEqual(res2.drive_id, res1.drive_id);
  console.log("  ✔ Subsequent call for same requisition reuses existing Drive");

  // Test 4: getRequisitionStatus returns status with is_scored: false when Score row is missing
  const statusRes = await service.getRequisitionStatus(mockPartner, "REQ-100");
  assert.strictEqual(statusRes.requisition_ref, "REQ-100");
  assert.strictEqual(statusRes.candidates.length, 4);
  assert.strictEqual(statusRes.candidates[0].is_scored, false);
  assert.strictEqual(statusRes.candidates[0].composite_score, null);
  assert.strictEqual(statusRes.candidates[0].score_band, null);
  console.log("  ✔ getRequisitionStatus returns is_scored: false when Score row is missing");

  // Test 5: getRequisitionStatus populates is_scored: true and score_band when real Score row exists
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
  if (!scoredCand) throw new Error("scoredCand not found in response");
  assert.strictEqual(scoredCand.is_scored, true);
  assert.strictEqual(scoredCand.composite_score, 88.5);
  assert.strictEqual(scoredCand.score_band, "HIGH");
  console.log("  ✔ getRequisitionStatus populates is_scored: true and score_band HIGH when real Score row exists");

  console.log("✅ All PartnerCandidatesService characterization tests passed successfully!");
}

runPartnerCandidatesServiceTests().catch((err) => {
  console.error("❌ PartnerCandidatesService tests failed:", err);
  process.exit(1);
});
