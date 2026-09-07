import { AdminService } from "./admin.service";
import { InviteService } from "./invite.service";
import { ReviewDecision, SessionStatus, InviteStatus } from "@cd-recruit/shared-types";

async function runAdminServiceCharacterizationTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Admin & Invite Services");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, message: string) {
    testTotal++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ PASS: ${message}`);
      testPassed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: InviteService.createInvite - Single-Step Atomic Creation
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing InviteService.createInvite single-step atomic creation...");
    let createdInviteData: any = null;
    let auditLogCreated: any = null;

    const mockPrisma: any = {
      roleTemplate: {
        findUnique: async () => ({ id: "template-1", roleName: "Fullstack Engineer" }),
      },
      drive: {
        findUnique: async () => ({ id: "drive-1", name: "Campus Drive 2026" }),
      },
      invite: {
        create: async (args: any) => {
          createdInviteData = args.data;
          return {
            ...args.data,
            createdAt: new Date(),
            roleTemplate: { roleName: "Fullstack Engineer" },
            createdBy: { name: "HR Lead" },
          };
        },
      },
      auditLog: {
        create: async (args: any) => {
          auditLogCreated = args.data;
          return args.data;
        },
      },
    };

    const mockAuthService: any = {
      generateInviteToken: (inviteId: string, email: string, name: string, roleTemplateId: string) => {
        return `jwt-signed-token-for-${inviteId}`;
      },
    };

    const mockConfigService: any = {
      get: (key: string) => null,
    };

    const inviteService = new InviteService(
      mockPrisma,
      mockAuthService,
      mockConfigService,
      {} as any,
      {} as any,
    );

    const result = await inviteService.createInvite(
      {
        candidateEmail: "candidate@example.com",
        candidateName: "Alex Doe",
        roleTemplateId: "template-1",
        driveId: "drive-1",
      },
      "staff-123",
    );

    assert(!!createdInviteData, "Invite data must be inserted in a single create operation");
    assert(!!createdInviteData.id, "Invite ID must be pre-generated (UUID format)");
    assert(
      !createdInviteData.token.startsWith("temp-"),
      `Token must be the final JWT directly, got: ${createdInviteData.token}`,
    );
    assert(
      createdInviteData.token === `jwt-signed-token-for-${createdInviteData.id}`,
      "Token must contain the pre-generated invite ID",
    );
    assert(result.inviteLink.includes(createdInviteData.token), "Invite link must include valid token");
    assert(auditLogCreated?.action === "INVITE_CREATED", "Audit log must be recorded for invite creation");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: InviteService.listInvites - Dynamic Expiration without updateMany
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing InviteService.listInvites dynamic expiration without silent DB mutations...");
    let updateManyCalled = false;

    const staleExpiresAt = new Date(Date.now() - 3600 * 1000); // 1 hour in the past
    const activeExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour in future

    const mockPrisma: any = {
      invite: {
        updateMany: async () => {
          updateManyCalled = true;
          return { count: 0 };
        },
        findMany: async () => [
          {
            id: "inv-1",
            candidateEmail: "stale@example.com",
            candidateName: "Stale User",
            roleTemplateId: "t-1",
            status: InviteStatus.PENDING,
            token: "tok-1",
            createdById: "s-1",
            createdAt: new Date(),
            expiresAt: staleExpiresAt,
            roleTemplate: { roleName: "Backend Engineer" },
            createdBy: { name: "Recruiter" },
          },
          {
            id: "inv-2",
            candidateEmail: "active@example.com",
            candidateName: "Active User",
            roleTemplateId: "t-1",
            status: InviteStatus.PENDING,
            token: "tok-2",
            createdById: "s-1",
            createdAt: new Date(),
            expiresAt: activeExpiresAt,
            roleTemplate: { roleName: "Backend Engineer" },
            createdBy: { name: "Recruiter" },
          },
        ],
        count: async () => 2,
      },
    };

    const inviteService = new InviteService(
      mockPrisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await inviteService.listInvites({ page: 1, pageSize: 10 });
    assert(!updateManyCalled, "listInvites MUST NOT execute updateMany mutation on read");
    assert(result.items[0].status === InviteStatus.EXPIRED, "Stale pending invite must be dynamically evaluated as EXPIRED");
    assert(result.items[1].status === InviteStatus.PENDING, "Active pending invite must remain PENDING");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: AdminService.listSessions - Accurate Database Pagination
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing AdminService.listSessions pagination accuracy...");

    const mockSessions = [
      {
        id: "sess-1",
        candidate: { id: "c-1", name: "Candidate 1", email: "c1@test.com" },
        roleTemplate: { roleName: "Frontend Developer" },
        status: SessionStatus.SUBMITTED,
        startedAt: new Date(),
        submittedAt: new Date(),
        deadlineAt: new Date(),
        disconnectCount: 0,
        score: { compositeScore: 0.92, sayDoConsistencyScore: 0.9, moduleScores: { MCQ: 0.95 }, humanReviewed: false, aiConfidence: 0.9 },
        reviewerDecision: null,
        integrityFlags: [],
        proctoringEvents: [],
      },
      {
        id: "sess-2",
        candidate: { id: "c-2", name: "Candidate 2", email: "c2@test.com" },
        roleTemplate: { roleName: "Backend Developer" },
        status: SessionStatus.IN_PROGRESS,
        startedAt: new Date(),
        submittedAt: null,
        deadlineAt: new Date(),
        disconnectCount: 1,
        score: null,
        reviewerDecision: null,
        integrityFlags: [],
        proctoringEvents: [],
      },
    ];

    const mockPrisma: any = {
      session: {
        findMany: async (args: any) => mockSessions,
        count: async () => 2,
      },
    };

    const mockConfigService: any = {
      get: (key: string) => {
        if (key === "app.biometrics.faceThreshold") return 0.60;
        if (key === "app.biometrics.nameThreshold") return 0.75;
        return null;
      },
    };

    const adminService = new AdminService(
      mockPrisma,
      {} as any,
      mockConfigService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await adminService.listSessions({ page: 1, pageSize: 10 });
    assert(result.items.length === 2, `Result items count (${result.items.length}) must match queried database rows`);
    assert(result.total === 2, "Total count must match database count");
    assert(result.items[0].candidateEmail === "c1@test.com", "First candidate email must match");
    assert(result.items[1].candidateEmail === "c2@test.com", "Second candidate email must match");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: AdminService.recordDecision - Atomic Upsert
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing AdminService.recordDecision atomic upsert...");

    let upsertCalledWith: any = null;
    let scoreUpdatedWith: any = null;
    let auditLogRecordedWith: any = null;

    const mockPrisma: any = {
      session: {
        findUnique: async () => ({
          id: "sess-123",
          status: SessionStatus.SUBMITTED,
          score: { id: "score-1", humanReviewed: false },
          reviewerDecision: null,
        }),
      },
      reviewerDecision: {
        upsert: async (args: any) => {
          upsertCalledWith = args;
          return {
            id: "decision-1",
            sessionId: "sess-123",
            staffId: "staff-1",
            decision: "ADVANCE",
            note: "Excellent candidate",
            decidedAt: new Date(),
          };
        },
      },
      score: {
        update: async (args: any) => {
          scoreUpdatedWith = args;
          return args.data;
        },
      },
      auditLog: {
        create: async (args: any) => {
          auditLogRecordedWith = args.data;
          return args.data;
        },
      },
      $transaction: async (fn: any) => {
        return fn(mockPrisma);
      },
    };

    const mockConfigService: any = {
      get: (key: string) => null,
    };

    const adminService = new AdminService(
      mockPrisma,
      {} as any,
      mockConfigService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await adminService.recordDecision(
      "sess-123",
      ReviewDecision.ADVANCE,
      "staff-1",
      "Excellent candidate",
    );

    assert(!!upsertCalledWith, "Decision must be recorded via atomic upsert");
    assert(upsertCalledWith.where.sessionId === "sess-123", "Upsert where clause must target sessionId");
    assert(upsertCalledWith.create.decision === ReviewDecision.ADVANCE, "Create payload must specify decision");
    assert(upsertCalledWith.update.decision === ReviewDecision.ADVANCE, "Update payload must specify decision");
    assert(scoreUpdatedWith?.data?.humanReviewed === true, "Score humanReviewed flag must be updated to true");
    assert(auditLogRecordedWith?.action === "DECISION_RECORDED", "Audit log must be recorded");
    assert(result.decision === ReviewDecision.ADVANCE, "Result decision must return ADVANCE");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: AdminService.getSessionDetail - No Synthetic Mock Score Leakage
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing AdminService.getSessionDetail data integrity without mock score synthesis...");

    const mockPrisma: any = {
      session: {
        findUnique: async () => ({
          id: "sess-unscored",
          candidate: { id: "c-1", name: "Jane Smith", email: "jane@test.com" },
          roleTemplate: { roleName: "Software Engineer" },
          drive: { name: "Tech Drive" },
          status: SessionStatus.IN_PROGRESS,
          cvMode: false,
          startedAt: new Date(),
          submittedAt: null,
          deadlineAt: new Date(),
          disconnectCount: 0,
          moduleResponses: [
            {
              id: "mr-1",
              questionId: "q-1",
              responsePayload: { text: "answer" },
              timeSpentSeconds: 45,
              isDraft: false,
              lastAutosavedAt: new Date(),
              question: { id: "q-1", moduleType: "MCQ", tags: [], content: { text: "What is 2+2?" } },
            },
          ],
          integrityFlags: [],
          proctoringEvents: [],
          identityCaptures: [],
          score: null, // Unscored session
          reviewerDecision: null,
        }),
      },
      proctoringEvent: {
        findMany: async () => [],
      },
    };

    const mockStorage: any = {
      getSignedUrl: async () => "http://minio/signed-url",
    };

    const mockConfigService: any = {
      get: (key: string) => null,
    };

    const adminService = new AdminService(
      mockPrisma,
      mockStorage,
      mockConfigService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const detail = await adminService.getSessionDetail("sess-unscored");
    assert(detail.score === null, "Unscored session MUST return score: null rather than synthetic 0.85 mock score");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runAdminServiceCharacterizationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
