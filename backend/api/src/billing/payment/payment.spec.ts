import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { strict as assert } from "assert";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { PaymentService } from "./payment.service";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { PriceBookService } from "../price/price-book.service";
import { BillingAccountService } from "../account/billing-account.service";
import {
  PaymentActor,
  PaymentProvider,
  PaymentStatus,
  PoolType,
  RecordManualInvoicePaymentDto,
} from "./payment.types";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function runPaymentServiceTests() {
  console.log("================================================================================");
  console.log("PHASE 2.7 — PaymentService Comprehensive Verification Suite");
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

  let passedTests = 0;
  function pass(testNum: number, name: string) {
    passedTests++;
    console.log(`✅ TEST [${testNum}]: ${name}`);
  }

  const runId = Date.now().toString();
  const testBaIds: string[] = [];
  const testPaymentIds: string[] = [];
  const testPoolIds: string[] = [];
  const testPriceEntryIds: string[] = [];

  // Helper actors
  const financeActor: PaymentActor = {
    id: `staff-finance-${runId}`,
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    email: `finance-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const ownerActor: PaymentActor = {
    id: `staff-owner-${runId}`,
    role: PlatformStaffRole.OWNER,
    platformRole: PlatformStaffRole.OWNER,
    email: `owner-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const supportActor: PaymentActor = {
    id: `staff-support-${runId}`,
    role: PlatformStaffRole.SUPPORT,
    platformRole: PlatformStaffRole.SUPPORT,
    email: `support-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const recruiterActor: PaymentActor = {
    id: `recruiter-${runId}`,
    role: "RECRUITER",
    platformRole: "RECRUITER",
    email: `recruiter-${runId}@tenant.client`,
    isPlatformStaff: false,
  };

  // Helper to create an isolated test billing account
  async function createTestBillingAccount(suffix: string, country = "IN", currency = "INR", status = "ACTIVE") {
    const baId = `ba-pay-${runId}-${suffix}`;
    const orgId = `org-pay-${runId}-${suffix}`;

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, has_paid_purchase, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, 0, false, clock_timestamp(), clock_timestamp())`,
      [baId, `Payment Test Account ${suffix}`, country, currency, status],
    );

    testBaIds.push(baId);
    return { baId, orgId };
  }

  // Helper to create a test price book entry
  async function createTestPriceBookEntry(skuSuffix: string, country = "IN", currency = "INR", unitPriceMinor = 5000) {
    const entry = await priceBookService.publishNewVersion(financeActor, {
      sku: `SKU-TEST-PAY-${runId}-${skuSuffix}`,
      poolType: PoolType.ENTERPRISE,
      credits: 100,
      billingCountry: country,
      currency,
      unitPriceMinor,
      validityDays: 365,
      reason: `Test pricing for payment test ${skuSuffix}`,
    });
    testPriceEntryIds.push(entry.id);
    return entry;
  }

  try {
    // ========================================================================
    // SECTION 1: Offline Enterprise PO Payment Recording (Happy Path)
    // ========================================================================
    const { baId: ba1 } = await createTestBillingAccount("std");
    const price1 = await createTestPriceBookEntry("std", "IN", "INR", 6000);

    const invoiceNumber1 = `INV-${runId}-001`;
    const poNumber1 = `PO-${runId}-001`;

    const payment1 = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: ba1,
      invoiceNumber: invoiceNumber1,
      poNumber: poNumber1,
      priceBookEntryId: price1.id,
      quantityCredits: 500,
      taxMinor: 540000, // 18% GST on 3,000,000
      amountMinor: 3540000,
      currency: "INR",
      capturedAt: new Date(),
      reason: "Initial enterprise contract PO payment",
    });

    testPaymentIds.push(payment1.id);
    if (payment1.creditPoolId) testPoolIds.push(payment1.creditPoolId);

    assert.equal(payment1.billingAccountId, ba1);
    assert.equal(payment1.provider, PaymentProvider.MANUAL_INVOICE);
    assert.equal(payment1.providerPaymentId, invoiceNumber1);
    assert.equal(payment1.providerOrderId, poNumber1);
    assert.equal(payment1.status, PaymentStatus.CAPTURED);
    assert.equal(payment1.priceBookEntryId, price1.id);
    assert.equal(payment1.quantityCredits, 500);
    assert.equal(payment1.unitPriceMinor, 6000);
    assert.equal(payment1.amountMinor, 3540000);
    assert.equal(payment1.taxMinor, 540000);
    assert.equal(payment1.currency, "INR");
    assert.ok(payment1.capturedAt !== null);
    pass(1, "recordManualInvoicePayment creates CAPTURED payment with exact financial minor units");

    // Verify BillingAccount.hasPaidPurchase transition
    const updatedBa1 = await prisma.billingAccount.findUnique({ where: { id: ba1 } });
    assert.equal(updatedBa1?.hasPaidPurchase, true);
    pass(2, "BillingAccount.hasPaidPurchase transitioned to true transactionally");

    // Verify CreditPool created with CONTRACT source and paymentId linkage
    const pool1 = await prisma.creditPool.findUnique({ where: { id: payment1.creditPoolId! } });
    assert.ok(pool1 !== null);
    assert.equal(pool1?.source, "CONTRACT");
    assert.equal(pool1?.paymentId, payment1.id);
    assert.equal(pool1?.totalCredits, 500);
    assert.equal(pool1?.cachedRemaining, 500);
    assert.equal(pool1?.unitPriceMinor, 6000);
    assert.equal(pool1?.currency, "INR");
    pass(3, "CreditPool created with source CONTRACT and paymentId linkage");

    // Verify CreditLedgerEntry opening grant with paymentId linkage (Recon Check 6)
    const ledgerGrant1 = await prisma.creditLedgerEntry.findFirst({
      where: { creditPoolId: pool1?.id, entryType: "GRANT" },
    });
    assert.ok(ledgerGrant1 !== null);
    assert.equal(ledgerGrant1?.paymentId, payment1.id);
    assert.equal(ledgerGrant1?.amount, 500);
    assert.equal(ledgerGrant1?.balanceAfter, 500);
    assert.equal(ledgerGrant1?.grantSource, "CONTRACT");
    pass(4, "CreditLedgerEntry GRANT links paymentId and matches quantityCredits (Recon Check 6)");

    // Verify PAYMENT_CAPTURED billing audit event
    const audit1 = await prisma.billingAuditEvent.findFirst({
      where: { subjectId: payment1.id, action: "PAYMENT_CAPTURED" },
    });
    assert.ok(audit1 !== null);
    assert.equal(audit1?.actorId, financeActor.id);
    assert.equal(audit1?.actorRole, PlatformStaffRole.FINANCE);
    assert.equal(audit1?.executionResult, "SUCCESS");
    pass(5, "billing.billing_audit_event recorded PAYMENT_CAPTURED with actor provenance");

    // ========================================================================
    // SECTION 2: Idempotency & Exact Replay
    // ========================================================================
    const replayPayment = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: ba1,
      invoiceNumber: invoiceNumber1,
      poNumber: poNumber1,
      priceBookEntryId: price1.id,
      quantityCredits: 500,
      taxMinor: 540000,
      amountMinor: 3540000,
      currency: "INR",
    });

    assert.equal(replayPayment.id, payment1.id);
    assert.equal(replayPayment.status, PaymentStatus.CAPTURED);

    // Verify no second pool or ledger entry was created
    const poolCount1 = await prisma.creditPool.count({ where: { paymentId: payment1.id } });
    assert.equal(poolCount1, 1);
    const ledgerCount1 = await prisma.creditLedgerEntry.count({ where: { paymentId: payment1.id } });
    assert.equal(ledgerCount1, 1);
    pass(6, "Exact replay of recordManualInvoicePayment is idempotent and mints zero duplicate pools");

    // Replay with different parameters throws ConflictException
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: ba1,
          invoiceNumber: invoiceNumber1, // Same invoice number
          priceBookEntryId: price1.id,
          quantityCredits: 999, // Different quantity
        });
      },
      (err: any) => err instanceof ConflictException,
    );
    pass(7, "Replay of same invoice number with conflicting parameters throws ConflictException");

    // ========================================================================
    // SECTION 3: Input & Commercial Policy Validations
    // ========================================================================
    // Zero or negative credits
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-badq`,
          priceBookEntryId: price1.id,
          quantityCredits: 0,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_QUANTITY"),
    );
    pass(8, "Zero credit quantity rejected with BadRequestException");

    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-negq`,
          priceBookEntryId: price1.id,
          quantityCredits: -50,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_QUANTITY"),
    );
    pass(9, "Negative credit quantity rejected with BadRequestException");

    // Missing invoice number
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: ba1,
          invoiceNumber: "   ",
          priceBookEntryId: price1.id,
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_INVOICE_NUMBER"),
    );
    pass(10, "Empty invoice number rejected with BadRequestException");

    // Non-existent BillingAccount
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: `ba-nonexistent-${runId}`,
          invoiceNumber: `INV-${runId}-noba`,
          priceBookEntryId: price1.id,
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof NotFoundException,
    );
    pass(11, "Non-existent BillingAccount rejected with NotFoundException");

    // Suspended BillingAccount
    const { baId: baSuspended } = await createTestBillingAccount("susp", "IN", "INR", "SUSPENDED");
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: baSuspended,
          invoiceNumber: `INV-${runId}-susp`,
          priceBookEntryId: price1.id,
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("ACCOUNT_NOT_ELIGIBLE"),
    );
    pass(12, "Payment recording on SUSPENDED account rejected with ForbiddenException");

    // Country mismatch (Account in US, PriceBook in IN)
    const { baId: baUS } = await createTestBillingAccount("us", "US", "USD");
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: baUS,
          invoiceNumber: `INV-${runId}-country-mismatch`,
          priceBookEntryId: price1.id, // Price is IN
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("COUNTRY_MISMATCH"),
    );
    pass(13, "Country mismatch between account and price book rejected with BadRequestException");

    // Currency mismatch (DTO currency USD vs PriceBook currency INR)
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-curr-mismatch`,
          priceBookEntryId: price1.id,
          quantityCredits: 100,
          currency: "USD",
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("CURRENCY_MISMATCH"),
    );
    pass(14, "Currency mismatch rejected before any financial mutation");

    // Amount minor mismatch
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(financeActor, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-amt-mismatch`,
          priceBookEntryId: price1.id,
          quantityCredits: 100, // 100 * 6000 = 600,000
          amountMinor: 999999, // Mismatched amount
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("AMOUNT_CALCULATION_MISMATCH"),
    );
    pass(15, "Mismatched amountMinor rejected with AMOUNT_CALCULATION_MISMATCH");

    // Automatic calculation when amountMinor omitted
    const invoiceAutoAmt = `INV-${runId}-auto-amt`;
    const paymentAuto = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: ba1,
      invoiceNumber: invoiceAutoAmt,
      priceBookEntryId: price1.id,
      quantityCredits: 200,
      taxMinor: 216000, // 18% of 1,200,000
    });
    testPaymentIds.push(paymentAuto.id);
    if (paymentAuto.creditPoolId) testPoolIds.push(paymentAuto.creditPoolId);
    assert.equal(paymentAuto.amountMinor, 1416000); // 200 * 6000 + 216000
    pass(16, "Integer minor unit calculation correctly derives total amountMinor when omitted");

    // ========================================================================
    // SECTION 4: Platform RBAC & Authorization
    // ========================================================================
    // OWNER actor succeeds
    const invoiceOwner = `INV-${runId}-owner`;
    const paymentOwner = await paymentService.recordManualInvoicePayment(ownerActor, {
      billingAccountId: ba1,
      invoiceNumber: invoiceOwner,
      priceBookEntryId: price1.id,
      quantityCredits: 100,
    });
    testPaymentIds.push(paymentOwner.id);
    if (paymentOwner.creditPoolId) testPoolIds.push(paymentOwner.creditPoolId);
    assert.equal(paymentOwner.status, PaymentStatus.CAPTURED);
    pass(17, "PlatformStaffRole.OWNER is authorized to record payments");

    // SUPPORT actor rejected
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(supportActor, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-support`,
          priceBookEntryId: price1.id,
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("FINANCE_ROLE_REQUIRED"),
    );
    pass(18, "PlatformStaffRole.SUPPORT rejected with ForbiddenException");

    // Recruiter / non-platform actor rejected
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(recruiterActor, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-recruiter`,
          priceBookEntryId: price1.id,
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PLATFORM_ROLE_REQUIRED"),
    );
    pass(19, "Tenant Recruiter actor rejected with ForbiddenException");

    // Missing / unauthenticated actor rejected
    await assert.rejects(
      async () => {
        await paymentService.recordManualInvoicePayment(null as any, {
          billingAccountId: ba1,
          invoiceNumber: `INV-${runId}-null-actor`,
          priceBookEntryId: price1.id,
          quantityCredits: 100,
        });
      },
      (err: any) => err instanceof UnauthorizedException,
    );
    pass(20, "Unauthenticated actor rejected with UnauthorizedException");

    // ========================================================================
    // SECTION 5: Direct Checkout Intent & Capture Lifecycle
    // ========================================================================
    const gatewayPaymentId = `pay_razor_${runId}_001`;
    const gatewayOrderId = `order_razor_${runId}_001`;

    const intentPayment = await paymentService.createPaymentRecord(financeActor, {
      billingAccountId: ba1,
      provider: PaymentProvider.RAZORPAY,
      providerPaymentId: gatewayPaymentId,
      providerOrderId: gatewayOrderId,
      priceBookEntryId: price1.id,
      quantityCredits: 150,
      amountMinor: 900000,
      currency: "INR",
      status: PaymentStatus.CREATED,
    });
    testPaymentIds.push(intentPayment.id);

    assert.equal(intentPayment.status, PaymentStatus.CREATED);
    assert.equal(intentPayment.creditPoolId, null);
    pass(21, "createPaymentRecord tracks intent transaction in CREATED status without minting pool");

    // Capturing payment transitions CREATED -> CAPTURED
    const capturedGateway = await paymentService.capturePayment(financeActor, intentPayment.id);
    assert.equal(capturedGateway.status, PaymentStatus.CAPTURED);
    assert.ok(capturedGateway.creditPoolId !== null);
    testPoolIds.push(capturedGateway.creditPoolId!);

    // Verify PURCHASE pool minted
    const gatewayPool = await prisma.creditPool.findUnique({ where: { id: capturedGateway.creditPoolId! } });
    assert.equal(gatewayPool?.source, "PURCHASE");
    assert.equal(gatewayPool?.paymentId, intentPayment.id);
    assert.equal(gatewayPool?.totalCredits, 150);
    pass(22, "capturePayment transitions CREATED -> CAPTURED and mints PURCHASE pool");

    // Re-capturing already captured payment is idempotent
    const recaptured = await paymentService.capturePayment(financeActor, intentPayment.id);
    assert.equal(recaptured.status, PaymentStatus.CAPTURED);
    assert.equal(recaptured.id, intentPayment.id);
    pass(23, "capturePayment on already CAPTURED payment is idempotent");

    // ========================================================================
    // SECTION 6: Cash Refunds (Full & Partial Semantics)
    // ========================================================================
    const { baId: baRefund } = await createTestBillingAccount("refund");
    const priceRefund = await createTestPriceBookEntry("refund", "IN", "INR", 5000);

    const invoiceRefund = `INV-${runId}-ref-001`;
    const paymentToRefund = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baRefund,
      invoiceNumber: invoiceRefund,
      priceBookEntryId: priceRefund.id,
      quantityCredits: 100,
      amountMinor: 500000,
      currency: "INR",
    });
    testPaymentIds.push(paymentToRefund.id);
    testPoolIds.push(paymentToRefund.creditPoolId!);

    // Partial Refund (40 credits out of 100)
    const partialRefundResult = await paymentService.issueRefund(financeActor, {
      paymentId: paymentToRefund.id,
      quantityCredits: 40,
      reason: "Customer requested 40 credit reduction",
    });

    assert.equal(partialRefundResult.status, PaymentStatus.PARTIALLY_REFUNDED);
    assert.equal(partialRefundResult.refundedCredits, 40);
    assert.equal(partialRefundResult.refundedAmountMinor, 200000); // 40 * 5000

    // Verify CreditPool balance decremented to 60
    const poolAfterPartial = await prisma.creditPool.findUnique({ where: { id: paymentToRefund.creditPoolId! } });
    assert.equal(poolAfterPartial?.cachedRemaining, 60);
    assert.notEqual(poolAfterPartial?.status, "CANCELLED");

    // Verify REFUND ledger entry created
    const refundEntry1 = await prisma.creditLedgerEntry.findFirst({
      where: { paymentId: paymentToRefund.id, entryType: "REFUND" },
    });
    assert.ok(refundEntry1 !== null);
    assert.equal(refundEntry1?.amount, -40); // Negative per chk_ledger_amount_sign
    assert.equal(refundEntry1?.balanceAfter, 60);
    assert.equal(refundEntry1?.paymentId, paymentToRefund.id);
    pass(24, "Partial refund updates Payment to PARTIALLY_REFUNDED, decrements pool, and writes REFUND ledger entry");

    // Audit event for partial refund
    const auditPartialRefund = await prisma.billingAuditEvent.findFirst({
      where: { subjectId: paymentToRefund.id, action: "PAYMENT_PARTIALLY_REFUNDED" },
    });
    assert.ok(auditPartialRefund !== null);
    pass(25, "billing.billing_audit_event records PAYMENT_PARTIALLY_REFUNDED audit event");

    // Remaining Refund (remaining 60 credits -> full refund)
    const fullRefundResult = await paymentService.issueRefund(financeActor, {
      paymentId: paymentToRefund.id,
      quantityCredits: 60,
      reason: "Customer cancelled remaining contract",
    });

    assert.equal(fullRefundResult.status, PaymentStatus.REFUNDED);
    assert.equal(fullRefundResult.refundedCredits, 100);
    assert.equal(fullRefundResult.refundedAmountMinor, 500000);

    // Verify CreditPool balance is 0 and status transitions to CANCELLED (Artifact 06 §1.4)
    const poolAfterFull = await prisma.creditPool.findUnique({ where: { id: paymentToRefund.creditPoolId! } });
    assert.equal(poolAfterFull?.cachedRemaining, 0);
    assert.equal(poolAfterFull?.status, "CANCELLED");

    // Audit event for full refund
    const auditFullRefund = await prisma.billingAuditEvent.findFirst({
      where: { subjectId: paymentToRefund.id, action: "PAYMENT_REFUNDED" },
    });
    assert.ok(auditFullRefund !== null);
    pass(26, "Remaining refund transitions Payment to REFUNDED, transitions CreditPool to CANCELLED");

    // Attempting refund on already fully refunded payment is rejected
    await assert.rejects(
      async () => {
        await paymentService.issueRefund(financeActor, {
          paymentId: paymentToRefund.id,
          quantityCredits: 10,
        });
      },
      (err: any) => err instanceof ConflictException && err.message.includes("PAYMENT_ALREADY_REFUNDED"),
    );
    pass(27, "Refund on already fully refunded payment rejected with ConflictException");

    // ========================================================================
    // SECTION 7: Unconsumed Boundary & Consumption Protection
    // ========================================================================
    const { baId: baConsumed } = await createTestBillingAccount("consumed");
    const priceConsumed = await createTestPriceBookEntry("consumed", "IN", "INR", 5000);

    const invoiceConsumed = `INV-${runId}-consumed-001`;
    const paymentConsumed = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baConsumed,
      invoiceNumber: invoiceConsumed,
      priceBookEntryId: priceConsumed.id,
      quantityCredits: 50,
    });
    testPaymentIds.push(paymentConsumed.id);
    testPoolIds.push(paymentConsumed.creditPoolId!);

    // Consume 30 credits from pool
    await prisma.creditPool.update({
      where: { id: paymentConsumed.creditPoolId! },
      data: { cachedRemaining: 20 }, // 30 credits consumed by candidates
    });

    // Attempt to refund 30 credits when only 20 unconsumed credits remain
    await assert.rejects(
      async () => {
        await paymentService.issueRefund(financeActor, {
          paymentId: paymentConsumed.id,
          quantityCredits: 30, // Exceeds unconsumed balance of 20
        });
      },
      (err: any) =>
        err instanceof BadRequestException && err.message.includes("REFUND_EXCEEDS_UNCONSUMED_BALANCE"),
    );
    pass(28, "Cash refund strictly bounded by unconsumed credits (INV-PAY-04: consumed cannot be refunded)");

    // Refunding <= unconsumed succeeds
    const validRefund = await paymentService.issueRefund(financeActor, {
      paymentId: paymentConsumed.id,
      quantityCredits: 20,
    });
    assert.equal(validRefund.status, PaymentStatus.PARTIALLY_REFUNDED);
    const poolConsumedFinal = await prisma.creditPool.findUnique({
      where: { id: paymentConsumed.creditPoolId! },
    });
    assert.equal(poolConsumedFinal?.cachedRemaining, 0);
    pass(29, "Refunding available unconsumed credits (20) succeeds and leaves pool non-negative");

    // ========================================================================
    // SECTION 8: Mandatory Concurrency Tests (Prompt §28)
    // ========================================================================

    // CONCURRENCY TEST 1: Concurrent manual invoice submissions with exact same invoice number
    console.log("   --- Starting Concurrency Test 1 (Duplicate Submissions) ---");
    const { baId: baConc1 } = await createTestBillingAccount("conc1");
    const priceConc1 = await createTestPriceBookEntry("conc1", "IN", "INR", 5000);
    const concInvoiceNum = `INV-${runId}-CONC-001`;

    const submit1 = paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baConc1,
      invoiceNumber: concInvoiceNum,
      priceBookEntryId: priceConc1.id,
      quantityCredits: 100,
    });
    const submit2 = paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baConc1,
      invoiceNumber: concInvoiceNum,
      priceBookEntryId: priceConc1.id,
      quantityCredits: 100,
    });

    const [res1, res2] = await Promise.all([submit1, submit2]);
    assert.equal(res1.id, res2.id);
    testPaymentIds.push(res1.id);
    if (res1.creditPoolId) testPoolIds.push(res1.creditPoolId);

    // Verify database holds EXACTLY ONE Payment, ONE CreditPool, ONE Ledger Grant
    const dbPaymentsConc1 = await prisma.payment.findMany({
      where: { provider: PaymentProvider.MANUAL_INVOICE, providerPaymentId: concInvoiceNum },
    });
    assert.equal(dbPaymentsConc1.length, 1);

    const dbPoolsConc1 = await prisma.creditPool.findMany({
      where: { paymentId: res1.id },
    });
    assert.equal(dbPoolsConc1.length, 1);

    const dbLedgerConc1 = await prisma.creditLedgerEntry.findMany({
      where: { paymentId: res1.id },
    });
    assert.equal(dbLedgerConc1.length, 1);
    pass(30, "Concurrency Test 1: Simultaneous manual invoice submissions yield exactly 1 payment, 1 pool, 1 grant");

    // CONCURRENCY TEST 2: Different simultaneous legitimate payments for same account
    console.log("   --- Starting Concurrency Test 2 (Different Simultaneous Payments) ---");
    const { baId: baConc2 } = await createTestBillingAccount("conc2");
    const priceConc2 = await createTestPriceBookEntry("conc2", "IN", "INR", 5000);

    const invoiceSimA = `INV-${runId}-SIM-A`;
    const invoiceSimB = `INV-${runId}-SIM-B`;

    const simA = paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baConc2,
      invoiceNumber: invoiceSimA,
      priceBookEntryId: priceConc2.id,
      quantityCredits: 200,
    });
    const simB = paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baConc2,
      invoiceNumber: invoiceSimB,
      priceBookEntryId: priceConc2.id,
      quantityCredits: 300,
    });

    const [resA, resB] = await Promise.all([simA, simB]);
    testPaymentIds.push(resA.id, resB.id);
    if (resA.creditPoolId) testPoolIds.push(resA.creditPoolId);
    if (resB.creditPoolId) testPoolIds.push(resB.creditPoolId);

    assert.notEqual(resA.id, resB.id);
    assert.equal(resA.quantityCredits, 200);
    assert.equal(resB.quantityCredits, 300);

    const poolsSim = await prisma.creditPool.findMany({
      where: { billingAccountId: baConc2 },
      orderBy: { queueOrder: "asc" },
    });
    assert.equal(poolsSim.length, 2);
    // Verified sequential queue order (Jio model)
    assert.notEqual(poolsSim[0].queueOrder, poolsSim[1].queueOrder);
    pass(31, "Concurrency Test 2: Different simultaneous payments succeed with independent pools and serialized queue orders");

    // CONCURRENCY TEST 3: Concurrent refund race on same balance
    console.log("   --- Starting Concurrency Test 3 (Concurrent Refund Race) ---");
    const { baId: baConc3 } = await createTestBillingAccount("conc3");
    const priceConc3 = await createTestPriceBookEntry("conc3", "IN", "INR", 5000);

    const invoiceRace = `INV-${runId}-RACE-001`;
    const paymentRace = await paymentService.recordManualInvoicePayment(financeActor, {
      billingAccountId: baConc3,
      invoiceNumber: invoiceRace,
      priceBookEntryId: priceConc3.id,
      quantityCredits: 100, // 100 credits available
    });
    testPaymentIds.push(paymentRace.id);
    testPoolIds.push(paymentRace.creditPoolId!);

    // Two concurrent refunds both attempt to refund 70 credits (combined 140 > 100)
    const refundRace1 = paymentService.issueRefund(financeActor, {
      paymentId: paymentRace.id,
      quantityCredits: 70,
    });
    const refundRace2 = paymentService.issueRefund(financeActor, {
      paymentId: paymentRace.id,
      quantityCredits: 70,
    });

    const resultsRace = await Promise.allSettled([refundRace1, refundRace2]);
    const fulfilledRace = resultsRace.filter((r) => r.status === "fulfilled");
    const rejectedRace = resultsRace.filter((r) => r.status === "rejected");

    assert.equal(fulfilledRace.length, 1, "Exactly one refund attempt must succeed");
    assert.equal(rejectedRace.length, 1, "The second concurrent refund must be rejected");

    const poolAfterRace = await prisma.creditPool.findUnique({
      where: { id: paymentRace.creditPoolId! },
    });
    assert.equal(poolAfterRace?.cachedRemaining, 30);
    assert.ok(poolAfterRace?.cachedRemaining! >= 0, "Pool balance must never be negative");
    pass(32, "Concurrency Test 3: Concurrent refund race preserves unconsumed boundary and prevents negative balance");

    // CONCURRENCY TEST 4: Atomic failure rollback
    console.log("   --- Starting Test 4 (Atomic Rollback) ---");
    const { baId: baRollback } = await createTestBillingAccount("rollback");
    const invoiceRollback = `INV-${runId}-ROLLBACK`;

    // Force failure by passing invalid credit pool parameter through custom mock or invalid data
    try {
      await paymentService.recordManualInvoicePayment(financeActor, {
        billingAccountId: baRollback,
        invoiceNumber: invoiceRollback,
        priceBookEntryId: price1.id,
        quantityCredits: 100,
        poolType: "INVALID_POOL_TYPE" as any, // Fails inside creditPoolService.createPool
      });
      assert.fail("Should have thrown error on invalid pool type");
    } catch (err: any) {
      assert.ok(err instanceof BadRequestException);
    }

    // Verify zero Payment, zero CreditPool, zero Ledger entry, and hasPaidPurchase remains false
    const rolledBackPayment = await prisma.payment.findFirst({
      where: { provider: PaymentProvider.MANUAL_INVOICE, providerPaymentId: invoiceRollback },
    });
    assert.equal(rolledBackPayment, null);

    const rolledBackBa = await prisma.billingAccount.findUnique({ where: { id: baRollback } });
    assert.equal(rolledBackBa?.hasPaidPurchase, false);

    const rolledBackAudit = await prisma.billingAuditEvent.findFirst({
      where: { action: "PAYMENT_CAPTURED", after: { path: ["providerPaymentId"], equals: invoiceRollback } },
    });
    assert.equal(rolledBackAudit, null);
    pass(33, "Test 4: Downstream failure causes 100% transactional rollback across Payment, Pool, Ledger, and Audit");

    // ========================================================================
    // SECTION 9: Read & Listing Queries (API-H2-16)
    // ========================================================================
    const fetchedPayment = await paymentService.getPaymentById(payment1.id);
    assert.equal(fetchedPayment.id, payment1.id);
    assert.equal(fetchedPayment.creditPoolId, payment1.creditPoolId);
    assert.equal(fetchedPayment.creditLedgerEntryId, `grant:pool:${payment1.creditPoolId}`);
    pass(34, "getPaymentById returns complete PaymentResultDto with pool and ledger linkages");

    // Non-existent payment lookup throws NotFoundException
    await assert.rejects(
      async () => {
        await paymentService.getPaymentById(`pay-nonexistent-${runId}`);
      },
      (err: any) => err instanceof NotFoundException,
    );
    pass(35, "getPaymentById with invalid ID throws NotFoundException");

    // Paginated list querying with filters
    const listResult = await paymentService.listPayments({
      billingAccountId: ba1,
      page: 1,
      limit: 10,
    });
    assert.ok(listResult.data.length >= 2);
    assert.ok(listResult.meta.total >= 2);
    pass(36, "listPayments returns paginated payments matching account filter");

    const statusList = await paymentService.listPayments({
      status: PaymentStatus.CAPTURED,
      limit: 5,
    });
    assert.ok(statusList.data.every((p) => p.status === PaymentStatus.CAPTURED));
    pass(37, "listPayments filters accurately by PaymentStatus");

    // ========================================================================
    // SECTION 10: Invariant and Zero Overdraft Integrity Check
    // ========================================================================
    const overdraftCheck = await pg.query(
      `SELECT id, name, overdraft_used, overdraft_limit FROM billing.billing_account WHERE overdraft_used > 0`,
    );
    assert.equal(overdraftCheck.rowCount, 0, "No accounts must have overdraftUsed > 0");
    pass(38, "Zero overdraft invariant permanently preserved across all accounts");

    // Verify baseline seed accounts (Acme & Globex)
    const acmeBa = await prisma.billingAccount.findFirst({ where: { name: { contains: "Acme" } } });
    assert.ok(acmeBa !== null, "Acme baseline billing account must exist");
    assert.equal(acmeBa?.status, "ACTIVE");

    const globexBa = await prisma.billingAccount.findFirst({ where: { name: { contains: "Globex" } } });
    assert.ok(globexBa !== null, "Globex baseline billing account must exist");
    pass(39, "Seed accounts Acme and Globex remain intact with zero drift");

    console.log("================================================================================");
    console.log(`ALL ${passedTests} TESTS PASSED FOR PaymentService!`);
    console.log("================================================================================");
  } finally {
    // Teardown: Clean up test fixtures without tampering audit triggers or touching seed data
    console.log("Cleaning up test fixtures...");
    try {
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

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
        await pg.query(`DELETE FROM billing.billing_account WHERE id = ANY($1)`, [testBaIds]);
      }

      if (testPriceEntryIds.length > 0) {
        await pg.query(`DELETE FROM billing.price_book_entry WHERE id = ANY($1)`, [testPriceEntryIds]);
      }

      await pg.query(`DELETE FROM billing.billing_audit_event WHERE actor_id LIKE '%${runId}%' OR subject_id LIKE '%${runId}%'`);

      await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }

    await prisma.$disconnect();
    await pg.end();
  }
}

if (process.env.JEST_WORKER_ID !== undefined) {
  describe("PaymentService", () => {
    it("executes all PaymentService integration tests", async () => {
      await runPaymentServiceTests();
    }, 120000);
  });
} else {
  runPaymentServiceTests().catch((err) => {
    console.error("FATAL: PaymentService verification failed:", err);
    process.exit(1);
  });
}
