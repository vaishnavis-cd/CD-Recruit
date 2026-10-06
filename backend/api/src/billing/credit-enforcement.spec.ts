import "dotenv/config";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger.service";
import { PoolService } from "./pool.service";
import { CreditEnforcementService } from "./credit-enforcement.service";
import {
  LedgerEntryType,
  SessionKind,
  SessionStatus,
  CvMode,
} from "@prisma/client";
import {
  PoolType,
  PoolStatus,
  GrantSource,
  DrivePoolFallthrough,
  HoldReason,
} from "@cd-recruit/shared-types";
import assert from "assert";

function pass(msg: string) {
  console.log(`\x1b[32m✅ PASS: ${msg}\x1b[0m`);
}

async function runEnforcementTests() {
  console.log("================================================================================");
  console.log("PROCTORA — Phase 3: Credit Enforcement & Capacity Management Test Suite");
  console.log("================================================================================\n");

  const prisma = new PrismaService();
  await prisma.$connect();

  const ledgerService = new LedgerService(prisma);
  const poolService = new PoolService(prisma, ledgerService);
  const enforcementService = new CreditEnforcementService(prisma, ledgerService, poolService);

  const testSuffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`;

  try {
    // ---------------------------------------------------------------------------
    // SETUP: Organization, BillingAccount, Staff, Candidate, RoleTemplate, Drive
    // ---------------------------------------------------------------------------
    console.log("[SETUP] Creating test organization, billing account, and drive...");

    const billingAccount = await prisma.billingAccount.create({
      data: {
        name: `Enforce Corp ${testSuffix}`,
        billingCountry: "IND",
        currency: "INR",
        overdraftLimit: 0,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        name: `Enforce Org ${testSuffix}`,
        slug: `enforce-${testSuffix}`,
        billingAccountId: billingAccount.id,
      },
    });

    const staff = await prisma.staff.create({
      data: {
        organizationId: organization.id,
        email: `recruiter-${testSuffix}@enforce.com`,
        name: "Enforce Recruiter",
        role: "RECRUITER",
      },
    });

    const candidate1 = await prisma.candidate.create({
      data: {
        email: `cand1-${testSuffix}@test.com`,
        name: "Candidate One",
      },
    });

    const candidate2 = await prisma.candidate.create({
      data: {
        email: `cand2-${testSuffix}@test.com`,
        name: "Candidate Two",
      },
    });

    const candidate3 = await prisma.candidate.create({
      data: {
        email: `cand3-${testSuffix}@test.com`,
        name: "Candidate Three",
      },
    });

    const roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: `Phase 3 Engineer ${testSuffix}`,
        durationMinutes: 60,
        weightingPreset: {},
      },
    });

    const driveScheduleEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const drive = await prisma.drive.create({
      data: {
        name: `Phase 3 Campus Drive ${testSuffix}`,
        organizationId: organization.id,
        roleTemplateId: roleTemplate.id,
        createdById: staff.id,
        moduleConfig: {},
        scheduleStart: new Date(),
        scheduleEnd: driveScheduleEnd,
        fallthrough: DrivePoolFallthrough.ALLOW,
        expectedAttendance: 50,
      },
    });

    // ---------------------------------------------------------------------------
    // TEST 1: Live Credit Deduction with Active Drive Pass (Fast/Slow Path)
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 1] Testing live credit acquisition from Drive Pass pool...");

    // Create Drive Pass pool with 2 credits
    const drivePass = await poolService.createPool({
      billingAccountId: billingAccount.id,
      poolType: PoolType.DRIVE_PASS,
      name: `Drive Pass ${testSuffix}`,
      source: GrantSource.TRIAL,
      totalCredits: 2,
      driveId: drive.id,
      actorId: staff.id,
    });

    assert.strictEqual(drivePass.cachedRemaining, 2, "Drive Pass initial balance must be 2");

    // Create Candidate Session 1
    const session1 = await prisma.session.create({
      data: {
        organizationId: organization.id,
        candidateId: candidate1.id,
        roleTemplateId: roleTemplate.id,
        driveId: drive.id,
        kind: SessionKind.LIVE,
        status: SessionStatus.NOT_STARTED,
        cvMode: CvMode.FULL,
      },
    });

    // Execute enforcement credit acquisition
    const result1 = await enforcementService.evaluateAndAcquireCredit(session1.id);
    assert.strictEqual(result1.outcome, "STARTED", "Outcome must be STARTED");
    assert.strictEqual(result1.poolId, drivePass.id, "Must draw from Drive Pass pool");
    assert.strictEqual(result1.balanceRemaining, 1, "Remaining balance must be 1");

    // Verify DB state
    const poolAfter1 = await prisma.creditPool.findUniqueOrThrow({ where: { id: drivePass.id } });
    assert.strictEqual(poolAfter1.cachedRemaining, 1, "cached_remaining must be decremented to 1");

    const ledgerEntry1 = await prisma.creditLedgerEntry.findUniqueOrThrow({
      where: { idempotencyKey: `acquire:${session1.id}` },
    });
    assert.strictEqual(ledgerEntry1.entryType, LedgerEntryType.CONSUME);
    assert.strictEqual(ledgerEntry1.amount, -1);
    assert.strictEqual(ledgerEntry1.shadow, false, "Must be real non-shadow ledger entry");
    pass("Live credit successfully acquired from Drive Pass pool (balance 2 -> 1)");

    // ---------------------------------------------------------------------------
    // TEST 2: Idempotency & Duplicate Prevention
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 2] Testing idempotency — repeated acquisition on same session...");

    const repeatResult = await enforcementService.evaluateAndAcquireCredit(session1.id);
    assert.strictEqual(repeatResult.outcome, "ALREADY_PROCESSED", "Repeated call must return ALREADY_PROCESSED");

    const poolAfterRepeat = await prisma.creditPool.findUniqueOrThrow({ where: { id: drivePass.id } });
    assert.strictEqual(poolAfterRepeat.cachedRemaining, 1, "Balance must remain invariant on retry");
    pass("Idempotency prevents double deduction on repeated calls");

    // ---------------------------------------------------------------------------
    // TEST 3: Fallthrough to Talent Reserve & Sequential Promotion ("Jio Model")
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing fallthrough to Talent Reserve & queued pool auto-promotion...");

    // Create Candidate Session 2 (consumes last credit of Drive Pass)
    const session2 = await prisma.session.create({
      data: {
        organizationId: organization.id,
        candidateId: candidate2.id,
        roleTemplateId: roleTemplate.id,
        driveId: drive.id,
        kind: SessionKind.LIVE,
        status: SessionStatus.NOT_STARTED,
        cvMode: CvMode.FULL,
      },
    });

    const result2 = await enforcementService.evaluateAndAcquireCredit(session2.id);
    assert.strictEqual(result2.outcome, "STARTED");
    assert.strictEqual(result2.balanceRemaining, 0, "Drive Pass now exhausted to 0");

    // Create Queued Talent Reserve pool with 5 credits
    const queuedReserve = await poolService.createPool({
      billingAccountId: billingAccount.id,
      poolType: PoolType.TALENT_RESERVE,
      name: `Talent Reserve Queued ${testSuffix}`,
      source: GrantSource.TRIAL,
      totalCredits: 5,
      validityDays: 90,
      actorId: staff.id,
    });

    // Create Candidate Session 3 (Drive Pass is 0 -> fallthrough promotes queued reserve)
    const session3 = await prisma.session.create({
      data: {
        organizationId: organization.id,
        candidateId: candidate3.id,
        roleTemplateId: roleTemplate.id,
        driveId: drive.id,
        kind: SessionKind.LIVE,
        status: SessionStatus.NOT_STARTED,
        cvMode: CvMode.FULL,
      },
    });

    const result3 = await enforcementService.evaluateAndAcquireCredit(session3.id);
    assert.strictEqual(result3.outcome, "STARTED", "Candidate 3 must be funded via Talent Reserve");
    assert.strictEqual(result3.poolId, queuedReserve.id, "Must draw from promoted Talent Reserve");
    assert.strictEqual(result3.balanceRemaining, 4, "Remaining balance on Talent Reserve must be 4");

    const promotedPool = await prisma.creditPool.findUniqueOrThrow({ where: { id: queuedReserve.id } });
    assert.strictEqual(promotedPool.status, PoolStatus.ACTIVE, "Queued pool must be promoted to ACTIVE");
    assert(promotedPool.clockStartedAt, "Clock must be started upon first draw");
    pass("Drive Pass exhaustion falls through and auto-promotes queued Talent Reserve");

    // ---------------------------------------------------------------------------
    // TEST 4: Capacity Exhaustion & HELD Lifecycle (Section 7.3)
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 4] Testing capacity exhaustion and candidate HELD state...");

    // Create isolated org with 0 credits
    const emptyAccount = await prisma.billingAccount.create({
      data: {
        name: `Zero Balance Corp ${testSuffix}`,
        billingCountry: "IND",
        overdraftLimit: 0,
      },
    });

    const emptyOrg = await prisma.organization.create({
      data: {
        name: `Zero Balance Org ${testSuffix}`,
        slug: `zero-${testSuffix}`,
        billingAccountId: emptyAccount.id,
      },
    });

    const emptyDrive = await prisma.drive.create({
      data: {
        name: `Zero Drive ${testSuffix}`,
        organizationId: emptyOrg.id,
        roleTemplateId: roleTemplate.id,
        createdById: staff.id,
        moduleConfig: {},
        fallthrough: DrivePoolFallthrough.HOLD,
      },
    });

    const heldCandidate = await prisma.candidate.create({
      data: {
        email: `held-${testSuffix}@test.com`,
        name: "Held Candidate",
      },
    });

    const heldSession = await prisma.session.create({
      data: {
        organizationId: emptyOrg.id,
        candidateId: heldCandidate.id,
        roleTemplateId: roleTemplate.id,
        driveId: emptyDrive.id,
        kind: SessionKind.LIVE,
        status: SessionStatus.NOT_STARTED,
        cvMode: CvMode.FULL,
      },
    });

    const heldResult = await enforcementService.evaluateAndAcquireCredit(heldSession.id);
    assert.strictEqual(heldResult.outcome, "HELD", "Outcome must be HELD when capacity is exhausted");
    assert.strictEqual(heldResult.holdReason, HoldReason.CAPACITY);
    assert(heldResult.message?.includes("delay starting your assessment session"), "Friendly hold message returned");

    // Verify session state in DB
    const updatedHeldSession = await prisma.session.findUniqueOrThrow({ where: { id: heldSession.id } });
    assert.strictEqual(updatedHeldSession.status, SessionStatus.NOT_STARTED, "Held session must remain NOT_STARTED");
    assert.strictEqual(updatedHeldSession.holdReason, HoldReason.CAPACITY);
    assert(updatedHeldSession.heldAt, "heldAt timestamp must be set");

    // Verify Audit Event
    const auditEvent = await prisma.billingAuditEvent.findFirst({
      where: {
        billingAccountId: emptyAccount.id,
        action: "SESSION_HELD_CAPACITY",
        subjectId: heldSession.id,
      },
    });
    assert(auditEvent, "SESSION_HELD_CAPACITY audit event must be persisted");
    pass("Capacity exhaustion transitions candidate session to HELD state with audit trail");

    // ---------------------------------------------------------------------------
    // TEST 5: Administrative Capacity Visibility & FIFO Release
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 5] Testing administrative capacity visibility and FIFO release...");

    const capStatusBefore = await enforcementService.getDriveCapacityStatus(emptyDrive.id);
    assert.strictEqual(capStatusBefore.canAcceptCandidates, false);
    assert.strictEqual(capStatusBefore.heldCandidateCount, 1);
    assert.strictEqual(capStatusBefore.statusSummary, "CAPACITY_EXHAUSTED");
    pass("getDriveCapacityStatus reports capacity exhausted and 1 held candidate");

    // Top up the drive with 5 credits
    await poolService.createPool({
      billingAccountId: emptyAccount.id,
      poolType: PoolType.DRIVE_PASS,
      name: `Top-Up Pass ${testSuffix}`,
      source: GrantSource.TRIAL,
      totalCredits: 5,
      driveId: emptyDrive.id,
      actorId: staff.id,
    });

    // Release held candidates
    const releaseResult = await enforcementService.releaseHeldSessions(emptyDrive.id);
    assert.strictEqual(releaseResult.releasedCount, 1, "Must release 1 held candidate");

    const releasedSession = await prisma.session.findUniqueOrThrow({ where: { id: heldSession.id } });
    assert.strictEqual(releasedSession.status, SessionStatus.IN_PROGRESS, "Released session now IN_PROGRESS");
    assert.strictEqual(releasedSession.heldAt, null, "heldAt cleared upon release");

    const capStatusAfter = await enforcementService.getDriveCapacityStatus(emptyDrive.id);
    assert.strictEqual(capStatusAfter.heldCandidateCount, 0, "0 held candidates remaining");
    assert.strictEqual(capStatusAfter.drivePassRemaining, 4, "4 credits remaining on Drive Pass");
    pass("releaseHeldSessions releases held candidates FIFO upon credit top-up");

    // ---------------------------------------------------------------------------
    // TEST 6: Non-LIVE (PREVIEW / SANDBOX) Sessions Waived
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 6] Testing waiver of PREVIEW sessions...");

    const previewSession = await prisma.session.create({
      data: {
        organizationId: emptyOrg.id,
        candidateId: heldCandidate.id,
        roleTemplateId: roleTemplate.id,
        driveId: emptyDrive.id,
        kind: SessionKind.PREVIEW,
        status: SessionStatus.NOT_STARTED,
        cvMode: CvMode.FULL,
      },
    });

    const previewResult = await enforcementService.evaluateAndAcquireCredit(previewSession.id);
    assert.strictEqual(previewResult.outcome, "WAIVED_NON_LIVE");

    const previewLedgerCount = await prisma.creditLedgerEntry.count({
      where: { sessionId: previewSession.id },
    });
    assert.strictEqual(previewLedgerCount, 0, "Zero ledger entries for PREVIEW sessions");
    pass("PREVIEW sessions are 100% free with zero ledger entries");

    // ---------------------------------------------------------------------------
    // TEST 7: Pre-Contracted Overdraft Handling
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing pre-contracted overdraft exception...");

    const overdraftAccount = await prisma.billingAccount.create({
      data: {
        name: `Overdraft Corp ${testSuffix}`,
        billingCountry: "IND",
        overdraftLimit: 2,
        overdraftUsed: 0,
      },
    });

    const overdraftOrg = await prisma.organization.create({
      data: {
        name: `Overdraft Org ${testSuffix}`,
        slug: `overdraft-${testSuffix}`,
        billingAccountId: overdraftAccount.id,
      },
    });

    const overdraftDrive = await prisma.drive.create({
      data: {
        name: `Overdraft Drive ${testSuffix}`,
        organizationId: overdraftOrg.id,
        roleTemplateId: roleTemplate.id,
        createdById: staff.id,
        moduleConfig: {},
        fallthrough: DrivePoolFallthrough.ALLOW,
      },
    });

    const odCandidate = await prisma.candidate.create({
      data: {
        email: `od-${testSuffix}@test.com`,
        name: "OD Candidate",
      },
    });

    const odSession = await prisma.session.create({
      data: {
        organizationId: overdraftOrg.id,
        candidateId: odCandidate.id,
        roleTemplateId: roleTemplate.id,
        driveId: overdraftDrive.id,
        kind: SessionKind.LIVE,
        status: SessionStatus.NOT_STARTED,
        cvMode: CvMode.FULL,
      },
    });

    const odResult = await enforcementService.evaluateAndAcquireCredit(odSession.id);
    assert.strictEqual(odResult.outcome, "STARTED");
    assert.strictEqual(odResult.useOverdraft, true);

    const odAccountAfter = await prisma.billingAccount.findUniqueOrThrow({ where: { id: overdraftAccount.id } });
    assert.strictEqual(odAccountAfter.overdraftUsed, 1, "overdraftUsed incremented from 0 to 1");

    const odLedgerEntry = await prisma.creditLedgerEntry.findUniqueOrThrow({
      where: { idempotencyKey: `acquire:${odSession.id}` },
    });
    assert.strictEqual(odLedgerEntry.entryType, LedgerEntryType.OVERDRAFT);
    assert.strictEqual(odLedgerEntry.amount, -1);
    pass("Pre-contracted enterprise accounts draw against overdraft when pools are empty");

    // ---------------------------------------------------------------------------
    // TEST 8: Trigger Safety Check
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 8] Verifying database enforcement trigger is protecting session state...");

    const triggers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'trg_guard_session_start'`,
    );
    assert.ok(triggers.length >= 1, "trg_guard_session_start trigger must be active protecting invariants");
    pass("Database enforcement trigger trg_guard_session_start confirmed active");

    console.log("\n================================================================================");
    console.log("Phase 3 Credit Enforcement Test Suite: 8/8 Tests PASSED (100%)");
    console.log("================================================================================\n");
  } finally {
    await prisma.$disconnect();
  }
}

runEnforcementTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
