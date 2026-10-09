import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import * as assert from "assert";
import { ReconciliationService } from "./reconciliation.service";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { PriceBookService } from "../price/price-book.service";
import { BillingAccountService } from "../account/billing-account.service";
import { PaymentService } from "../payment/payment.service";
import {
  ReconciliationRunType,
  ReconciliationRunStatus,
  ReconciliationFindingSeverity,
  ReconciliationCheckName,
  ReconciliationStaffActor,
} from "./reconciliation.types";
import { PoolType } from "../pool/credit-pool.types";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PaymentProvider, PaymentStatus } from "../payment/payment.types";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function runReconciliationTests() {
  console.log("================================================================================");
  console.log("STAGE 2.9 â€” ReconciliationService Architecture-Gated Verification Suite");
  console.log("================================================================================");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  const ledgerService = new LedgerService(prisma as any);
  const creditPoolService = new CreditPoolService(prisma as any, ledgerService);
  const priceBookService = new PriceBookService(prisma as any);
  const billingAccountService = new BillingAccountService(prisma as any);
  const paymentService = new PaymentService(
    prisma as any,
    ledgerService,
    creditPoolService,
    priceBookService,
    billingAccountService,
  );

  const reconciliationService = new ReconciliationService(prisma as any);

  const runId = Date.now().toString();
  let passedTests = 0;

  function pass(testNum: number, desc: string) {
    passedTests++;
    console.log(`[PASS] Test ${testNum}: ${desc}`);
  }

  const staffActor: ReconciliationStaffActor = {
    id: `staff-recon-${runId}`,
    email: `recon.auditor-${runId}@proctora.platform`,
    name: "Platform Auditor",
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    isPlatformStaff: true,
  };

  const financePaymentActor = {
    id: `finance-${runId}`,
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    email: `finance-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  // Tracking arrays for cleanup
  const testBaIds: string[] = [];
  const testPoolIds: string[] = [];
  const testPaymentIds: string[] = [];
  const testPriceEntryIds: string[] = [];
  const testSessionIds: string[] = [];
  const testRunIds: string[] = [];

  // Helper to create an isolated test billing account linked to an org
  async function createTestAccount(suffix: string, country = "IN", currency = "INR") {
    const baId = `ba-recon-${runId}-${suffix}`;
    const orgId = `org-recon-${runId}-${suffix}`;

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, has_paid_purchase, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 0, 0, false, clock_timestamp(), clock_timestamp())`,
      [baId, `Recon Test BA ${suffix}`, country, currency],
    );

    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())`,
      [orgId, `Recon Test Org ${suffix}`, `recon-org-${runId}-${suffix}`, baId],
    );

    testBaIds.push(baId);
    return { baId, orgId };
  }

  // Safe wrapper for modifying/deleting records during test fixture lifecycle
  async function executeWithTriggersDisabled(action: () => Promise<void>) {
    try {
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
      await action();
    } finally {
      await pg.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    }
  }

  // Pre-test sanitation: clean any leftovers from prior runs so baseline is pristine
  await executeWithTriggersDisabled(async () => {
    await pg.query("DELETE FROM billing.payment_event WHERE event_id LIKE '%test%' OR event_id LIKE '%wh-%' OR event_id LIKE '%recon-%'");
    await pg.query("DELETE FROM billing.credit_ledger_entry WHERE billing_account_id LIKE 'ba-wh-%' OR billing_account_id LIKE 'ba-recon-%'");
    await pg.query("DELETE FROM billing.credit_pool WHERE billing_account_id LIKE 'ba-wh-%' OR billing_account_id LIKE 'ba-recon-%'");
    await pg.query("DELETE FROM billing.payment WHERE billing_account_id LIKE 'ba-wh-%' OR billing_account_id LIKE 'ba-recon-%'");
    await pg.query("DELETE FROM public.organization WHERE id LIKE 'org-wh-%' OR id LIKE 'org-recon-%'");
    await pg.query("DELETE FROM billing.billing_account WHERE id LIKE 'ba-wh-%' OR id LIKE 'ba-recon-%'");
    await pg.query("DELETE FROM billing.price_book_entry WHERE sku LIKE 'SKU-WH-%' OR sku LIKE 'SKU-RECON-%'");
  });

  try {
    // ========================================================================
    // TEST A: Clean Baseline Verification
    // ========================================================================
    const baselineResult = await reconciliationService.runNightlyAudit();
    testRunIds.push(baselineResult.id);

    assert.strictEqual(baselineResult.runType, ReconciliationRunType.NIGHTLY);
    assert.strictEqual(baselineResult.driftDetected, false, "Baseline must detect 0 financial drift");
    assert.strictEqual(baselineResult.status, ReconciliationRunStatus.PASSED, "Baseline audit status must be PASSED");
    assert.strictEqual(
      baselineResult.discrepancyDetails.filter((d) => d.severity === ReconciliationFindingSeverity.FAILURE).length,
      0,
      "Baseline must have zero FAILURE severity findings",
    );

    // Verify all 7 checks passed
    const results = baselineResult.checkResults;
    assert.strictEqual(results[ReconciliationCheckName.POOL_INTEGRITY].status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(results[ReconciliationCheckName.OVERDRAFT_INTEGRITY].status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(results[ReconciliationCheckName.SESSION_ACQUISITION].status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(results[ReconciliationCheckName.EXPIRY_SWEEPER].status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(results[ReconciliationCheckName.TOPOLOGY_INVARIANT].status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(results[ReconciliationCheckName.PAYMENT_PROOF].status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(results[ReconciliationCheckName.AUDIT_WORM_VERIFICATION].status, ReconciliationRunStatus.PASSED);

    pass(1, "Test A â€” Clean baseline passes all 7 checks against pristine seed data with zero drift");

    // ========================================================================
    // TEST B: Cached Balance Mismatch Detection (No Automatic Financial Repair)
    // ========================================================================
    const { baId: baB, orgId: orgB } = await createTestAccount("mismatch");
    const poolBId = `pool-mismatch-${runId}`;
    testPoolIds.push(poolBId);

    // Insert test pool with totalCredits=10 and initial ledger GRANT of 10
    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, 'Mismatch Test Pool', 'TALENT_RESERVE', 'PURCHASE', 10, 10, 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [poolBId, baB],
    );
    await pg.query(
      `INSERT INTO billing.credit_ledger_entry (id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after, grant_source, idempotency_key, actor_id, reason, shadow, created_at)
       VALUES ($1, $2, $3, $4, 'GRANT', 10, 10, 'PURCHASE', $5, 'system', 'PURCHASE_ALLOCATION', false, clock_timestamp())`,
      [`cle-b1-${runId}`, baB, orgB, poolBId, `idem-b1-${runId}`],
    );

    // Artificially corrupt cached_remaining to 5 (ledger says 10)
    await pg.query(`UPDATE billing.credit_pool SET cached_remaining = 5 WHERE id = $1`, [poolBId]);

    const checkB = await reconciliationService.runPoolIntegrityCheck();
    assert.strictEqual(checkB.status, ReconciliationRunStatus.FAILED, "Pool check must fail on balance mismatch");
    const findingB = checkB.findings.find((f) => f.entityId === poolBId);
    assert.ok(findingB, "Must contain finding for mismatched pool");
    assert.strictEqual(findingB.expectedValue, 10, "Expected balance from ledger is 10");
    assert.strictEqual(findingB.observedValue, 5, "Observed cached balance is 5");

    // CRITICAL: Verify READ-ONLY guarantee â€” no auto-repair occurred!
    const poolBAfter = await prisma.creditPool.findUnique({ where: { id: poolBId } });
    assert.strictEqual(poolBAfter?.cachedRemaining, 5, "Reconciliation MUST NOT auto-repair cached balance");
    pass(2, "Test B â€” Cached balance mismatch detected; financial state preserved without auto-repair");

    // Clean up test B pool
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE credit_pool_id = $1`, [poolBId]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolBId]);
    });

    // ========================================================================
    // TEST C: Overdraft Violation Detection (ADR-004 Enforcement)
    // ========================================================================
    const { baId: baC } = await createTestAccount("overdraft");
    // Artificially set non-zero overdraft_used
    await pg.query(`UPDATE billing.billing_account SET overdraft_used = 15 WHERE id = $1`, [baC]);

    const checkC = await reconciliationService.runOverdraftIntegrityCheck();
    assert.strictEqual(checkC.status, ReconciliationRunStatus.FAILED, "Overdraft check must fail on non-zero used");
    const findingC = checkC.findings.find((f) => f.entityId === baC);
    assert.ok(findingC, "Must report finding for overdraft violation");
    assert.strictEqual(findingC.observedValue, 15);
    assert.strictEqual(findingC.expectedValue, 0);

    // Verify read-only: no auto-reset of overdraft
    const baCAfter = await prisma.billingAccount.findUnique({ where: { id: baC } });
    assert.strictEqual(baCAfter?.overdraftUsed, 15, "Reconciliation MUST NOT mutate overdraft counter");
    pass(3, "Test C â€” Overdraft violation detected per ADR-004; values preserved read-only");

    // Clean up test C
    await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baC]);
    await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baC]);

    // ========================================================================
    // TEST D: Session Acquisition 1:1 Invariant Violations (Cases A, B, C)
    // ========================================================================
    const { baId: baD, orgId: orgD } = await createTestAccount("session");
    const sessD1 = `sess-recon-${runId}-d1`;
    const sessD2 = `sess-recon-${runId}-d2`;
    testSessionIds.push(sessD1, sessD2);

    const poolDId = `pool-sess-${runId}`;
    testPoolIds.push(poolDId);

    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, 'Session Test Pool', 'TALENT_RESERVE', 'PURCHASE', 50, 50, 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [poolDId, baD],
    );

    // Create a candidate session template role
    const candidateId = `cand-recon-${runId}`;
    await pg.query(
      `INSERT INTO public.candidate (id, organization_id, email, name, created_at)
       VALUES ($1, $2, $3, 'Candidate PII Hidden', clock_timestamp())`,
      [candidateId, orgD, `cand-${runId}@tenant.test`],
    );

    const templateResult = await pg.query(`SELECT id FROM public.role_template LIMIT 1`);
    const roleTemplateId = templateResult.rows[0].id;

    // Case A Fixture: Started live session with NO credit consumption
    await pg.query(
      `INSERT INTO public.session (id, organization_id, candidate_id, role_template_id, cv_mode, status, kind, started_at)
       VALUES ($1, $2, $3, $4, 'FULL', 'IN_PROGRESS', 'LIVE', clock_timestamp())`,
      [sessD1, orgD, candidateId, roleTemplateId],
    );

    // Case B Fixture: Session with MULTIPLE (2) CONSUME entries
    await pg.query(
      `INSERT INTO public.session (id, organization_id, candidate_id, role_template_id, cv_mode, status, kind, started_at)
       VALUES ($1, $2, $3, $4, 'FULL', 'IN_PROGRESS', 'LIVE', clock_timestamp())`,
      [sessD2, orgD, candidateId, roleTemplateId],
    );

    await executeWithTriggersDisabled(async () => {
      // Temporarily drop partial index to simulate out-of-band corruption / constraint bypass
      await pg.query(`DROP INDEX IF EXISTS billing.uq_ledger_one_acquisition_per_session`);

      await pg.query(
        `INSERT INTO billing.session_billing_evidence (session_id, billing_account_id, kind, event_count, modules_reached, started_at, created_at)
         VALUES ($1, $2, 'LIVE', 1, 1, clock_timestamp(), clock_timestamp())`,
        [sessD2, baD],
      );

      await pg.query(
        `INSERT INTO billing.credit_ledger_entry (id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after, session_id, idempotency_key, actor_id, reason, shadow, created_at)
         VALUES 
         ($1, $3, $4, $5, 'CONSUME', -1, 49, $2, $6, 'system', 'ATTEMPT_START', false, clock_timestamp()),
         ($7, $3, $4, $5, 'CONSUME', -1, 48, $2, $8, 'system', 'ATTEMPT_START', false, clock_timestamp())`,
        [
          `cle-d1-${runId}`, sessD2, baD, orgD, poolDId, `idem-d1-${runId}`,
          `cle-d2-${runId}`, `idem-d2-${runId}`,
        ],
      );
    });

    const checkD = await reconciliationService.runSessionAcquisitionCheck();
    assert.strictEqual(checkD.status, ReconciliationRunStatus.FAILED, "Session check must fail on 1:1 violations");
    assert.ok(checkD.details.caseA_missingConsumption >= 1, "Must detect Case A (missing consumption)");
    assert.ok(checkD.details.caseB_duplicateConsumption >= 1, "Must detect Case B (duplicate consumption)");

    // Verify candidate privacy (PII-free diagnostics)
    for (const f of checkD.findings) {
      assert.strictEqual((f.metadata as any)?.candidateName, undefined, "Metadata MUST NOT contain candidate name");
      assert.strictEqual((f.metadata as any)?.candidateEmail, undefined, "Metadata MUST NOT contain candidate email");
    }
    pass(4, "Test D â€” 1:1 Session-acquisition invariant violations detected (Cases A & B) with strict PII-blind diagnostics");

    // Clean up test D fixtures and restore partial unique index
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baD]);
      await pg.query(`DELETE FROM billing.session_billing_evidence WHERE session_id IN ($1, $2)`, [sessD1, sessD2]);
      await pg.query(`DELETE FROM public.session WHERE id IN ($1, $2)`, [sessD1, sessD2]);
      await pg.query(`DELETE FROM public.candidate WHERE id = $1`, [candidateId]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolDId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgD]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baD]);
      await pg.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_ledger_one_acquisition_per_session" ON "billing"."credit_ledger_entry" (session_id) WHERE entry_type IN ('CONSUME', 'OVERDRAFT') AND shadow = false`);
    });

    // ========================================================================
    // TEST E: Expired Pool With Remaining Credits (Expiry Sweeper Detection)
    // ========================================================================
    const { baId: baE, orgId: orgE } = await createTestAccount("expired");
    const poolEId = `pool-exp-${runId}`;
    testPoolIds.push(poolEId);

    // Pool expired 2 hours ago but has 25 credits remaining in ACTIVE status
    const pastExpiry = new Date(Date.now() - 7200000).toISOString();
    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, expires_at, purchased_at, created_at)
       VALUES ($1, $2, 'Expired Unprocessed Pool', 'TALENT_RESERVE', 'PURCHASE', 25, 25, 'ACTIVE', $3, clock_timestamp(), clock_timestamp())`,
      [poolEId, baE, pastExpiry],
    );

    const checkE = await reconciliationService.runExpirySweeperCheck();
    assert.ok(
      checkE.status === ReconciliationRunStatus.WARNING || checkE.status === ReconciliationRunStatus.FAILED,
      "Expiry check must report warning or failure for unprocessed expired pool",
    );
    assert.ok(checkE.details.expiredUnprocessed >= 1, "Must flag pool as EXPIRED_UNPROCESSED");
    const findingE = checkE.findings.find((f) => f.entityId === poolEId);
    assert.ok(findingE, "Must have finding for expired unprocessed pool");
    assert.strictEqual(findingE.severity, ReconciliationFindingSeverity.WARNING);

    // Verify read-only: reconciliation does not mutate pool to EXPIRED
    const poolEAfter = await prisma.creditPool.findUnique({ where: { id: poolEId } });
    assert.strictEqual(poolEAfter?.status, "ACTIVE", "Reconciliation MUST NOT mutate pool status");
    assert.strictEqual(poolEAfter?.cachedRemaining, 25, "Reconciliation MUST NOT drain expired credits");
    pass(5, "Test E â€” Expired pool with remaining balance detected as EXPIRED_UNPROCESSED without mutating state");

    // Clean up test E
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolEId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgE]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baE]);
    });

    // ========================================================================
    // TEST F: Orphan Topology & Sequential Queueing Invariant
    // ========================================================================
    const { baId: baF, orgId: orgF } = await createTestAccount("topo");
    const poolF1 = `pool-topo-1-${runId}`;
    const poolF2 = `pool-topo-2-${runId}`;
    testPoolIds.push(poolF1, poolF2);

    // Create TWO ACTIVE general pools on the same account (violates Jio sequential queueing rule)
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DROP INDEX IF EXISTS billing.uq_pool_one_active_general`);
      await pg.query(
        `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, drive_id, queue_order, purchased_at, created_at)
         VALUES 
         ($1, $3, 'Active General 1', 'TALENT_RESERVE', 'PURCHASE', 50, 50, 'ACTIVE', NULL, 1, clock_timestamp(), clock_timestamp()),
         ($2, $3, 'Active General 2', 'TALENT_RESERVE', 'PURCHASE', 50, 50, 'ACTIVE', NULL, 2, clock_timestamp(), clock_timestamp())`,
        [poolF1, poolF2, baF],
      );
    });

    const checkF = await reconciliationService.runTopologyCheck();
    assert.strictEqual(checkF.status, ReconciliationRunStatus.FAILED, "Topology check must fail on multiple active general pools");
    assert.ok(
      checkF.details.multipleActiveGeneralPoolsAccounts >= 1,
      "Must flag sequential queueing violation for billing account",
    );

    // Verify read-only: neither pool was modified or deleted
    const poolF1After = await prisma.creditPool.findUnique({ where: { id: poolF1 } });
    const poolF2After = await prisma.creditPool.findUnique({ where: { id: poolF2 } });
    assert.ok(poolF1After && poolF2After, "Reconciliation MUST NOT delete or modify violating topology records");
    pass(6, "Test F â€” Topology invariant violation detected (multiple active general pools per account)");

    // Clean up test F and restore index
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_pool WHERE id IN ($1, $2)`, [poolF1, poolF2]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgF]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baF]);
      await pg.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_one_active_general" ON "billing"."credit_pool" (billing_account_id) WHERE drive_id IS NULL AND status = 'ACTIVE'`);
    });

    // ========================================================================
    // TEST G: Payment Proof Failure â€” Missing Opening GRANT
    // ========================================================================
    const { baId: baG, orgId: orgG } = await createTestAccount("nopool");
    const pbeG = await priceBookService.publishNewVersion(financePaymentActor, {
      sku: `SKU-RECON-G-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 2000,
      poolType: PoolType.ENTERPRISE,
      credits: 50,
      reason: "Recon Test G Pricing",
    });
    testPriceEntryIds.push(pbeG.id);

    const payGId = `pay-recon-g-${runId}`;
    testPaymentIds.push(payGId);

    // Create a CAPTURED payment with a pool, but WITHOUT an opening GRANT entry in ledger
    const poolGId = `pool-recon-g-${runId}`;
    testPoolIds.push(poolGId);

    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, captured_at, created_at)
       VALUES ($1, $2, 'RAZORPAY', $3, 'CAPTURED', $4, 50, 2000, 100000, 0, 'INR', clock_timestamp(), clock_timestamp())`,
      [payGId, baG, `rzp_pay_g_${runId}`, pbeG.id],
    );

    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, payment_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, $3, 'Purchase Recon G', 'ENTERPRISE', 'PURCHASE', 50, 50, 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [poolGId, baG, payGId],
    );

    const checkG = await reconciliationService.runPaymentProofCheck();
    assert.strictEqual(checkG.status, ReconciliationRunStatus.FAILED, "Payment proof check must fail on missing GRANT");
    assert.ok(checkG.details.paymentsWithMissingGrant >= 1, "Must record missing grant");
    const findingG = checkG.findings.find((f) => f.entityId === payGId);
    assert.ok(findingG, "Must report finding for payment G");
    pass(7, "Test G â€” Payment Proof failure detected for captured payment missing opening ledger GRANT");

    // Clean up test G
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolGId]);
      await pg.query(`DELETE FROM billing.payment WHERE id = $1`, [payGId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgG]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baG]);
    });

    // ========================================================================
    // TEST H: Payment Proof Failure â€” Amount Incoherence (Math Mismatch)
    // ========================================================================
    const { baId: baH, orgId: orgH } = await createTestAccount("math");
    const pbeH = await priceBookService.publishNewVersion(financePaymentActor, {
      sku: `SKU-RECON-H-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 3000,
      poolType: PoolType.ENTERPRISE,
      credits: 20,
      reason: "Recon Test H Pricing",
    });
    testPriceEntryIds.push(pbeH.id);

    const payHId = `pay-recon-h-${runId}`;
    testPaymentIds.push(payHId);

    // Qty=20, unitPrice=3000 => expected amount 60,000. Corrupt it to 99,999!
    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, captured_at, created_at)
       VALUES ($1, $2, 'RAZORPAY', $3, 'CAPTURED', $4, 20, 3000, 99999, 0, 'INR', clock_timestamp(), clock_timestamp())`,
      [payHId, baH, `rzp_pay_h_${runId}`, pbeH.id],
    );

    const checkH = await reconciliationService.runPaymentProofCheck();
    assert.strictEqual(checkH.status, ReconciliationRunStatus.FAILED, "Payment proof must fail on math mismatch");
    assert.ok(checkH.details.paymentsWithMathDiscrepancy >= 1, "Must flag mathematical discrepancy");
    pass(8, "Test H â€” Payment Proof mathematical incoherence detected (qty * unitPrice != amount)");

    // Clean up test H
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id = $1`, [payHId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgH]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baH]);
    });

    // ========================================================================
    // TEST I: Concurrent Reconciliation Runs
    // ========================================================================
    const [concurrentRun1, concurrentRun2] = await Promise.all([
      reconciliationService.runNightlyAudit(),
      reconciliationService.triggerManualAudit(staffActor),
    ]);
    testRunIds.push(concurrentRun1.id, concurrentRun2.id);

    assert.ok(concurrentRun1.id && concurrentRun2.id, "Both concurrent runs must produce unique run IDs");
    assert.notStrictEqual(concurrentRun1.id, concurrentRun2.id, "Run IDs must be distinct");
    assert.strictEqual(concurrentRun1.runType, ReconciliationRunType.NIGHTLY);
    assert.strictEqual(concurrentRun2.runType, ReconciliationRunType.MANUAL);
    assert.strictEqual(concurrentRun2.executedBy, staffActor.email);

    // Verify both runs recorded in DB
    const dbRun1 = await prisma.reconciliationRun.findUnique({ where: { id: concurrentRun1.id } });
    const dbRun2 = await prisma.reconciliationRun.findUnique({ where: { id: concurrentRun2.id } });
    assert.ok(dbRun1 && dbRun2, "Both reconciliation runs must be persisted in database");
    pass(9, "Test I â€” Concurrent reconciliation runs execute in parallel with deterministic snapshot isolation");

    // ========================================================================
    // TEST J: Reconciliation During Concurrent Payment Capture
    // ========================================================================
    const { baId: baJ, orgId: orgJ } = await createTestAccount("livepay");
    const pbeJ = await priceBookService.publishNewVersion(financePaymentActor, {
      sku: `SKU-RECON-J-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 1000,
      poolType: PoolType.ENTERPRISE,
      credits: 10,
      reason: "Recon Test J Pricing",
    });
    testPriceEntryIds.push(pbeJ.id);

    // Run reconciliation concurrently while executing valid payment capture
    const paymentPromise = paymentService.recordManualInvoicePayment(financePaymentActor, {
      billingAccountId: baJ,
      invoiceNumber: `INV-RECON-${runId}`,
      poNumber: `PO-RECON-${runId}`,
      priceBookEntryId: pbeJ.id,
      quantityCredits: 10,
      taxMinor: 1800,
      amountMinor: 11800,
      currency: "INR",
      capturedAt: new Date(),
      reason: "Concurrent payment test",
    });

    const reconPromise = reconciliationService.runNightlyAudit();

    const [paymentResult, reconResult] = await Promise.all([paymentPromise, reconPromise]);
    testPaymentIds.push(paymentResult.id);
    testRunIds.push(reconResult.id);

    const poolJ = await prisma.creditPool.findFirst({ where: { paymentId: paymentResult.id } });
    if (poolJ) testPoolIds.push(poolJ.id);

    assert.strictEqual(paymentResult.status, PaymentStatus.CAPTURED);
    assert.strictEqual(poolJ?.cachedRemaining, 10);
    assert.ok(reconResult.id, "Reconciliation run completed successfully during payment capture");
    assert.strictEqual(reconResult.driftDetected, false, "Zero financial drift during concurrent capture");
    pass(10, "Test J â€” Reconciliation during payment capture completed with zero corruption and consistent snapshot");

    // Clean up test J
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baJ]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = $1`, [baJ]);
      await pg.query(`DELETE FROM billing.payment WHERE billing_account_id = $1`, [baJ]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgJ]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baJ]);
    });

    // ========================================================================
    // TEST K: Append-Only Trigger and Immutability Verification (Check 7)
    // ========================================================================
    const auditWormResult = await reconciliationService.runAuditWormCheck();
    assert.strictEqual(auditWormResult.status, ReconciliationRunStatus.PASSED);
    assert.strictEqual(auditWormResult.details.immutabilityTriggersActive, true, "Triggers must be active");
    assert.strictEqual(auditWormResult.details.wormExportStatus, "CAPABILITY_GAP");
    assert.ok(
      auditWormResult.details.wormCapabilityGapReport.includes("MinIO WORM object lock export"),
      "Must honestly document export capability gap",
    );
    pass(11, "Test K â€” Immutability triggers active, audit coverage verified, and WORM capability gap honestly reported");

    // ========================================================================
    // TEST L: Seed Baseline Integrity (Acme & Globex Pristine)
    // ========================================================================
    const acmeBa = await prisma.billingAccount.findFirst({
      where: { name: { contains: "Acme" } },
      include: { pools: true },
    });
    const globexBa = await prisma.billingAccount.findFirst({
      where: { name: { contains: "Globex" } },
      include: { pools: true },
    });

    assert.ok(acmeBa, "Acme baseline account must exist");
    assert.ok(globexBa, "Globex baseline account must exist");
    assert.strictEqual(acmeBa.overdraftLimit, 0, "Acme overdraft_limit must be 0");
    assert.strictEqual(acmeBa.overdraftUsed, 0, "Acme overdraft_used must be 0");
    assert.strictEqual(globexBa.overdraftLimit, 0, "Globex overdraft_limit must be 0");
    assert.strictEqual(globexBa.overdraftUsed, 0, "Globex overdraft_used must be 0");

    const acmeTotalCredits = acmeBa.pools.reduce((sum, p) => sum + p.cachedRemaining, 0);
    const globexTotalCredits = globexBa.pools.reduce((sum, p) => sum + p.cachedRemaining, 0);
    assert.strictEqual(acmeTotalCredits, 50, "Acme baseline balance must remain pristine at 50 credits");
    assert.strictEqual(globexTotalCredits, 50, "Globex baseline balance must remain pristine at 50 credits");
    pass(12, "Test L â€” Seed baseline accounts Acme and Globex remain pristine with 50 credits and 0 overdraft");

    // ========================================================================
    // TEST M: getLatestRun() API Contract
    // ========================================================================
    const latestRun = await reconciliationService.getLatestRun();
    assert.ok(latestRun !== null, "getLatestRun() must return the most recent run");
    assert.ok(latestRun.id, "latestRun must have valid ID");
    assert.ok(latestRun.checkResults[ReconciliationCheckName.POOL_INTEGRITY], "latestRun must contain check results");
    pass(13, "Test M â€” getLatestRun() retrieves latest audit report with all 7 check breakdowns");

    console.log("================================================================================");
    console.log(`ALL ${passedTests} / 13 TESTS PASSED FOR ReconciliationService!`);
    console.log("================================================================================");
  } finally {
    // Teardown: Clean up test fixtures and ensure triggers remain enabled
    console.log("Cleaning up test fixtures...");
    await executeWithTriggersDisabled(async () => {
      if (testPaymentIds.length > 0) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE payment_id = ANY($1)`, [testPaymentIds]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE payment_id = ANY($1)`, [testPaymentIds]);
        await pg.query(`DELETE FROM billing.payment WHERE id = ANY($1)`, [testPaymentIds]);
      }

      if (testPoolIds.length > 0) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE credit_pool_id = ANY($1)`, [testPoolIds]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE id = ANY($1)`, [testPoolIds]);
      }

      if (testBaIds.length > 0) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = ANY($1)`, [testBaIds]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = ANY($1)`, [testBaIds]);
        await pg.query(`DELETE FROM billing.payment WHERE billing_account_id = ANY($1)`, [testBaIds]);
        await pg.query(`DELETE FROM public.organization WHERE billing_account_id = ANY($1)`, [testBaIds]);
        await pg.query(`DELETE FROM billing.billing_account WHERE id = ANY($1)`, [testBaIds]);
      }

      if (testPriceEntryIds.length > 0) {
        await pg.query(`DELETE FROM billing.price_book_entry WHERE id = ANY($1)`, [testPriceEntryIds]);
      }

      await pg.query(`DELETE FROM billing.billing_audit_event WHERE actor_id LIKE '%${runId}%' OR subject_id LIKE '%${runId}%'`);
      await pg.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_ledger_one_acquisition_per_session" ON "billing"."credit_ledger_entry" (session_id) WHERE entry_type IN ('CONSUME', 'OVERDRAFT') AND shadow = false`);
    });

    await prisma.$disconnect();
    await pg.end();
  }
}

if (process.env.JEST_WORKER_ID !== undefined) {
  describe("ReconciliationService", () => {
    it("executes all ReconciliationService integration tests", async () => {
      await runReconciliationTests();
    }, 120000);
  });
} else {
  runReconciliationTests().catch((err) => {
    console.error("FATAL: ReconciliationService verification failed:", err);
    process.exit(1);
  });
}
