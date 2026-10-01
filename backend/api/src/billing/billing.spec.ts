import "dotenv/config";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger.service";
import { PoolService } from "./pool.service";
import { MakerCheckerService } from "./maker-checker.service";
import {
  PoolType,
  PoolStatus,
  GrantSource,
  LedgerEntryType,
  LedgerReason,
  ManualRequestKind,
  ManualRequestStatus,
} from "@cd-recruit/shared-types";
import { ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import assert from "node:assert";

async function runBillingTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Phase 1 Billing Infrastructure");
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
  const makerCheckerService = new MakerCheckerService(prisma, ledgerService);

  const testSuffix = Date.now().toString().slice(-6);

  try {
    // ---------------------------------------------------------------------------
    // TEST 1: Organization-to-BillingAccount Relationship & Backfill Integrity
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 1] Testing Organization-to-BillingAccount integrity...");

    // Create a BillingAccount first
    const billingAccount = await prisma.billingAccount.create({
      data: {
        name: `Acme Corp ${testSuffix}`,
        legalEntityName: `Acme Corporation Pvt Ltd ${testSuffix}`,
        billingCountry: "IND",
        currency: "INR",
        taxId: `29ABCDE1234F${testSuffix.slice(0, 4)}`,
        status: "ACTIVE",
        overdraftLimit: 0,
      },
    });
    assert(billingAccount.id, "BillingAccount must be created with UUID");
    assert.strictEqual(billingAccount.overdraftLimit, 0, "Default overdraftLimit must be 0");
    assert.strictEqual(billingAccount.overdraftUsed, 0, "Default overdraftUsed must be 0");
    pass("BillingAccount created with strict pre-paid defaults (overdraftLimit = 0)");

    // Create Organization linked to BillingAccount
    const organization = await prisma.organization.create({
      data: {
        name: `Acme Org ${testSuffix}`,
        slug: `acme-org-${testSuffix}`,
        billingAccountId: billingAccount.id,
      },
    });
    assert.strictEqual(organization.billingAccountId, billingAccount.id);
    pass("Organization links to BillingAccount via non-nullable foreign key");

    // ---------------------------------------------------------------------------
    // TEST 2: CreditPool Lifecycle & Drive Pass 7-Day Makeup Window
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 2] Testing CreditPool creation & 7-day makeup window...");

    // Create Staff & RoleTemplate & Drive for test
    const staff = await prisma.staff.create({
      data: {
        email: `recruiter-${testSuffix}@example.com`,
        name: `Recruiter ${testSuffix}`,
        role: "BILLING_ADMIN",
      },
    });

    const roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: `Backend Dev ${testSuffix}`,
        durationMinutes: 60,
        weightingPreset: {},
      },
    });

    const driveScheduleEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    const drive = await prisma.drive.create({
      data: {
        name: `Campus Drive ${testSuffix}`,
        organizationId: organization.id,
        roleTemplateId: roleTemplate.id,
        createdById: staff.id,
        moduleConfig: {},
        scheduleStart: new Date(),
        scheduleEnd: driveScheduleEnd,
        fallthrough: "ALLOW",
        expectedAttendance: 100,
      },
    });

    // Create PriceBookEntry & Payment for PURCHASE grant
    const priceBook = await prisma.priceBookEntry.create({
      data: {
        sku: `SKU-CAMPUS-${testSuffix}`,
        poolType: PoolType.DRIVE_PASS,
        credits: 100,
        billingCountry: "IND",
        currency: "INR",
        unitPriceMinor: 6000,
        version: 1,
        effectiveFrom: new Date(),
      },
    });

    const payment = await prisma.payment.create({
      data: {
        billingAccountId: billingAccount.id,
        provider: "STRIPE",
        providerPaymentId: `pi_${testSuffix}`,
        status: "CAPTURED",
        priceBookEntryId: priceBook.id,
        quantityCredits: 100,
        unitPriceMinor: 6000,
        amountMinor: 600000,
        currency: "INR",
        capturedAt: new Date(),
      },
    });

    // Create Drive Pass pool
    const drivePass = await poolService.createPool({
      billingAccountId: billingAccount.id,
      poolType: PoolType.DRIVE_PASS,
      name: `Drive Pass ${testSuffix}`,
      source: GrantSource.PURCHASE,
      totalCredits: 100,
      driveId: drive.id,
      paymentId: payment.id,
      actorId: staff.id,
    });

    assert.strictEqual(drivePass.poolType, PoolType.DRIVE_PASS);
    assert.strictEqual(drivePass.totalCredits, 100);
    assert.strictEqual(drivePass.cachedRemaining, 100);
    assert.strictEqual(drivePass.status, PoolStatus.ACTIVE);

    // Verify 7-day makeup window
    const expectedExpiry = new Date(driveScheduleEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
    assert(drivePass.expiresAt, "Drive Pass must have expiresAt");
    const diffMs = Math.abs(drivePass.expiresAt.getTime() - expectedExpiry.getTime());
    assert(diffMs < 1000, "Drive Pass expiresAt must be scheduleEnd + 7 days");
    pass("Drive Pass created with exact 7-day makeup window post scheduleEnd");

    const inMakeupWindow = await poolService.isWithinMakeupWindow(drive.id);
    assert.strictEqual(inMakeupWindow, true, "Should be within makeup window during/after drive");
    pass("isWithinMakeupWindow correctly evaluates drive lifecycle");

    // ---------------------------------------------------------------------------
    // TEST 3: Sequential Activation Engine ("The Jio Model")
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing sequential activation engine (Jio Model)...");

    // First general pool (Talent Reserve #1)
    const reserve1 = await poolService.createPool({
      billingAccountId: billingAccount.id,
      poolType: PoolType.TALENT_RESERVE,
      name: `Talent Reserve 1 ${testSuffix}`,
      source: GrantSource.TRIAL,
      totalCredits: 50,
      validityDays: 90,
      actorId: staff.id,
    });
    assert.strictEqual(reserve1.status, PoolStatus.ACTIVE, "First general pool must be ACTIVE");
    assert.strictEqual(reserve1.queueOrder, 1, "First general pool queueOrder must be 1");
    pass("First Talent Reserve pool activates immediately with queueOrder 1");

    // Second general pool (Talent Reserve #2)
    const reserve2 = await poolService.createPool({
      billingAccountId: billingAccount.id,
      poolType: PoolType.TALENT_RESERVE,
      name: `Talent Reserve 2 ${testSuffix}`,
      source: GrantSource.TRIAL,
      totalCredits: 100,
      validityDays: 180,
      actorId: staff.id,
    });
    assert.strictEqual(reserve2.status, PoolStatus.QUEUED, "Subsequent general pool must be QUEUED");
    assert.strictEqual(reserve2.queueOrder, 2, "Second general pool queueOrder must be 2");
    pass("Second Talent Reserve pool queues sequentially behind active pack (queueOrder 2)");

    // ---------------------------------------------------------------------------
    // TEST 4: Ledger Idempotency, Whole-Number Enforcement & Balance Sync
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 4] Testing ledger accounting invariants (R1, R2, R4, R5)...");

    // R1: Whole-number credit check
    let threwNonInteger = false;
    try {
      await ledgerService.grantCredits({
        billingAccountId: billingAccount.id,
        organizationId: organization.id,
        creditPoolId: reserve1.id,
        amount: 10.5, // Invalid fraction
        grantSource: GrantSource.PROMO,
        reason: LedgerReason.PROMO,
        idempotencyKey: `non-int-${testSuffix}`,
        actorId: staff.id,
        requestId: "req-fake",
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes("whole integers")) {
        threwNonInteger = true;
      }
    }
    assert.strictEqual(threwNonInteger, true, "Fractional credits must be strictly rejected");
    pass("Whole-number credit enforcement rejects fractional credit values (Rule R1)");

    // Acquire session credit (CONSUME)
    const testSessionId = `test-sess-${testSuffix}`;
    const consumeEntry1 = await ledgerService.acquireSessionCredit({
      billingAccountId: billingAccount.id,
      organizationId: organization.id,
      creditPoolId: reserve1.id,
      sessionId: testSessionId,
      driveId: drive.id,
      actorId: staff.id,
    });
    assert.strictEqual(consumeEntry1.entryType, LedgerEntryType.CONSUME);
    assert.strictEqual(consumeEntry1.amount, -1);
    assert.strictEqual(consumeEntry1.balanceAfter, 49);
    pass("Session acquisition decrements pool cachedRemaining and logs CONSUME entry");

    // Idempotent re-acquisition
    const consumeEntryDuplicate = await ledgerService.acquireSessionCredit({
      billingAccountId: billingAccount.id,
      organizationId: organization.id,
      creditPoolId: reserve1.id,
      sessionId: testSessionId,
      driveId: drive.id,
      actorId: staff.id,
    });
    assert.strictEqual(consumeEntryDuplicate.id, consumeEntry1.id, "Duplicate acquisition must return existing record");
    const poolAfterDup = await prisma.creditPool.findUnique({ where: { id: reserve1.id } });
    assert.strictEqual(poolAfterDup?.cachedRemaining, 49, "Duplicate acquisition must not double-decrement");
    pass("Idempotency key prevents double-decrement on duplicate start attempts");

    // Reversal (+1)
    const reversalEntry = await ledgerService.reverseSessionCredit({
      originalAcquisitionId: consumeEntry1.id,
      reason: LedgerReason.PLATFORM_FAULT,
      reasonNote: "Sandbox container restart timeout",
      actorId: "system",
    });
    assert.strictEqual(reversalEntry.entryType, LedgerEntryType.REVERSAL);
    assert.strictEqual(reversalEntry.amount, 1);
    assert.strictEqual(reversalEntry.balanceAfter, 50);
    pass("Reversal returns credit to pool and logs linked REVERSAL entry");

    // Second reversal on same acquisition must be blocked by partial index or service check
    const secondReversal = await ledgerService.reverseSessionCredit({
      originalAcquisitionId: consumeEntry1.id,
      reason: LedgerReason.PLATFORM_FAULT,
      actorId: "system",
    });
    assert.strictEqual(secondReversal.id, reversalEntry.id, "Second reversal must return existing reversal record");
    pass("Single reversal constraint prevents duplicate credit restoration");

    // Courtesy waiver (amount = 0)
    const waiveSessionId = `test-waive-${testSuffix}`;
    const waiveEntry = await ledgerService.waiveSessionCredit({
      billingAccountId: billingAccount.id,
      organizationId: organization.id,
      sessionId: waiveSessionId,
      driveId: drive.id,
      reason: LedgerReason.HARDWARE_CAMERA_FAILURE,
      reasonNote: "Camera disconnected mid-assessment",
      actorId: staff.id,
    });
    assert.strictEqual(waiveEntry.entryType, LedgerEntryType.WAIVE);
    assert.strictEqual(waiveEntry.amount, 0);
    pass("Courtesy waiver logged with amount = 0 without mutating pool balance");

    // ---------------------------------------------------------------------------
    // TEST 5: Append-Only Trigger & CreditPool Immutability
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 5] Testing PostgreSQL triggers for append-only immutability...");

    // Try to UPDATE credit_ledger_entry
    let threwUpdateLedger = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE credit_ledger_entry SET amount = -99 WHERE id = '${consumeEntry1.id}'`,
      );
    } catch (err: any) {
      if (err.message.includes("strictly forbidden") || err.message.includes("append-only")) {
        threwUpdateLedger = true;
      }
    }
    assert.strictEqual(threwUpdateLedger, true, "UPDATE on credit_ledger_entry must be blocked by trigger");
    pass("trg_ledger_append_only blocks UPDATE mutations on credit_ledger_entry");

    // Try to DELETE credit_ledger_entry
    let threwDeleteLedger = false;
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM credit_ledger_entry WHERE id = '${consumeEntry1.id}'`,
      );
    } catch (err: any) {
      if (err.message.includes("strictly forbidden") || err.message.includes("append-only")) {
        threwDeleteLedger = true;
      }
    }
    assert.strictEqual(threwDeleteLedger, true, "DELETE on credit_ledger_entry must be blocked by trigger");
    pass("trg_ledger_append_only blocks DELETE mutations on credit_ledger_entry");

    // Try to modify total_credits on credit_pool
    let threwPoolMutation = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE credit_pool SET total_credits = 9999 WHERE id = '${reserve1.id}'`,
      );
    } catch (err: any) {
      if (err.message.includes("immutable")) {
        threwPoolMutation = true;
      }
    }
    assert.strictEqual(threwPoolMutation, true, "Mutating total_credits on credit_pool must be blocked by trigger");
    pass("trg_guard_credit_pool blocks mutations to core commercial pool columns");

    // ---------------------------------------------------------------------------
    // TEST 6: Maker-Checker Dual Authorization & Self-Approval Prevention
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 6] Testing Maker-Checker dual authorization (Rule R8)...");

    const checker = await prisma.staff.create({
      data: {
        email: `checker-${testSuffix}@example.com`,
        name: `Checker ${testSuffix}`,
        role: "ADMIN",
      },
    });

    // Maker creates request
    const request = await makerCheckerService.createRequest({
      billingAccountId: billingAccount.id,
      kind: ManualRequestKind.GRANT,
      payload: {
        creditPoolId: reserve1.id,
        amount: 25,
        grantSource: GrantSource.GOODWILL,
        reason: LedgerReason.GOODWILL,
      },
      reason: "Client goodwill compensation for outage",
      ticketRef: `TICKET-${testSuffix}`,
      requestedById: staff.id, // Maker
    });
    assert.strictEqual(request.status, ManualRequestStatus.PENDING);
    pass("Maker successfully creates manual billing request in PENDING status");

    // Maker tries to self-approve -> MUST FAIL
    let threwSelfApproval = false;
    try {
      await makerCheckerService.approveAndExecute(request.id, staff.id); // Same person!
    } catch (err: any) {
      if (err instanceof ForbiddenException && err.message.includes("Rule R8")) {
        threwSelfApproval = true;
      }
    }
    assert.strictEqual(threwSelfApproval, true, "Self-approval must throw ForbiddenException");
    pass("Dual-authorization strictly rejects self-approval (requestedById === approvedById)");

    // Checker approves -> MUST SUCCEED
    const executed = await makerCheckerService.approveAndExecute(request.id, checker.id);
    assert.strictEqual(executed.status, ManualRequestStatus.EXECUTED);
    assert.strictEqual(executed.approvedById, checker.id);

    const poolAfterGrant = await prisma.creditPool.findUnique({ where: { id: reserve1.id } });
    assert.strictEqual(poolAfterGrant?.cachedRemaining, 75, "Pool balance must increment by 25");
    pass("Approved request executes transactionally, mints credits, and updates request to EXECUTED");

    // Verify audit event written
    const auditEvents = await prisma.billingAuditEvent.findMany({
      where: { requestId: request.id },
    });
    assert(auditEvents.length >= 2, "Must record creation and execution audit events");
    pass("Immutable BillingAuditEvent entries written for request creation and execution");

    // ---------------------------------------------------------------------------
    // TEST 7: Account Balance Query & Automated 7-Point Reconciliation
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing account balance query and ledger reconciliation...");

    const balanceSummary = await ledgerService.getAccountBalance(billingAccount.id);
    assert(balanceSummary.totalAvailableCredits > 0);
    assert.strictEqual(balanceSummary.overdraftUsed, 0);
    pass("getAccountBalance returns aggregated active and queued credit pools");

    const report = await ledgerService.reconcileAccount(billingAccount.id);
    assert.strictEqual(report.isBalanced, true, "Ledger replay must match pool cachedRemaining exactly");
    assert.strictEqual(report.poolDiscrepancies.length, 0);
    assert.strictEqual(report.overdraftDiscrepancy.diff, 0);
    pass("reconcileAccount replays raw ledger rows and verifies 100% mathematical consistency");

    // ---------------------------------------------------------------------------
    // TEST 8: Absence of Phase 3 guard_session_start Trigger
    // ---------------------------------------------------------------------------
    console.log("\n[TEST 8] Verifying Phase 3 guard_session_start trigger is NOT active...");

    const triggerCheck = await prisma.$queryRawUnsafe<any[]>(
      `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'trg_guard_session_start'`,
    );
    assert.strictEqual(triggerCheck.length, 0, "trg_guard_session_start must NOT exist in Phase 1");
    pass("Confirmation verified: trg_guard_session_start trigger is not enabled in Phase 1");

    console.log("\n================================================================================");
    console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
    console.log("================================================================================");
  } finally {
    await prisma.$disconnect();
  }
}

runBillingTests().catch((err) => {
  console.error("❌ Billing tests failed:", err);
  process.exit(1);
});
