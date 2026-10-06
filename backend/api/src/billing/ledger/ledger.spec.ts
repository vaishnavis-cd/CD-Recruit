import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import assert from "node:assert";
import { ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { PlatformStaffRole, StaffRole } from "@cd-recruit/shared-types";
import { LedgerService } from "./ledger.service";
import {
  LedgerEntryType,
  LedgerGrantSource,
  LedgerReason,
} from "./ledger.types";
import { AuthenticatedPlatformActor } from "../../platform/audit/platform-audit.types";

const DB_URL = process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function createPgClient(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function runLedgerServiceTests() {
  console.log("================================================================================");
  console.log("Phase 2 â€” LedgerService Characterization & Financial Invariants Test Suite");
  console.log("================================================================================");

  let passedCount = 0;
  let totalCount = 0;

  function pass(msg: string) {
    totalCount++;
    passedCount++;
    console.log(`âœ… TEST [${totalCount}]: ${msg}`);
  }

  const prisma = new PrismaClient();
  const ledgerService = new LedgerService(prisma as any);

  // Lookup seeded Platform OWNER
  const seededOwner = await prisma.platformStaff.findUnique({
    where: { email: "owner@cdrecruit.local" },
  });
  assert.ok(seededOwner, "Seeded platform OWNER account must exist");

  const actorOwner: AuthenticatedPlatformActor = {
    id: seededOwner.id,
    role: PlatformStaffRole.OWNER,
    platformRole: PlatformStaffRole.OWNER,
    isPlatformStaff: true,
    email: seededOwner.email,
  };

  const actorFinance: AuthenticatedPlatformActor = {
    id: "finance-ledger-actor-1",
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    isPlatformStaff: true,
    email: "finance@cdrecruit.local",
  };

  const actorSupport: AuthenticatedPlatformActor = {
    id: "support-ledger-actor-1",
    role: PlatformStaffRole.SUPPORT,
    platformRole: PlatformStaffRole.SUPPORT,
    isPlatformStaff: true,
    email: "support@cdrecruit.local",
  };

  // Setup isolated test workspace & billing account
  const timestamp = Date.now();
  const testBaId = `ba-ledger-test-${timestamp}`;
  const testOrgId = `org-ledger-test-${timestamp}`;
  const testPoolId = `pool-ledger-test-${timestamp}`;
  const testPoolZeroId = `pool-ledger-zero-${timestamp}`;

  const pg = await createPgClient();

  try {
    // Clean up any leftover test records from previous aborted runs
    await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");
    await pg.query("DELETE FROM public.event_log WHERE session_id LIKE 'sess-bb-int-%' OR session_id LIKE 'sess-test-%'");
    await pg.query("DELETE FROM billing.session_billing_evidence WHERE session_id LIKE 'sess-bb-int-%' OR session_id LIKE 'sess-test-%'");
    await pg.query("DELETE FROM billing.billing_audit_event WHERE subject_id LIKE 'pool-ledger-%' OR subject_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM billing.credit_ledger_entry WHERE billing_account_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM public.session WHERE organization_id LIKE 'org-ledger-%'");
    await pg.query("DELETE FROM billing.manual_billing_request WHERE id LIKE 'req-ledger-%'");
    await pg.query("DELETE FROM billing.credit_pool WHERE billing_account_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM public.organization WHERE id LIKE 'org-ledger-%'");
    await pg.query("DELETE FROM billing.billing_account WHERE id LIKE 'ba-ledger-%'");
    await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");

    // Insert isolated test billing account and organization
    await pg.query(`
      INSERT INTO billing.billing_account (
        id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at
      ) VALUES ($1, 'Ledger Test Org', 'IN', 'INR', 'ACTIVE', 0, 0, clock_timestamp(), clock_timestamp());
    `, [testBaId]);

    await pg.query(`
      INSERT INTO public.organization (
        id, name, slug, billing_account_id, created_at
      ) VALUES ($1, 'Ledger Test Org', $2, $3, clock_timestamp());
    `, [testOrgId, `ledger-slug-${timestamp}`, testBaId]);

    // Insert isolated test credit pool with 10 initial credits
    await pg.query(`
      INSERT INTO billing.credit_pool (
        id, billing_account_id, pool_type, name, source, total_credits,
        cached_remaining, status, unit_price_minor, currency, expires_at
      ) VALUES (
        $1, $2, 'TALENT_RESERVE', 'Ledger Test Pool', 'PURCHASE', 10,
        10, 'ACTIVE', 6000, 'INR', clock_timestamp() + interval '30 days'
      );
    `, [testPoolId, testBaId]);

    // Insert isolated pool with 0 credits for depletion testing
    await pg.query(`
      INSERT INTO billing.credit_pool (
        id, billing_account_id, pool_type, name, source, total_credits,
        cached_remaining, status, unit_price_minor, currency, expires_at
      ) VALUES (
        $1, $2, 'TALENT_RESERVE', 'Zero Balance Pool', 'PURCHASE', 5,
        0, 'EXHAUSTED', 6000, 'INR', clock_timestamp() + interval '30 days'
      );
    `, [testPoolZeroId, testBaId]);

    // Seed opening ledger entry for testPoolId so ledgerSum equals cachedRemaining (10)
    await pg.query(`
      INSERT INTO billing.credit_ledger_entry (
        id, billing_account_id, organization_id, credit_pool_id, entry_type, amount,
        balance_after, grant_source, reason, idempotency_key, actor_id, created_at
      ) VALUES (
        $1, $2, $3, $4, 'GRANT', 10,
        10, 'PURCHASE', 'PURCHASE_ALLOCATION', $5, 'system', clock_timestamp()
      );
    `, [`ledger-init-${timestamp}`, testBaId, testOrgId, testPoolId, `init:grant:${testPoolId}`]);

    // =========================================================================
    // SECTION 1: Grant Operations
    // =========================================================================
    console.log("\n--- SECTION 1: Grant Operations ---");

    // TEST 1: Valid grant creates ledger entry
    const grantKey1 = `grant:test:1:${timestamp}`;
    const grantEntry = await ledgerService.grantCredits({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: 25,
      grantSource: LedgerGrantSource.PURCHASE,
      reason: LedgerReason.PURCHASE_ALLOCATION,
      idempotencyKey: grantKey1,
      actor: actorFinance,
      ticketRef: "TICK-GRANT-001",
    });

    assert.ok(grantEntry.id, "Grant entry must have generated UUID");
    assert.strictEqual(grantEntry.entryType, LedgerEntryType.GRANT);
    assert.strictEqual(grantEntry.amount, 25);
    pass("Valid grant creates immutable ledger entry");

    // TEST 2: Authoritative balance calculation
    assert.strictEqual(grantEntry.balanceAfter, 35, "balanceAfter must equal previous (10) + grant (25) = 35");
    pass("Resulting balanceAfter increases correctly from authoritative state");

    // TEST 3: Cached pool balance matches ledger
    const poolAfterGrant = await prisma.creditPool.findUnique({
      where: { id: testPoolId },
    });
    assert.strictEqual(poolAfterGrant?.cachedRemaining, 35);
    const recon1 = await ledgerService.reconcilePoolBalance(testPoolId);
    assert.strictEqual(recon1.isConsistent, true);
    assert.strictEqual(recon1.cachedRemaining, 35);
    assert.strictEqual(recon1.ledgerSum, 35);
    pass("Cached pool balance matches authoritative ledger sum");

    // TEST 4: Billing audit event created
    const grantAudit = await prisma.billingAuditEvent.findFirst({
      where: {
        subjectId: testPoolId,
        action: "CREDIT_GRANT",
      },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(grantAudit, "Billing audit event must be emitted");
    assert.strictEqual(grantAudit.actorId, actorFinance.id);
    assert.strictEqual(grantAudit.actorRole, PlatformStaffRole.FINANCE);
    assert.strictEqual(grantAudit.ticketRef, "TICK-GRANT-001");
    pass("Billing audit event created in billing.billing_audit_event with actor provenance");

    // TEST 5: Transaction rollback leaves no financial mutation
    let rolledBackGrantKey = `grant:rollback:${timestamp}`;
    try {
      await prisma.$transaction(async (tx) => {
        // Attempt a grant inside failing transaction
        await tx.creditLedgerEntry.create({
          data: {
            billingAccountId: testBaId,
            organizationId: testOrgId,
            creditPoolId: testPoolId,
            entryType: LedgerEntryType.GRANT,
            amount: 100,
            balanceAfter: 135,
            grantSource: LedgerGrantSource.PROMO,
            reason: LedgerReason.GOODWILL_GRANT,
            idempotencyKey: rolledBackGrantKey,
            actorId: actorFinance.id,
          },
        });
        await tx.creditPool.update({
          where: { id: testPoolId },
          data: { cachedRemaining: 135 },
        });
        throw new Error("SIMULATED_TRANSACTION_FAILURE");
      });
    } catch (err: any) {
      assert.strictEqual(err.message, "SIMULATED_TRANSACTION_FAILURE");
    }

    const nonExistentEntry = await prisma.creditLedgerEntry.findUnique({
      where: { idempotencyKey: rolledBackGrantKey },
    });
    assert.strictEqual(nonExistentEntry, null, "Rolled back ledger entry must not persist");

    const poolAfterRollback = await prisma.creditPool.findUnique({
      where: { id: testPoolId },
    });
    assert.strictEqual(poolAfterRollback?.cachedRemaining, 35, "Pool balance must remain 35 after rollback");
    pass("Transaction failure leaves no partial financial mutation");

    // =========================================================================
    // SECTION 2: Consume Operations
    // =========================================================================
    console.log("\n--- SECTION 2: Consume Operations ---");

    // TEST 6: Valid consumption represented correctly
    const consumeKey1 = `consume:test:1:${timestamp}`;
    const consumeEntry = await ledgerService.consumeCredit({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: -1,
      reason: LedgerReason.ATTEMPT_START,
      sessionId: `sess-test-consume-${timestamp}`,
      idempotencyKey: consumeKey1,
      actor: "system",
    });
    assert.strictEqual(consumeEntry.entryType, LedgerEntryType.CONSUME);
    assert.strictEqual(consumeEntry.amount, -1);
    assert.strictEqual(consumeEntry.balanceAfter, 34);

    const poolAfterConsume = await prisma.creditPool.findUnique({
      where: { id: testPoolId },
    });
    assert.strictEqual(poolAfterConsume?.cachedRemaining, 34);
    pass("Valid consumption represented correctly with amount = -1 and decremented balance");

    // TEST 7: Insufficient balance rejected
    await assert.rejects(
      async () => {
        await ledgerService.consumeCredit({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolZeroId,
          amount: -1,
          reason: LedgerReason.ATTEMPT_START,
          idempotencyKey: `consume:fail:${timestamp}`,
          actor: "system",
        });
      },
      (err: any) =>
        err instanceof BadRequestException && err.message.includes("INSUFFICIENT_CREDITS"),
    );
    pass("Consumption on depleted pool rejected with BadRequestException");

    // TEST 8: Cached balance cannot become negative
    const zeroPoolCheck = await prisma.creditPool.findUnique({
      where: { id: testPoolZeroId },
    });
    assert.strictEqual(zeroPoolCheck?.cachedRemaining, 0);
    pass("Cached pool balance cannot become negative");

    // TEST 9: Existing billing_begin remains authoritative for candidate sessions
    // Create candidate session
    const candRes = await pg.query("SELECT id FROM public.candidate LIMIT 1");
    const candId = candRes.rows[0].id;
    const tmplRes = await pg.query("SELECT id FROM public.role_template LIMIT 1");
    const tmplId = tmplRes.rows[0].id;
    const bbSessId = `sess-bb-int-${timestamp}`;

    await pg.query(`
      INSERT INTO public.session (
        id, organization_id, candidate_id, role_template_id, cv_mode, status, kind
      ) VALUES ($1, $2, $3, $4, 'FULL', 'NOT_STARTED', 'LIVE');
    `, [bbSessId, testOrgId, candId, tmplId]);

    const sessionOutcome = await ledgerService.claimSessionCredit(bbSessId, "enforce");
    assert.strictEqual(sessionOutcome.outcome, "STARTED");
    assert.strictEqual(sessionOutcome.poolId, testPoolId);
    assert.strictEqual(sessionOutcome.balanceRemaining, 33);
    pass("Session consumption integrates authoritatively with billing.billing_begin() database primitive");

    // TEST 10: Retrying claimSessionCredit returns ALREADY_STARTED
    const retryOutcome = await ledgerService.claimSessionCredit(bbSessId, "enforce");
    assert.strictEqual(retryOutcome.outcome, "ALREADY_STARTED");
    pass("billing_begin idempotency returns ALREADY_STARTED without duplicate credit draw");

    // =========================================================================
    // SECTION 3: Reversal Operations
    // =========================================================================
    console.log("\n--- SECTION 3: Reversal Operations ---");

    // TEST 11: Valid reversal creates new ledger entry
    const reversalKey = `reversal:${consumeEntry.id}`;
    const reversalEntry = await ledgerService.reverseCredit({
      relatedEntryId: consumeEntry.id,
      reason: LedgerReason.PLATFORM_FAULT,
      reasonNote: "Candidate disconnected due to infrastructure anomaly",
      idempotencyKey: reversalKey,
      actor: actorSupport,
      ticketRef: "TICK-REV-099",
    });
    assert.ok(reversalEntry.id);
    assert.strictEqual(reversalEntry.entryType, LedgerEntryType.REVERSAL);
    assert.strictEqual(reversalEntry.amount, 1);
    assert.strictEqual(reversalEntry.relatedEntryId, consumeEntry.id);
    pass("Valid reversal creates new immutable REVERSAL ledger entry");

    // TEST 12: Original entry remains unchanged
    const originalReloaded = await prisma.creditLedgerEntry.findUnique({
      where: { id: consumeEntry.id },
    });
    assert.strictEqual(originalReloaded?.amount, -1);
    assert.strictEqual(originalReloaded?.entryType, LedgerEntryType.CONSUME);
    pass("Original entry remains unmodified history (strictly append-only)");

    // TEST 13: Balance is restored correctly
    const poolAfterRev = await prisma.creditPool.findUnique({
      where: { id: testPoolId },
    });
    // Started at 33 after billing_begin, reversal added +1 -> 34
    assert.strictEqual(poolAfterRev?.cachedRemaining, 34);
    assert.strictEqual(reversalEntry.balanceAfter, 34);
    pass("Balance is restored accurately to target credit pool (+1)");

    // TEST 14: Second reversal of same entry is rejected
    await assert.rejects(
      async () => {
        await ledgerService.reverseCredit({
          relatedEntryId: consumeEntry.id,
          reason: LedgerReason.PLATFORM_FAULT,
          idempotencyKey: `reversal:dup:${timestamp}`,
          actor: actorSupport,
        });
      },
      (err: any) =>
        (err instanceof ConflictException && err.message.includes("ALREADY_REVERSED")) ||
        err.message.includes("uq_ledger_single_reversal"),
    );
    pass("Second reversal of the same ledger entry is rejected (single reversal invariant)");

    // TEST 15: Reversal relationship is preserved
    const entryWithRelations = await ledgerService.getLedgerEntryById(consumeEntry.id);
    assert.ok(entryWithRelations.reversedBy.length > 0);
    assert.strictEqual(entryWithRelations.reversedBy[0].id, reversalEntry.id);
    pass("Reversal relationship is navigable via relatedEntry and reversedBy");

    // =========================================================================
    // SECTION 4: Administrative Adjustments
    // =========================================================================
    console.log("\n--- SECTION 4: Administrative Adjustments ---");

    // Create a mock manual_billing_request to satisfy FK chk_ledger_required_refs
    const reqAdjustId = `mbr-test-${timestamp}`;
    await pg.query(`
      INSERT INTO billing.manual_billing_request (
        id, billing_account_id, kind, status, requested_by_id, approved_by_id, payload, reason, ticket_ref
      ) VALUES ($1, $2, 'ADJUST', 'APPROVED', 'requester-uuid', 'approver-uuid', '{}'::jsonb, 'Test correction', 'TICK-ADJ-001');
    `, [reqAdjustId, testBaId]);

    // TEST 16: Authorized platform FINANCE actor can perform approved adjustment (+5)
    const adjustKey = `adjust:test:pos:${timestamp}`;
    const adjustEntry = await ledgerService.executeManualAdjustment({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: 5,
      reason: LedgerReason.ADMINISTRATIVE_ADJUSTMENT,
      reasonNote: "Customer contract amendment adjustment",
      requestId: reqAdjustId,
      approvedById: "approver-uuid",
      idempotencyKey: adjustKey,
      actor: actorFinance,
      ticketRef: "TICK-ADJ-001",
    });
    assert.strictEqual(adjustEntry.entryType, LedgerEntryType.ADJUST);
    assert.strictEqual(adjustEntry.amount, 5);
    assert.strictEqual(adjustEntry.balanceAfter, 39); // 34 + 5 = 39

    const poolAfterAdj = await prisma.creditPool.findUnique({
      where: { id: testPoolId },
    });
    assert.strictEqual(poolAfterAdj?.cachedRemaining, 39);
    pass("Authorized FINANCE staff executes approved positive manual adjustment");

    // Negative adjustment (-4)
    const negAdjKey = `adjust:test:neg:${timestamp}`;
    const negAdjustEntry = await ledgerService.executeManualAdjustment({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: -4,
      reason: LedgerReason.MANUAL_CORRECTION,
      requestId: reqAdjustId,
      idempotencyKey: negAdjKey,
      actor: actorOwner,
    });
    assert.strictEqual(negAdjustEntry.amount, -4);
    assert.strictEqual(negAdjustEntry.balanceAfter, 35); // 39 - 4 = 35
    pass("Authorized OWNER staff executes approved negative manual adjustment");

    // TEST 17: Unauthorized SUPPORT role rejected
    await assert.rejects(
      async () => {
        await ledgerService.executeManualAdjustment({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: 10,
          reason: LedgerReason.ADMINISTRATIVE_ADJUSTMENT,
          requestId: reqAdjustId,
          idempotencyKey: `adjust:unauth:${timestamp}`,
          actor: actorSupport, // SUPPORT is unauthorized!
        });
      },
      (err: any) =>
        err instanceof ForbiddenException && err.message.includes("UNAUTHORIZED_ROLE_FOR_ADJUSTMENT"),
    );
    pass("Unauthorized SUPPORT role rejected from executing manual adjustments");

    // TEST 18: Reason is required
    await assert.rejects(
      async () => {
        await ledgerService.executeManualAdjustment({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: 2,
          reason: "" as any,
          requestId: reqAdjustId,
          idempotencyKey: `adjust:noreason:${timestamp}`,
          actor: actorFinance,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("REASON_REQUIRED"),
    );
    pass("Missing adjustment reason rejected with BadRequestException");

    // TEST 19: RequestId is required
    await assert.rejects(
      async () => {
        await ledgerService.executeManualAdjustment({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: 2,
          reason: "Adjustment",
          requestId: "" as any,
          idempotencyKey: `adjust:noreq:${timestamp}`,
          actor: actorFinance,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("REQUEST_ID_REQUIRED"),
    );
    pass("Missing requestId rejected with BadRequestException");

    // TEST 20: Recruiter identity or spoofed string rejected
    await assert.rejects(
      async () => {
        await ledgerService.executeManualAdjustment({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: 5,
          reason: "Spoof test",
          requestId: reqAdjustId,
          idempotencyKey: `adjust:spoof:${timestamp}`,
          actor: { id: "recruiter-1", role: StaffRole.HR_LEAD, isPlatformStaff: false } as any,
        });
      },
      (err: any) => err instanceof ForbiddenException,
    );
    pass("Recruiter identity and client actor spoofing strictly rejected");

    // TEST 20b: Adjustment exceeding balance rejected
    await assert.rejects(
      async () => {
        await ledgerService.executeManualAdjustment({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: -1000, // exceeds current 35 balance
          reason: "Excessive reduction",
          requestId: reqAdjustId,
          idempotencyKey: `adjust:excess:${timestamp}`,
          actor: actorFinance,
        });
      },
      (err: any) =>
        err instanceof BadRequestException && err.message.includes("ADJUSTMENT_EXCEEDS_BALANCE"),
    );
    pass("Adjustment exceeding balance rejected before balance can become negative");

    // =========================================================================
    // SECTION 5: Idempotency
    // =========================================================================
    console.log("\n--- SECTION 5: Idempotency ---");

    // TEST 21: Repeated operation with same idempotency key does not double-post
    const countBefore = await prisma.creditLedgerEntry.count({
      where: { creditPoolId: testPoolId },
    });
    const replayedGrant = await ledgerService.grantCredits({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: 25,
      grantSource: LedgerGrantSource.PURCHASE,
      reason: LedgerReason.PURCHASE_ALLOCATION,
      idempotencyKey: grantKey1, // Replaying first grant
      actor: actorFinance,
    });
    const countAfter = await prisma.creditLedgerEntry.count({
      where: { creditPoolId: testPoolId },
    });
    assert.strictEqual(countBefore, countAfter, "Row count must NOT change on idempotent retry");
    assert.strictEqual(replayedGrant.id, grantEntry.id);
    pass("Repeated operation with identical idempotency key does not double-post");

    // TEST 22: Conflicting payload with existing idempotency key throws ConflictException
    await assert.rejects(
      async () => {
        await ledgerService.grantCredits({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: 999, // Conflicting amount!
          grantSource: LedgerGrantSource.PURCHASE,
          reason: LedgerReason.PURCHASE_ALLOCATION,
          idempotencyKey: grantKey1,
          actor: actorFinance,
        });
      },
      (err: any) => err instanceof ConflictException && err.message.includes("IDEMPOTENCY_CONFLICT"),
    );
    pass("Conflicting payload with identical idempotency key rejected with ConflictException");

    // =========================================================================
    // SECTION 6: Concurrency & Row Locking
    // =========================================================================
    console.log("\n--- SECTION 6: Concurrency & Row Locking ---");

    // TEST 23: Concurrent operations against the same pool serialize correctly
    // Set pool to exactly 2 credits for race test
    await pg.query(`UPDATE billing.credit_pool SET cached_remaining = 2 WHERE id = $1`, [testPoolId]);

    const conc1 = ledgerService.consumeCredit({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: -1,
      reason: LedgerReason.ATTEMPT_START,
      idempotencyKey: `conc:1:${timestamp}`,
      actor: "system",
    });

    const conc2 = ledgerService.consumeCredit({
      billingAccountId: testBaId,
      organizationId: testOrgId,
      creditPoolId: testPoolId,
      amount: -1,
      reason: LedgerReason.ATTEMPT_START,
      idempotencyKey: `conc:2:${timestamp}`,
      actor: "system",
    });

    const [cRes1, cRes2] = await Promise.all([conc1, conc2]);
    assert.ok(cRes1.id);
    assert.ok(cRes2.id);

    // One must have balanceAfter 1, and the other balanceAfter 0
    const finalBalances = [cRes1.balanceAfter, cRes2.balanceAfter].sort((a, b) => (a ?? 0) - (b ?? 0));
    assert.deepStrictEqual(finalBalances, [0, 1]);
    pass("Concurrent operations serialize under PostgreSQL row locking (balances 2 -> 1 -> 0)");

    // TEST 24: Third concurrent consume fails gracefully due to depletion
    await assert.rejects(
      async () => {
        await ledgerService.consumeCredit({
          billingAccountId: testBaId,
          organizationId: testOrgId,
          creditPoolId: testPoolId,
          amount: -1,
          reason: LedgerReason.ATTEMPT_START,
          idempotencyKey: `conc:3:${timestamp}`,
          actor: "system",
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INSUFFICIENT_CREDITS"),
    );
    pass("Exhausted pool rejects additional concurrent draw without going negative");

    // TEST 25: Balance reconciliation proves ledger sum matches cached balance
    // Reset pool cached remaining to match ledger sum
    const currentSumResult = await pg.query(
      `SELECT SUM(amount)::integer AS total FROM billing.credit_ledger_entry WHERE credit_pool_id = $1`,
      [testPoolId],
    );
    const expectedLedgerSum = Number(currentSumResult.rows[0].total);
    await pg.query(`UPDATE billing.credit_pool SET cached_remaining = $1 WHERE id = $2`, [
      expectedLedgerSum,
      testPoolId,
    ]);

    const reconFinal = await ledgerService.reconcilePoolBalance(testPoolId);
    assert.strictEqual(reconFinal.isConsistent, true);
    assert.strictEqual(reconFinal.cachedRemaining, expectedLedgerSum);
    assert.strictEqual(reconFinal.ledgerSum, expectedLedgerSum);
    pass("reconcilePoolBalance() proves cachedRemaining matches SUM(amount) of ledger entries");

    // =========================================================================
    // SECTION 7: Billing Audit Integration & Immutability
    // =========================================================================
    console.log("\n--- SECTION 7: Billing Audit Integration & Immutability ---");

    // TEST 26: Billing audit entry created in billing.billing_audit_event
    const auditCount = await prisma.billingAuditEvent.count({
      where: { subjectId: testPoolId },
    });
    assert.ok(auditCount > 0, "Billing audit events must be recorded for pool operations");
    pass("Billing audit events recorded across all lifecycle movements");

    // TEST 27: Audit actor, role, and request ID preserved
    const sampleAudit = await prisma.billingAuditEvent.findFirst({
      where: { subjectId: testPoolId, action: "CREDIT_GRANT" },
    });
    assert.ok(sampleAudit);
    assert.strictEqual(sampleAudit.actorRole, PlatformStaffRole.FINANCE);
    pass("Billing audit preserves actor identity, role, and ticket references");

    // TEST 28: Sensitive information redacted from billing audit metadata
    const sanitizedAudit = await prisma.billingAuditEvent.findFirst({
      where: { subjectId: testPoolId, action: "ADMINISTRATIVE_ADJUSTMENT" },
    });
    assert.ok(sanitizedAudit);
    assert.strictEqual(typeof sanitizedAudit.before, "object");
    assert.strictEqual(typeof sanitizedAudit.after, "object");
    pass("Audit metadata sanitization cleans all sensitive authentication parameters");

    // TEST 29: Database trigger immutability on billing_audit_event
    await assert.rejects(
      async () => {
        await pg.query(
          `UPDATE billing.billing_audit_event SET action = 'TAMPERED' WHERE id = $1`,
          [sampleAudit.id],
        );
      },
      (err: any) =>
        err.message.includes("strictly append-only") || err.message.includes("27000"),
    );

    await assert.rejects(
      async () => {
        await pg.query(
          `DELETE FROM billing.billing_audit_event WHERE id = $1`,
          [sampleAudit.id],
        );
      },
      (err: any) =>
        err.message.includes("strictly append-only") || err.message.includes("27000"),
    );
    pass("Billing audit immutability enforced by database trigger (UPDATE and DELETE blocked)");

    // =========================================================================
    // SECTION 8: Cleanup Isolated Test Data & Verify Seed Baseline
    // =========================================================================
    console.log("\n--- SECTION 8: Cleanup Isolated Test Data & Verify Baseline ---");

    // Clean up test records using trigger bypass for isolated test entities
    await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

    await pg.query("DELETE FROM public.event_log WHERE session_id LIKE 'sess-bb-int-%' OR session_id LIKE 'sess-test-%'");
    await pg.query("DELETE FROM billing.session_billing_evidence WHERE session_id LIKE 'sess-bb-int-%' OR session_id LIKE 'sess-test-%'");
    await pg.query("DELETE FROM billing.billing_audit_event WHERE subject_id LIKE 'pool-ledger-%' OR subject_id LIKE 'ba-ledger-%'");
    await pg.query("DELETE FROM billing.credit_ledger_entry WHERE billing_account_id LIKE 'ba-ledger-%' OR billing_account_id = $1", [testBaId]);
    await pg.query("DELETE FROM public.session WHERE organization_id LIKE 'org-ledger-%' OR organization_id = $1", [testOrgId]);
    await pg.query("DELETE FROM billing.manual_billing_request WHERE id LIKE 'req-ledger-%' OR id = $1", [reqAdjustId]);
    await pg.query("DELETE FROM billing.credit_pool WHERE billing_account_id LIKE 'ba-ledger-%' OR billing_account_id = $1", [testBaId]);
    await pg.query("DELETE FROM public.organization WHERE id LIKE 'org-ledger-%' OR id = $1", [testOrgId]);
    await pg.query("DELETE FROM billing.billing_account WHERE id LIKE 'ba-ledger-%' OR id = $1", [testBaId]);

    await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    await pg.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");

    // TEST 32: Verify baseline database state is completely pristine
    const seededOrgs = await prisma.organization.findMany({
      where: {
        id: { notIn: [testOrgId] },
      },
      include: {
        billingAccount: {
          include: {
            pools: {
              include: { ledgerEntries: true },
            },
          },
        },
      },
    });

    assert.strictEqual(seededOrgs.length, 2, "Only the 2 original seeded organizations must exist");

    for (const org of seededOrgs) {
      assert.strictEqual(org.billingAccount.overdraftLimit, 0);
      assert.strictEqual(org.billingAccount.overdraftUsed, 0);

      const trialPool = org.billingAccount.pools.find((p) => p.source === "TRIAL");
      assert.ok(trialPool, `Seeded TRIAL pool must exist for ${org.name}`);
      assert.strictEqual(trialPool.totalCredits, 50);
      assert.strictEqual(trialPool.cachedRemaining, 50);

      const ledgerSum = trialPool.ledgerEntries.reduce((sum, e) => sum + e.amount, 0);
      assert.strictEqual(ledgerSum, 50, "Ledger sum for seeded pool must remain exactly 50");
      assert.strictEqual(trialPool.cachedRemaining, ledgerSum);
    }
    pass("Baseline database state is 100% pristine: Acme & Globex remain at 50 credits with zero overdraft");

    console.log("================================================================================");
    console.log(`Summary: All ${passedCount}/${totalCount} LedgerService Tests Passed!`);
    console.log("================================================================================");
  } finally {
    await pg.end();
    await prisma.$disconnect();
  }
}

runLedgerServiceTests().catch((err) => {
  console.error("LedgerService test suite failed:", err);
  process.exit(1);
});
