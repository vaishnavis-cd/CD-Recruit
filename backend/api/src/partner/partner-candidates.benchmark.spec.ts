import { PartnerCandidatesService } from "./partner-candidates.service";
import assert from "node:assert";

async function runHighThroughputBenchmark() {
  console.log("\n=======================================================");
  console.log("⚡ CD-Recruit Partner API: 1,000 Candidate Batch Benchmark");
  console.log("=======================================================\n");

  const mockPartner: any = {
    id: "partner-benchmark-org",
    name: "Enterprise ATS Ingestor",
  };

  const mockActiveTemplates: any[] = [
    {
      id: "tpl-eng-fresher",
      roleName: "Software Engineer - Fresher",
      department: "SOFTWARE_ENGINEERING",
      category: "FRESHER",
      level: "FRESHER",
      experienceTier: "0-1",
      version: 1,
      isActive: true,
    },
    {
      id: "tpl-eng-l1",
      roleName: "Software Engineer - Level 1",
      department: "SOFTWARE_ENGINEERING",
      category: "EXPERIENCED",
      level: "EXPERIENCED",
      experienceTier: "2-5",
      version: 1,
      isActive: true,
    },
    {
      id: "tpl-eng-l2",
      roleName: "Software Engineer - Level 2",
      department: "SOFTWARE_ENGINEERING",
      category: "EXPERIENCED",
      level: "EXPERIENCED",
      experienceTier: "6-10",
      version: 1,
      isActive: true,
    },
    {
      id: "tpl-eng-l3",
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

  let dbDrive: any = null;
  const mockPrisma: any = {
    drive: {
      findFirst: async () => dbDrive,
      update: async ({ data }: any) => {
        Object.assign(dbDrive, data);
        return dbDrive;
      },
    },
    invite: {
      updateMany: async () => ({ count: 1 }),
    },
    auditLog: {
      create: async () => {},
    },
    staff: {
      findFirst: async () => ({ id: "staff-bench-admin", name: "Benchmark Admin", role: "ADMIN" }),
    },
    $transaction: async (cb: any) => cb(mockPrisma),
  };

  const mockDriveService: any = {
    createFromTemplate: async (roleTemplateId: string, meta: any) => {
      dbDrive = {
        id: "drive-benchmark-1000",
        name: meta.name,
        roleTemplateId,
        status: meta.status,
      };
      return dbDrive;
    },
  };

  const mockCandidateIngestionService: any = {
    processBulkCandidates: async (
      _tx: any,
      driveId: string,
      roleTemplateId: string,
      candidates: any[],
      staffId: string,
      _isGenerated: boolean,
      options: any,
    ) => {
      // Simulate fast DB batch insertion
      const createdInvites = candidates.map((c, i) => ({
        id: `inv-${i}`,
        candidateEmail: c.candidateEmail,
        candidateName: c.name,
        token: `jwt_bench_${i}`,
        expiresAt: options.expiresAt,
        roleTemplateId: c.roleTemplateId || roleTemplateId,
      }));
      return { count: candidates.length, createdInvites };
    },
  };

  const mockConfigService: any = {
    get: (key: string) => (key === "CANDIDATE_WEB_URL" ? "https://assess.cd-recruit.example.com" : null),
  };

  const service = new PartnerCandidatesService(
    mockPrisma,
    mockRoleTemplateService,
    mockDriveService,
    mockCandidateIngestionService,
    mockConfigService,
  );

  // 1. Generate 1,000 candidate batch payload across 4 experience tiers
  const CANDIDATE_COUNT = 1000;
  const tiers = ["0-1", "2-5", "6-10", "11-15"];
  const candidateBatch = Array.from({ length: CANDIDATE_COUNT }, (_, i) => ({
    name: `Candidate ${i + 1}`,
    email: `candidate_${i + 1}@benchmark-talent.com`,
    level: tiers[i % tiers.length],
    external_candidate_ref: `ats-cand-ref-${i + 1}`,
    phone: `+1555000${String(i).padStart(4, "0")}`,
  }));

  const payload = {
    department_code: "SOFTWARE_ENGINEERING",
    category: "EXPERIENCED",
    requisition_ref: "REQ-2026-SCALE-BENCH-001",
    drive_name: "Q3 High-Throughput Engineering Drive",
    candidates: candidateBatch,
  };

  const payloadSizeKb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(2);
  console.log(`📦 Payload Size for ${CANDIDATE_COUNT} candidates: ~${payloadSizeKb} KB`);
  console.log(`🚀 Dispatching pushCandidates for ${CANDIDATE_COUNT} candidates...`);

  const startTime = performance.now();
  const res = await service.pushCandidates(mockPartner, payload);
  const endTime = performance.now();
  const elapsedMs = (endTime - startTime).toFixed(2);

  console.log(`⏱️ Execution Time: ${elapsedMs} ms (${(Number(elapsedMs) / 1000).toFixed(3)} seconds)`);
  console.log(`🎯 Ingestion Throughput: ${((CANDIDATE_COUNT / Number(elapsedMs)) * 1000).toFixed(0)} candidates/sec`);

  // Assertions
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.requisition_ref, "REQ-2026-SCALE-BENCH-001");
  assert.strictEqual(res.invites.length, 1000);
  assert(Number(elapsedMs) < 2000, `Execution time ${elapsedMs}ms exceeded target threshold of 2,000ms!`);

  console.log("\n✅ 1,000 candidate high-throughput benchmark passed comfortably under the 2-5s limit!\n");
}

runHighThroughputBenchmark().catch((err) => {
  console.error("❌ High-throughput benchmark failed:", err);
  process.exit(1);
});
