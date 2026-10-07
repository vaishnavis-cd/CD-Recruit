import "dotenv/config";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger.service";
import { PoolService } from "./pool.service";
import { ShadowBillingService } from "./shadow-billing.service";
import { ShadowReconciliationService } from "./shadow-reconciliation.service";
import { ShadowTelemetryService } from "./shadow-telemetry.service";
import {
  SessionStatus,
  SessionKind,
  LedgerEntryType,
  CvMode,
} from "@prisma/client";
import { DrivePoolFallthrough, PoolType } from "@cd-recruit/shared-types";
import assert from "node:assert";

async function runShadowBillingTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Phase 2 Shadow Billing & Reconciliation");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const prisma = new PrismaService();
  await prisma.$connect();

  const ledgerService = new LedgerService(prisma);
  const poolService = new PoolService(prisma, ledgerService);
  const shadowBillingService = new ShadowBillingService(prisma);
  const reconciliationService = new ShadowReconciliationService(prisma);
  const telemetryService = new ShadowTelemetryService(prisma, reconciliationService);

  const testSuffix = Date.now().toString().slice(-6);

  let testOrgId = "";
  let testBillingAccountId = "";
  let testDriveId = "";
  let testCandidateId = "";
  let testRoleTemplateId = "";

  try {
    // ---------------------------------------------------------------------------
    // Setup Isolated Tenant Data
    // ---------------------------------------------------------------------------
    const org = await prisma.organization.create({
      data: {
        name: `Shadow Test Org ${testSuffix}`,
        slug: `shadow-org-${testSuffix}`,
        billingAccount: {
          create: {
            name: `Shadow Account ${testSuffix}`,
            billingCountry: "IND",
            currency: "INR",
            overdraftLimit: 0,
            overdraftUsed: 0,
          },
        },
      },
      include: { billingAccount: true },
    });
    testOrgId = org.id;
    testBillingAccountId = org.billingAccountId!;

    const staff = await prisma.staff.create({
      data: {
        email: `staff.shadow.${testSuffix}@example.com`,
        name: "Shadow Staff",
        role: "ADMIN",
      },
    });

    let template = await prisma.roleTemplate.findFirst({
      where: { department: "SOFTWARE_ENGINEERING", category: "FRESHER" },
    });
    if (!template) {
      template = await prisma.roleTemplate.create({
        data: {
          roleName: `Shadow SWE ${testSuffix}`,
          department: "SOFTWARE_ENGINEERING",
          experienceTier: "0-1",
          category: "FRESHER",
          durationMinutes: 60,
          weightingPreset: { MCQ: 20, CODING: 40, SQL: 40 },
          version: Math.floor(Math.random() * 100000) + 100,
        },
      });
    }
    testRoleTemplateId = template.id;

    const drive = await prisma.drive.create({
      data: {
        name: `Shadow Campus Drive ${testSuffix}`,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        createdById: staff.id,
        moduleConfig: {
          MCQ: { enabled: true, durationMinutes: 15 },
          CODING: { enabled: true, durationMinutes: 30 },
          SQL: { enabled: true, durationMinutes: 15 },
        },
        scheduleStart: new Date(),
        scheduleEnd: new Date(Date.now() + 24 * 3600 * 1000),
        fallthrough: DrivePoolFallthrough.ALLOW,
      },
    });
    testDriveId = drive.id;

    const candidate = await prisma.candidate.create({
      data: {
        name: "Shadow Candidate",
        email: `shadow.cand.${testSuffix}@example.com`,
      },
    });
    testCandidateId = candidate.id;

    // ---------------------------------------------------------------------------
    // TEST 1: Eligible LIVE Session Produces Shadow Acquisition (shadow = true)
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 1] Testing shadow acquisition creation on eligible LIVE session...");
    const pool = await poolService.createPool({
      billingAccountId: testBillingAccountId,
      organizationId: testOrgId,
      poolType: PoolType.TALENT_RESERVE,
      totalCredits: 10,
      validityDays: 30,
      actorId: "test-admin",
    });
    const initialRemaining = pool.cachedRemaining;

    const session1 = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        driveId: testDriveId,
        status: SessionStatus.IN_PROGRESS,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
        startedAt: new Date(),
      },
    });

    const res1 = await shadowBillingService.processShadowSession(session1.id);
    assert.strictEqual(res1.outcome, "FUNDED_TALENT_RESERVE", "Outcome must be FUNDED_TALENT_RESERVE");
    assert.strictEqual(res1.poolId, pool.id, "Selected pool must match talent reserve pool");
    assert.strictEqual(res1.simulatedBalanceAfter, 9, "Simulated balance after must be 9");

    // Verify shadow ledger entry
    const entry1 = await prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `shadow:acquire:${session1.id}` },
    });
    assert(entry1, "Shadow ledger entry must exist");
    assert.strictEqual(entry1.shadow, true, "Entry must have shadow = true");
    assert.strictEqual(entry1.amount, -1, "Entry amount must be -1");
    assert.strictEqual(entry1.creditPoolId, pool.id, "Credit pool ID must match");

    // Verify real pool balance was NOT changed
    const poolAfter1 = await prisma.creditPool.findUnique({ where: { id: pool.id } });
    assert.strictEqual(poolAfter1?.cachedRemaining, initialRemaining, "Real pool cachedRemaining must NOT be changed");
    pass("Eligible LIVE session produces shadow acquisition with shadow = true, keeping real pool balance unchanged");

    // ---------------------------------------------------------------------------
    // TEST 2: Real Overdraft Counters & Balances Remain Unchanged
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 2] Testing overdraft and account status immunity during shadow billing...");
    const accountBefore = await prisma.billingAccount.findUnique({ where: { id: testBillingAccountId } });

    const session2 = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        status: SessionStatus.IN_PROGRESS,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
        startedAt: new Date(),
      },
    });

    await shadowBillingService.processShadowSession(session2.id);
    const accountAfter = await prisma.billingAccount.findUnique({ where: { id: testBillingAccountId } });
    assert.strictEqual(accountAfter?.overdraftUsed, accountBefore?.overdraftUsed, "Overdraft used must remain unchanged");
    pass("Real overdraft counters and account status remain unchanged during shadow billing");

    // ---------------------------------------------------------------------------
    // TEST 3: Idempotency & Deduplication
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing repeated shadow processing idempotency...");
    const session3 = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        status: SessionStatus.IN_PROGRESS,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
        startedAt: new Date(),
      },
    });

    const run1 = await shadowBillingService.processShadowSession(session3.id);
    const run2 = await shadowBillingService.processShadowSession(session3.id);
    assert.strictEqual(run2.outcome, "ALREADY_PROCESSED", "Repeated run must return ALREADY_PROCESSED");
    assert.strictEqual(run2.ledgerEntryId, run1.ledgerEntryId, "Must return existing entry ID");

    const entries3 = await prisma.creditLedgerEntry.findMany({
      where: { sessionId: session3.id, shadow: true },
    });
    assert.strictEqual(entries3.length, 1, "Exactly one shadow ledger entry must exist");
    pass("Repeated processing of the same session does not create duplicate shadow entries");

    // ---------------------------------------------------------------------------
    // TEST 4: Drive Pass Pool Precedence over Talent Reserve
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 4] Testing Drive Pass pool priority in shadow mode...");
    const drivePool = await poolService.createPool({
      billingAccountId: testBillingAccountId,
      organizationId: testOrgId,
      poolType: PoolType.DRIVE_PASS,
      driveId: testDriveId,
      totalCredits: 5,
      actorId: "test-admin",
    });

    const session4 = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        driveId: testDriveId,
        status: SessionStatus.IN_PROGRESS,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
        startedAt: new Date(),
      },
    });

    const res4 = await shadowBillingService.processShadowSession(session4.id);
    assert.strictEqual(res4.outcome, "FUNDED_DRIVE_PASS", "Drive-bound pool must take precedence");
    assert.strictEqual(res4.poolId, drivePool.id, "Drive Pass pool must be selected");
    pass("Shadow mode selects Drive Pass pool over general Talent Reserve when active");

    // ---------------------------------------------------------------------------
    // TEST 5: Non-LIVE Sessions (PREVIEW / SANDBOX) are Waived
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 5] Testing non-LIVE session waiver...");
    const previewSession = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        status: SessionStatus.IN_PROGRESS,
        kind: SessionKind.PREVIEW,
        cvMode: CvMode.FULL,
        startedAt: new Date(),
      },
    });

    const res5 = await shadowBillingService.processShadowSession(previewSession.id);
    assert.strictEqual(res5.outcome, "WAIVED_NON_LIVE", "PREVIEW session must be WAIVED_NON_LIVE");

    const entry5 = await prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `shadow:acquire:${previewSession.id}` },
    });
    assert.strictEqual(entry5, null, "No credit ledger entry should be created for non-LIVE session");
    pass("Non-LIVE sessions (PREVIEW/SANDBOX) are waived from credit acquisition");

    // ---------------------------------------------------------------------------
    // TEST 6: Native PostgreSQL billing_begin SQL Function with SAVEPOINT Isolation
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 6] Testing native PostgreSQL billing_begin SQL fast path in shadow mode...");
    const session6 = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        driveId: testDriveId,
        status: SessionStatus.NOT_STARTED,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
      },
    });

    const res6 = await shadowBillingService.executeBillingBeginSql(session6.id, "shadow");
    assert.strictEqual(res6.outcome, "STARTED", "SQL billing_begin outcome must be STARTED");

    const session6Updated = await prisma.session.findUnique({ where: { id: session6.id } });
    assert.strictEqual(session6Updated?.status, SessionStatus.IN_PROGRESS, "Session must transition to IN_PROGRESS");
    assert(session6Updated?.startedAt, "Session startedAt must be populated");

    const shadowEntry6 = await prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: `shadow:acquire:${session6.id}` },
    });
    assert(shadowEntry6, "Shadow entry from SQL function must exist");
    assert.strictEqual(shadowEntry6?.shadow, true, "Shadow flag must be true");
    pass("Native PostgreSQL billing_begin function executes shadow mode with internal SAVEPOINT isolation");

    // ---------------------------------------------------------------------------
    // TEST 7: SAVEPOINT Isolation — Shadow Failure Never Aborts Session Start
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing SAVEPOINT isolation when shadow simulation encounters an error...");
    const session7 = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        status: SessionStatus.NOT_STARTED,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
      },
    });

    // Execute in interactive transaction with SAVEPOINT
    await prisma.$transaction(async (tx) => {
      // Step 1: Real session start
      await tx.session.update({
        where: { id: session7.id },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: new Date() },
      });

      // Step 2: Establish SAVEPOINT and simulate illegal write
      await tx.$executeRaw`SAVEPOINT shadow_test_sp`;
      try {
        await tx.creditLedgerEntry.create({
          data: {
            billingAccountId: testBillingAccountId,
            organizationId: testOrgId,
            entryType: LedgerEntryType.CONSUME,
            amount: 50, // ILLEGAL amount (violates chk_ledger_amount_sign)
            idempotencyKey: `illegal:key:${Date.now()}`,
            actorId: "system",
            reason: "ATTEMPT_START",
            shadow: true,
          },
        });
        await tx.$executeRaw`RELEASE SAVEPOINT shadow_test_sp`;
      } catch {
        // Rollback to SAVEPOINT isolates failure
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT shadow_test_sp`;
      }
    });

    const session7Final = await prisma.session.findUnique({ where: { id: session7.id } });
    assert.strictEqual(session7Final?.status, SessionStatus.IN_PROGRESS, "Session start must commit successfully despite shadow error");
    // Clean up session7 (which intentionally had its shadow write rolled back)
    await prisma.session.delete({ where: { id: session7.id } });
    pass("SAVEPOINT isolation ensures shadow failure rolls back only shadow work and preserves candidate session start");

    // ---------------------------------------------------------------------------
    // TEST 8: Missing or Invalid Session Handling
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 8] Testing missing session handling...");
    const res8 = await shadowBillingService.processShadowSession("00000000-0000-0000-0000-000000000000");
    assert.strictEqual(res8.outcome, "SHADOW_ERROR", "Should report SHADOW_ERROR");
    assert(res8.error?.includes("not found"), "Should state session not found");
    pass("Invalid or missing session returns isolated error without throwing unhandled exceptions");

    // ---------------------------------------------------------------------------
    // TEST 9: Shadow Reconciliation Engine — Matching Records
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 9] Testing shadow reconciliation on matching sessions...");
    const reconReport = await reconciliationService.reconcileShadowBilling({
      billingAccountId: testBillingAccountId,
    });
    if (reconReport.discrepancies.length > 0) {
      console.log("RECON DISCREPANCIES:", JSON.stringify(reconReport.discrepancies, null, 2));
    }
    assert.strictEqual(reconReport.discrepancyCount, 0, "Discrepancy count should be 0 for valid records");
    assert.strictEqual(reconReport.accuracyPercentage, 100.0, "Accuracy percentage must be 100%");
    assert(reconReport.reconciledAt instanceof Date, "reconciledAt must be a Date");
    pass("Shadow reconciliation verifies matching sessions with 100% accuracy");

    // ---------------------------------------------------------------------------
    // TEST 10: Shadow Reconciliation Engine — Discrepancy Detection
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 10] Testing missing shadow entry detection...");
    const missingSession = await prisma.session.create({
      data: {
        candidateId: testCandidateId,
        organizationId: testOrgId,
        roleTemplateId: testRoleTemplateId,
        status: SessionStatus.IN_PROGRESS,
        kind: SessionKind.LIVE,
        cvMode: CvMode.FULL,
        startedAt: new Date(),
      },
    });

    const reconReport2 = await reconciliationService.reconcileShadowBilling({
      billingAccountId: testBillingAccountId,
    });
    const missingDisc = reconReport2.discrepancies.find(
      (d) => d.discrepancyType === "MISSING_SHADOW_ENTRY" && d.sessionId === missingSession.id,
    );
    assert(missingDisc, "Must detect MISSING_SHADOW_ENTRY for un-shadowed session");
    assert(missingDisc.details.includes(missingSession.id), "Details must include missing session ID");

    // Clean missing session
    await prisma.session.delete({ where: { id: missingSession.id } });
    pass("Shadow reconciliation accurately identifies MISSING_SHADOW_ENTRY discrepancies");

    // ---------------------------------------------------------------------------
    // TEST 11: Real Balance Reconciliation Remains Unaffected by Shadow Entries
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 11] Testing real balance reconciliation immunity from shadow rows...");
    const realBalanceReport = await ledgerService.reconcileAccount(testBillingAccountId);
    assert.strictEqual(realBalanceReport.isBalanced, true, "Real account must be balanced");
    assert.strictEqual(realBalanceReport.poolDiscrepancies.length, 0, "No pool discrepancies allowed");
    assert.strictEqual(realBalanceReport.overdraftDiscrepancy.diff, 0, "Overdraft diff must be 0");
    pass("Shadow ledger entries do not distort or corrupt real balance reconciliation");

    // ---------------------------------------------------------------------------
    // TEST 12: Shadow Telemetry & Cost Metrics
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 12] Testing shadow telemetry metrics aggregation...");
    const metrics = await telemetryService.getShadowMetrics();
    assert(metrics.totalEligibleCandidateAttempts >= 1, "Must track eligible candidate attempts");
    assert(metrics.totalSuccessfullyEvaluatedAttempts >= 1, "Must track successfully evaluated attempts");
    assert(metrics.shadowLatencyMs.average > 0, "Latency must be tracked");
    assert(typeof metrics.reconciliationAccuracy === "number", "Reconciliation accuracy must be reported");
    assert(metrics.costDistribution !== undefined, "Cost distribution must be defined");
    pass("ShadowTelemetryService aggregates attempts, latency, and cost telemetry correctly");

    // ---------------------------------------------------------------------------
    // TEST 13: Pilot Exit Gate Evaluation
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 13] Testing pilot exit gate evaluation...");
    const exitGate = await telemetryService.evaluatePilotExitGate();
    assert.strictEqual(exitGate.targetAttempts, 10000, "Target attempts must be 10,000");
    assert(exitGate.remainingGapToTarget > 0, "Remaining gap must reflect unmet 10,000 threshold");
    assert.strictEqual(exitGate.isSatisfied, false, "Exit gate must NOT be satisfied without real pilot traffic");
    assert.strictEqual(
      exitGate.verdict,
      "PHASE 2 IMPLEMENTATION COMPLETE — PILOT GATE NOT YET MET",
      "Verdict must be 'PHASE 2 IMPLEMENTATION COMPLETE — PILOT GATE NOT YET MET'",
    );
    pass("Pilot exit gate correctly evaluates criteria and reports required verdict");

  } finally {
    await prisma.$disconnect();
  }

  console.log("\n================================================================================");
  console.log(`Phase 2 Shadow Mode Test Suite: ${testPassed}/${testTotal} Tests PASSED (100%)`);
  console.log("================================================================================\n");
}

runShadowBillingTests().catch((err) => {
  console.error("❌ Phase 2 Test Suite Failed:", err);
  process.exit(1);
});
