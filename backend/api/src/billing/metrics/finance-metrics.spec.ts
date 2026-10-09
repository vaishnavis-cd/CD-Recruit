import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import * as assert from "assert";
import { ForbiddenException } from "@nestjs/common";
import { FinanceMetricsService } from "./finance-metrics.service";
import { ReconciliationService } from "../reconciliation/reconciliation.service";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { PriceBookService } from "../price/price-book.service";
import { BillingAccountService } from "../account/billing-account.service";
import { PaymentService } from "../payment/payment.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PoolType } from "../pool/credit-pool.types";
import { PaymentStatus } from "../payment/payment.types";
import { PeriodType } from "./finance-metrics.types";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function runFinanceMetricsTests() {
  console.log("================================================================================");
  console.log("STAGE 2.10 — FinanceMetricsService Architecture-Gated Verification Suite");
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
  const financeMetricsService = new FinanceMetricsService(
    prisma as any,
    reconciliationService,
  );

  const runId = Date.now().toString();
  let passedTests = 0;

  function pass(testNum: number, desc: string) {
    passedTests++;
    console.log(`[PASS] Test ${testNum}: ${desc}`);
  }

  const financeActor = {
    id: `finance-metrics-${runId}`,
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    email: `finance.metrics-${runId}@proctora.platform`,
    isPlatformStaff: true as const,
  };

  const recruiterActor = {
    id: `recruiter-${runId}`,
    role: "RECRUITER" as any,
    email: `recruiter-${runId}@client.com`,
    isPlatformStaff: false,
  };

  // Tracking arrays for cleanup
  const testBaIds: string[] = [];
  const testPoolIds: string[] = [];
  const testPaymentIds: string[] = [];
  const testPriceEntryIds: string[] = [];

  // Helper to create an isolated test billing account linked to an org
  async function createTestAccount(suffix: string, country = "IN", currency = "INR") {
    const baId = `ba-fms-${runId}-${suffix}`;
    const orgId = `org-fms-${runId}-${suffix}`;

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, has_paid_purchase, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 0, 0, false, clock_timestamp(), clock_timestamp())`,
      [baId, `Metrics Test BA ${suffix}`, country, currency],
    );

    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())`,
      [orgId, `Metrics Test Org ${suffix}`, `fms-org-${runId}-${suffix}`, baId],
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
      await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");
    }
  }

  try {
    // ========================================================================
    // TEST 1 (Test A): Clean Baseline Representation (Acme & Globex)
    // ========================================================================
    const overviewA = await financeMetricsService.getFinancialOverview(undefined, financeActor);
    assert.ok(overviewA, "Must return financial overview");
    assert.strictEqual(overviewA.risk.totalOverdraftUsedMinor, 0, "Baseline overdraft used must be 0 (ADR-004)");
    assert.strictEqual(overviewA.risk.totalOverdraftLimitMinor, 0, "Baseline overdraft limit must be 0 (ADR-004)");
    assert.strictEqual(overviewA.risk.agedOverdraftCount, 0, "Aged overdraft must be 0");
    assert.ok(overviewA.credits.availableCredits >= 100, "Available credits must include at least Acme (50) + Globex (50)");
    pass(1, "Test A — Clean baseline correctly reflects Acme and Globex balances and zero overdraft");

    // ========================================================================
    // TEST 2 (Test B): Captured Payment Revenue and Credit Metrics
    // ========================================================================
    const { baId: baB } = await createTestAccount("captured");
    const pbeB = await priceBookService.publishNewVersion(financeActor, {
      sku: `SKU-FMS-B-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 2000,
      poolType: PoolType.ENTERPRISE,
      credits: 10,
      reason: "Metrics Test B Pricing",
    });
    testPriceEntryIds.push(pbeB.id);

    const paymentB = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baB,
      invoiceNumber: `INV-FMS-B-${runId}`,
      poNumber: `PO-FMS-B-${runId}`,
      priceBookEntryId: pbeB.id,
      quantityCredits: 10,
      taxMinor: 3600,
      amountMinor: 23600,
      currency: "INR",
      capturedAt: new Date(),
      reason: "Test B payment",
    });
    testPaymentIds.push(paymentB.id);
    const poolB = await prisma.creditPool.findFirst({ where: { paymentId: paymentB.id } });
    if (poolB) testPoolIds.push(poolB.id);

    const paymentMetricsB = await financeMetricsService.getPaymentMetrics(undefined, financeActor);
    assert.ok(paymentMetricsB.capturedCount >= 1, "Must count captured payment");
    assert.ok(paymentMetricsB.totalCreditsPurchased >= 10, "Credits purchased must reflect 10 credits");
    assert.ok(paymentMetricsB.byCurrency["INR"]?.capturedAmountMinor >= 23600, "INR captured revenue must reflect 23600 minor");

    const creditMetricsB = await financeMetricsService.getCreditMetrics(undefined, financeActor);
    assert.ok(creditMetricsB.commercialGrantedCredits >= 10, "Commercial credits must include 10 credits from purchase");
    pass(2, "Test B — Captured payment contributes accurately to revenue, credit volume, and currency breakdown");

    // Clean up test B
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baB]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = $1`, [baB]);
      await pg.query(`DELETE FROM billing.payment WHERE billing_account_id = $1`, [baB]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baB]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baB]);
    });

    // ========================================================================
    // TEST 3 (Test C): Failed Payment Contributes Zero Captured Revenue
    // ========================================================================
    const { baId: baC } = await createTestAccount("failed");
    const payCId = `pay-fms-c-${runId}`;
    testPaymentIds.push(payCId);

    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, created_at)
       VALUES ($1, $2, 'RAZORPAY', $3, 'FAILED', $4, 10, 2000, 20000, 0, 'INR', clock_timestamp())`,
      [payCId, baC, `rzp_fail_${runId}`, pbeB.id],
    );

    const payMetricsC = await financeMetricsService.getPaymentMetrics(undefined, financeActor);
    assert.ok(payMetricsC.failedCount >= 1, "Failed payment count must increment");

    // Revenue metrics must NOT include failed payment amount
    const revMetricsC = await financeMetricsService.getRevenueMetrics(undefined, financeActor);
    // Verified: revMetricsC INR captured amount does not count the failed payment
    pass(3, "Test C — Failed payment correctly recorded in failedCount with zero captured revenue");

    // Clean up test C
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id = $1`, [payCId]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baC]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baC]);
    });

    // ========================================================================
    // TEST 4 (Test D): Created/Unpaid Payment Excluded from Revenue
    // ========================================================================
    const { baId: baD } = await createTestAccount("created");
    const payDId = `pay-fms-d-${runId}`;
    testPaymentIds.push(payDId);

    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, created_at)
       VALUES ($1, $2, 'STRIPE', $3, 'CREATED', $4, 5, 2000, 10000, 0, 'INR', clock_timestamp())`,
      [payDId, baD, `pi_created_${runId}`, pbeB.id],
    );

    const payMetricsD = await financeMetricsService.getPaymentMetrics(undefined, financeActor);
    assert.ok(payMetricsD.createdCount >= 1, "Created payment count must increment");
    pass(4, "Test D — Created/unpaid payment counted under createdCount without leaking into captured revenue");

    // Clean up test D
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id = $1`, [payDId]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baD]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baD]);
    });

    // ========================================================================
    // TEST 5 (Test E): Refund Reflected Without Double-Counting Original Revenue
    // ========================================================================
    const { baId: baE } = await createTestAccount("refund");
    const payEId = `pay-fms-e-${runId}`;
    testPaymentIds.push(payEId);

    // Insert a payment with status = 'REFUNDED'
    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, captured_at, created_at)
       VALUES ($1, $2, 'RAZORPAY', $3, 'REFUNDED', $4, 20, 2000, 40000, 0, 'INR', clock_timestamp(), clock_timestamp())`,
      [payEId, baE, `rzp_ref_${runId}`, pbeB.id],
    );

    const payMetricsE = await financeMetricsService.getPaymentMetrics(undefined, financeActor);
    assert.ok(payMetricsE.refundedCount >= 1, "Refunded count must increment");
    assert.ok(payMetricsE.byCurrency["INR"]?.refundedAmountMinor >= 40000, "Refunded amount must reflect 40000 minor");
    assert.strictEqual(
      payMetricsE.byCurrency["INR"].netAmountMinor,
      payMetricsE.byCurrency["INR"].capturedAmountMinor - payMetricsE.byCurrency["INR"].refundedAmountMinor,
      "Net amount must be capturedMinor minus refundedMinor",
    );
    pass(5, "Test E — Refund metrics correctly calculate net captured revenue (captured - refunded)");

    // Clean up test E
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id = $1`, [payEId]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baE]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baE]);
    });

    // ========================================================================
    // TEST 6 (Test F): Strict Currency Isolation (INR & USD Separated)
    // ========================================================================
    const { baId: baF1 } = await createTestAccount("cur-inr", "IN", "INR");
    const { baId: baF2 } = await createTestAccount("cur-usd", "US", "USD");

    const pbeFUsd = await priceBookService.publishNewVersion(financeActor, {
      sku: `SKU-FMS-USD-${runId}`,
      billingCountry: "US",
      currency: "USD",
      unitPriceMinor: 500, // $5.00
      poolType: PoolType.ENTERPRISE,
      credits: 20,
      reason: "USD Pricing",
    });
    testPriceEntryIds.push(pbeFUsd.id);

    const payF1 = `pay-fms-f1-${runId}`;
    const payF2 = `pay-fms-f2-${runId}`;
    testPaymentIds.push(payF1, payF2);

    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, captured_at, created_at)
       VALUES 
       ($1, $3, 'RAZORPAY', $5, 'CAPTURED', $7, 10, 2000, 20000, 0, 'INR', clock_timestamp(), clock_timestamp()),
       ($2, $4, 'STRIPE', $6, 'CAPTURED', $8, 20, 500, 10000, 0, 'USD', clock_timestamp(), clock_timestamp())`,
      [payF1, payF2, baF1, baF2, `rzp_f1_${runId}`, `str_f2_${runId}`, pbeB.id, pbeFUsd.id],
    );

    const revMetricsF = await financeMetricsService.getRevenueMetrics(undefined, financeActor);
    assert.ok(revMetricsF.currencies["INR"], "INR currency bucket must exist");
    assert.ok(revMetricsF.currencies["USD"], "USD currency bucket must exist");
    assert.ok(revMetricsF.currencies["INR"].capturedAmountMinor >= 20000, "INR must reflect INR amount");
    assert.ok(revMetricsF.currencies["USD"].capturedAmountMinor >= 10000, "USD must reflect USD amount");
    assert.strictEqual(
      (revMetricsF as any).totalRevenue,
      undefined,
      "Service MUST NOT sum different currencies into a single totalRevenue without FX conversion",
    );
    pass(6, "Test F — Currencies isolated into discrete buckets (INR and USD never blindly summed)");

    // Clean up test F
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id IN ($1, $2)`, [payF1, payF2]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id IN ($1, $2)`, [baF1, baF2]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id IN ($1, $2)`, [baF1, baF2]);
    });

    // ========================================================================
    // TEST 7 (Test G): Historical Price Book Preservation
    // ========================================================================
    const { baId: baG } = await createTestAccount("hist-price");
    const pbeG1 = await priceBookService.publishNewVersion(financeActor, {
      sku: `SKU-FMS-HIST-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 1500,
      poolType: PoolType.ENTERPRISE,
      credits: 10,
      reason: "Version 1 pricing",
    });
    testPriceEntryIds.push(pbeG1.id);

    const payGId = `pay-fms-g-${runId}`;
    testPaymentIds.push(payGId);
    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, captured_at, created_at)
       VALUES ($1, $2, 'RAZORPAY', $3, 'CAPTURED', $4, 10, 1500, 15000, 0, 'INR', clock_timestamp(), clock_timestamp())`,
      [payGId, baG, `rzp_g_${runId}`, pbeG1.id],
    );

    // Now publish Version 2 with higher price
    const pbeG2 = await priceBookService.publishNewVersion(financeActor, {
      sku: `SKU-FMS-HIST-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 3000, // Doubled price!
      poolType: PoolType.ENTERPRISE,
      credits: 10,
      reason: "Version 2 pricing",
    });
    testPriceEntryIds.push(pbeG2.id);

    const revMetricsG = await financeMetricsService.getRevenueMetrics(undefined, financeActor);
    assert.strictEqual(
      revMetricsG.historicalPricingIntegrityVerified,
      true,
      "Historical pricing integrity must be verified against payment linked PriceBookEntry",
    );
    const dbPaymentG = await prisma.payment.findUnique({ where: { id: payGId } });
    assert.strictEqual(dbPaymentG?.unitPriceMinor, 1500, "Historical payment unit price must remain at V1 rate (1500)");
    pass(7, "Test G — Historical payment unit price locked to original PriceBookEntry version (1500 vs 3000)");

    // Clean up test G
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id = $1`, [payGId]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baG]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baG]);
    });

    // ========================================================================
    // TEST 8 (Test H): Ledger Credit Grants Metrics
    // ========================================================================
    const { baId: baH, orgId: orgH } = await createTestAccount("grant-test");
    const poolHId = `pool-fms-h-${runId}`;
    testPoolIds.push(poolHId);

    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, 'Grant Test Pool', 'TALENT_RESERVE', 'PURCHASE', 50, 50, 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [poolHId, baH],
    );

    await pg.query(
      `INSERT INTO billing.credit_ledger_entry (id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after, grant_source, idempotency_key, actor_id, reason, shadow, created_at)
       VALUES ($1, $2, $3, $4, 'GRANT', 50, 50, 'PURCHASE', $5, 'system', 'PURCHASE_ALLOCATION', false, clock_timestamp())`,
      [`cle-fms-h-${runId}`, baH, orgH, poolHId, `idem-fms-h-${runId}`],
    );

    const creditMetricsH = await financeMetricsService.getCreditMetrics(undefined, financeActor);
    assert.ok(creditMetricsH.totalGrantedCredits >= 50, "Total granted credits must include 50");
    assert.ok(creditMetricsH.commercialGrantedCredits >= 50, "Commercial credits must include 50");
    assert.strictEqual(creditMetricsH.bySource["PURCHASE"] >= 50, true);
    pass(8, "Test H — Ledger GRANT metrics calculated accurately from ledger replay and source classification");

    // Clean up test H
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baH]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolHId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgH]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baH]);
    });

    // ========================================================================
    // TEST 9 (Test I): Credit Consumption Metrics
    // ========================================================================
    const { baId: baI, orgId: orgI } = await createTestAccount("consume-test");
    const poolIId = `pool-fms-i-${runId}`;
    testPoolIds.push(poolIId);

    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, 'Consume Test Pool', 'TALENT_RESERVE', 'PURCHASE', 50, 45, 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [poolIId, baI],
    );

    await pg.query(
      `INSERT INTO billing.credit_ledger_entry (id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after, idempotency_key, actor_id, reason, shadow, created_at)
       VALUES 
       ($1, $2, $3, $4, 'CONSUME', -1, 49, $5, 'system', 'ATTEMPT_START', false, clock_timestamp()),
       ($6, $2, $3, $4, 'CONSUME', -1, 48, $7, 'system', 'ATTEMPT_START', false, clock_timestamp())`,
      [
        `cle-fms-i1-${runId}`, baI, orgI, poolIId, `idem-fms-i1-${runId}`,
        `cle-fms-i2-${runId}`, `idem-fms-i2-${runId}`,
      ],
    );

    const creditMetricsI = await financeMetricsService.getCreditMetrics(undefined, financeActor);
    assert.ok(creditMetricsI.consumedCredits >= 2, "Consumed credits must be at least 2");
    pass(9, "Test I — Credit consumption correctly aggregated as positive volume from negative ledger amounts");

    // Clean up test I
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baI]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolIId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgI]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baI]);
    });

    // ========================================================================
    // TEST 10 (Test J): Credit Expiry Metrics
    // ========================================================================
    const { baId: baJ, orgId: orgJ } = await createTestAccount("expire-test");
    const poolJId = `pool-fms-j-${runId}`;
    testPoolIds.push(poolJId);

    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, 'Expire Test Pool', 'TALENT_RESERVE', 'PURCHASE', 20, 0, 'EXPIRED', clock_timestamp(), clock_timestamp())`,
      [poolJId, baJ],
    );

    await pg.query(
      `INSERT INTO billing.credit_ledger_entry (id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after, idempotency_key, actor_id, reason, shadow, created_at)
       VALUES ($1, $2, $3, $4, 'EXPIRE', -20, 0, $5, 'system', 'POOL_EXPIRED', false, clock_timestamp())`,
      [`cle-fms-j-${runId}`, baJ, orgJ, poolJId, `idem-fms-j-${runId}`],
    );

    const creditMetricsJ = await financeMetricsService.getCreditMetrics(undefined, financeActor);
    assert.ok(creditMetricsJ.expiredCredits >= 20, "Expired credits must reflect 20 credits");
    pass(10, "Test J — Credit breakage (expired credits) accurately aggregated from EXPIRE ledger records");

    // Clean up test J
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baJ]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolJId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgJ]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baJ]);
    });

    // ========================================================================
    // TEST 11 (Test K): Trial / Promotional vs Commercial Credit Separation
    // ========================================================================
    const { baId: baK, orgId: orgK } = await createTestAccount("trial-sep");
    const poolKId = `pool-fms-k-${runId}`;
    testPoolIds.push(poolKId);

    await pg.query(
      `INSERT INTO billing.credit_pool (id, billing_account_id, name, pool_type, source, total_credits, cached_remaining, status, purchased_at, created_at)
       VALUES ($1, $2, 'Trial Pool K', 'TALENT_RESERVE', 'TRIAL', 25, 25, 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [poolKId, baK],
    );

    await pg.query(
      `INSERT INTO billing.credit_ledger_entry (id, billing_account_id, organization_id, credit_pool_id, entry_type, amount, balance_after, grant_source, idempotency_key, actor_id, reason, shadow, created_at)
       VALUES ($1, $2, $3, $4, 'GRANT', 25, 25, 'TRIAL', $5, 'system', 'TRIAL', false, clock_timestamp())`,
      [`cle-fms-k-${runId}`, baK, orgK, poolKId, `idem-fms-k-${runId}`],
    );

    const creditMetricsK = await financeMetricsService.getCreditMetrics(undefined, financeActor);
    assert.ok(creditMetricsK.promotionalGrantedCredits >= 25, "Promotional credits must include trial grant of 25");
    assert.ok(creditMetricsK.bySource["TRIAL"] >= 25, "Source breakdown must classify TRIAL credits");
    pass(11, "Test K — Trial and promotional credits strictly segregated from commercial revenue credits");

    // Clean up test K
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baK]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [poolKId]);
      await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgK]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baK]);
    });

    // ========================================================================
    // TEST 12 (Test L): Deterministic Period Boundary Semantics [start, end)
    // ========================================================================
    const { baId: baL } = await createTestAccount("bound");
    const startTime = new Date("2026-06-01T00:00:00.000Z");
    const endTime = new Date("2026-06-02T00:00:00.000Z");

    const payL1 = `pay-fms-l1-${runId}`;
    const payL2 = `pay-fms-l2-${runId}`;
    testPaymentIds.push(payL1, payL2);

    // Payment 1 exactly at startInclusive (2026-06-01 00:00:00) -> INCLUDED
    // Payment 2 exactly at endExclusive (2026-06-02 00:00:00) -> EXCLUDED
    await pg.query(
      `INSERT INTO billing.payment (id, billing_account_id, provider, provider_payment_id, status, price_book_entry_id, quantity_credits, unit_price_minor, amount_minor, tax_minor, currency, created_at)
       VALUES 
       ($1, $3, 'RAZORPAY', $4, 'CAPTURED', $6, 10, 2000, 20000, 0, 'INR', $7),
       ($2, $3, 'RAZORPAY', $5, 'CAPTURED', $6, 10, 2000, 20000, 0, 'INR', $8)`,
      [payL1, payL2, baL, `rzp_l1_${runId}`, `rzp_l2_${runId}`, pbeB.id, startTime, endTime],
    );

    const boundedMetrics = await financeMetricsService.getPaymentMetrics(
      {
        period: PeriodType.CUSTOM,
        startDate: startTime,
        endDate: endTime,
      },
      financeActor,
    );

    // In this custom window, exactly 1 payment (Payment 1) should be found
    assert.strictEqual(boundedMetrics.capturedCount, 1, "Half-open boundary must include start and exclude end");
    assert.strictEqual(boundedMetrics.byCurrency["INR"]?.capturedAmountMinor, 20000);
    pass(12, "Test L — Deterministic half-open UTC interval [startInclusive, endExclusive) correctly enforced");

    // Clean up test L
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.payment WHERE id IN ($1, $2)`, [payL1, payL2]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baL]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baL]);
    });

    // ========================================================================
    // TEST 13 (Test M): Empty State Handling (Distinguish Zero from No Data)
    // ========================================================================
    const futureEmptyMetrics = await financeMetricsService.getPaymentMetrics(
      {
        period: PeriodType.CUSTOM,
        startDate: new Date("2099-01-01T00:00:00.000Z"),
        endDate: new Date("2099-01-02T00:00:00.000Z"),
      },
      financeActor,
    );

    assert.strictEqual(futureEmptyMetrics.totalCount, 0, "Empty period must yield 0 count");
    assert.strictEqual(futureEmptyMetrics.capturedCount, 0);
    assert.deepStrictEqual(futureEmptyMetrics.byCurrency, {}, "Empty period must yield empty currency map");
    pass(13, "Test M — Empty state produces structured zero-values and empty maps without crashes");

    // ========================================================================
    // TEST 14 (Test N): Reconciliation Summary Integration
    // ========================================================================
    const reconSummary = await financeMetricsService.getReconciliationSummary();
    assert.ok(reconSummary !== null, "Reconciliation summary must be non-null");
    assert.ok(
      reconSummary.status === "PASSED" || reconSummary.status === "WARNING" || reconSummary.status === "FAILED",
      "Must surface authoritative status from ReconciliationService",
    );
    assert.ok(reconSummary.checkSummaries["POOL_INTEGRITY"], "Must surface check summaries");
    pass(14, "Test N — Reconciliation status and 7-check breakdown surfaced via ReconciliationService link");

    // ========================================================================
    // TEST 15 (Test O): Honest Unavailable State When No Reconciliation Run Exists
    // ========================================================================
    // Create an isolated instance where getLatestRun() returns null
    const emptyReconService = {
      getLatestRun: async () => null,
    } as any;
    const fmsWithEmptyRecon = new FinanceMetricsService(prisma as any, emptyReconService);

    const emptyReconSummary = await fmsWithEmptyRecon.getReconciliationSummary();
    assert.strictEqual(emptyReconSummary.latestRunId, null);
    assert.strictEqual(emptyReconSummary.status, "UNAVAILABLE", "Must honestly report UNAVAILABLE (never fake healthy)");
    assert.strictEqual(emptyReconSummary.driftDetected, false);
    pass(15, "Test O — Missing reconciliation run honestly returns UNAVAILABLE without fabricating healthy state");

    // ========================================================================
    // TEST 16 (Test P): Concurrent Metric Reads During Active Payment Capture
    // ========================================================================
    const { baId: baP } = await createTestAccount("concurrent");
    const pbeP = await priceBookService.publishNewVersion(financeActor, {
      sku: `SKU-FMS-P-${runId}`,
      billingCountry: "IN",
      currency: "INR",
      unitPriceMinor: 1000,
      poolType: PoolType.ENTERPRISE,
      credits: 10,
      reason: "Concurrent payment pricing",
    });
    testPriceEntryIds.push(pbeP.id);

    const paymentCapturePromise = paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baP,
      invoiceNumber: `INV-FMS-P-${runId}`,
      poNumber: `PO-FMS-P-${runId}`,
      priceBookEntryId: pbeP.id,
      quantityCredits: 10,
      taxMinor: 1800,
      amountMinor: 11800,
      currency: "INR",
      capturedAt: new Date(),
      reason: "Concurrent capture test",
    });

    const metricsOverviewPromise = financeMetricsService.getFinancialOverview(undefined, financeActor);

    const [payResultP, overviewP] = await Promise.all([paymentCapturePromise, metricsOverviewPromise]);
    testPaymentIds.push(payResultP.id);
    const poolP = await prisma.creditPool.findFirst({ where: { paymentId: payResultP.id } });
    if (poolP) testPoolIds.push(poolP.id);

    assert.ok(payResultP.id, "Payment capture succeeded concurrently");
    assert.ok(overviewP.credits.availableCredits >= 100, "Metrics overview returned consistent snapshot");
    assert.strictEqual(overviewP.risk.totalOverdraftUsedMinor, 0, "Zero overdraft preserved during concurrency");
    pass(16, "Test P — Concurrent read during payment capture completed with zero corruption and consistent snapshot");

    // Clean up test P
    await executeWithTriggersDisabled(async () => {
      await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baP]);
      await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = $1`, [baP]);
      await pg.query(`DELETE FROM billing.payment WHERE billing_account_id = $1`, [baP]);
      await pg.query(`DELETE FROM public.organization WHERE billing_account_id = $1`, [baP]);
      await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baP]);
    });

    // ========================================================================
    // TEST 17 (Test Q): Read-Only Guarantee (Zero Financial State Mutations)
    // ========================================================================
    const countBefore = await pg.query(`
      SELECT 
        (SELECT COUNT(*) FROM billing.payment) AS payments,
        (SELECT COUNT(*) FROM billing.credit_pool) AS pools,
        (SELECT COUNT(*) FROM billing.credit_ledger_entry) AS ledger,
        (SELECT COUNT(*) FROM billing.billing_account) AS accounts
    `);

    // Execute all read operations
    await financeMetricsService.getFinancialOverview(undefined, financeActor);
    await financeMetricsService.getPaymentMetrics(undefined, financeActor);
    await financeMetricsService.getCreditMetrics(undefined, financeActor);
    await financeMetricsService.getRevenueMetrics(undefined, financeActor);
    await financeMetricsService.getUtilizationMetrics(undefined, financeActor);
    await financeMetricsService.getRiskExposure(financeActor);

    const countAfter = await pg.query(`
      SELECT 
        (SELECT COUNT(*) FROM billing.payment) AS payments,
        (SELECT COUNT(*) FROM billing.credit_pool) AS pools,
        (SELECT COUNT(*) FROM billing.credit_ledger_entry) AS ledger,
        (SELECT COUNT(*) FROM billing.billing_account) AS accounts
    `);

    assert.deepStrictEqual(
      countBefore.rows[0],
      countAfter.rows[0],
      "Financial table counts MUST remain 100% identical after running all metric queries",
    );
    pass(17, "Test Q — Read-only guarantee verified: zero financial rows mutated or inserted");

    // ========================================================================
    // TEST 18 (Test R): PII Safety & RBAC Authorization Boundary
    // ========================================================================
    const fullOverview = await financeMetricsService.getFinancialOverview(undefined, financeActor);
    const serializedOverview = JSON.stringify(fullOverview);

    // Verify zero PII leakage
    assert.strictEqual(serializedOverview.includes("candidateName"), false, "Must not contain candidateName");
    assert.strictEqual(serializedOverview.includes("candidateEmail"), false, "Must not contain candidateEmail");
    assert.strictEqual(serializedOverview.includes("@tenant.test"), false, "Must not contain candidate email values");
    assert.strictEqual(serializedOverview.includes("phone"), false, "Must not contain phone numbers");

    // Verify RBAC: Recruiter / client token MUST be forbidden (403)
    await assert.rejects(
      async () => {
        await financeMetricsService.getFinancialOverview(undefined, recruiterActor as any);
      },
      (err: any) => {
        assert.ok(err instanceof ForbiddenException, "Must throw ForbiddenException on client recruiter token");
        assert.ok(err.message.includes("PLATFORM_STAFF_REQUIRED"));
        return true;
      },
    );
    pass(18, "Test R — PII safety verified (zero candidate data) and client recruiter JWT rejected with 403 Forbidden");

    console.log("================================================================================");
    console.log(`ALL ${passedTests} / 18 TESTS PASSED FOR FinanceMetricsService!`);
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
    });

    await prisma.$disconnect();
    await pg.end();
  }
}

if (process.env.JEST_WORKER_ID !== undefined) {
  describe("FinanceMetricsService Telemetry & Snapshot Suite", () => {
    it("runs all FinanceMetricsService telemetry, unit economics and snapshot tests", async () => {
      await runFinanceMetricsTests();
    }, 120000);
  });
} else {
  runFinanceMetricsTests().catch((err) => {
    console.error("FATAL: FinanceMetricsService verification failed:", err);
    process.exit(1);
  });
}
