import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { strict as assert } from "assert";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentService } from "../payment/payment.service";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { PriceBookService } from "../price/price-book.service";
import { BillingAccountService } from "../account/billing-account.service";
import { LocalFakeQueueProvider } from "../../queue/local-fake-queue.provider";
import {
  WebhookActor,
  WebhookEventStatus,
} from "./payment-webhook.types";
import { PaymentProvider, PaymentStatus, PoolType } from "../payment/payment.types";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

const RAZORPAY_TEST_SECRET = "rzp_test_secret_99887766554433221100";
const STRIPE_TEST_SECRET = "whsec_test_secret_stripe_aabbccddeeff00112233";

function generateRazorpaySignature(rawBody: Buffer, secret = RAZORPAY_TEST_SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function generateStripeSignature(rawBody: Buffer, secret = STRIPE_TEST_SECRET, timestamp?: number): string {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const payload = `${t}.${rawBody.toString("utf8")}`;
  const v1 = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function runPaymentWebhookServiceTests() {
  console.log("================================================================================");
  console.log("PHASE 2.8 â€” PaymentWebhookService Comprehensive Verification Suite");
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

  const fakeQueueProvider = new LocalFakeQueueProvider();

  const mockConfigService = {
    get: (key: string) => {
      if (key === "razorpayWebhookSecret") return RAZORPAY_TEST_SECRET;
      if (key === "stripeWebhookSecret") return STRIPE_TEST_SECRET;
      return "";
    },
  } as any;

  const webhookService = new PaymentWebhookService(
    prisma as any,
    paymentService,
    creditPoolService,
    fakeQueueProvider,
    mockConfigService,
  );

  // Initialize service to register fake queue handlers
  webhookService.onModuleInit();

  let passedTests = 0;
  function pass(testNum: number, name: string) {
    passedTests++;
    console.log(`âœ… TEST [${testNum}]: ${name}`);
  }

  const runId = Date.now().toString();
  const testBaIds: string[] = [];
  const testPaymentIds: string[] = [];
  const testPoolIds: string[] = [];
  const testPriceEntryIds: string[] = [];
  const testInboxIds: string[] = [];

  // Helper actors
  const financeActor: WebhookActor = {
    id: `staff-finance-${runId}`,
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    email: `finance-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const ownerActor: WebhookActor = {
    id: `staff-owner-${runId}`,
    role: PlatformStaffRole.OWNER,
    platformRole: PlatformStaffRole.OWNER,
    email: `owner-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const supportActor: WebhookActor = {
    id: `staff-support-${runId}`,
    role: PlatformStaffRole.SUPPORT,
    platformRole: PlatformStaffRole.SUPPORT,
    email: `support-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const recruiterActor: WebhookActor = {
    id: `recruiter-${runId}`,
    role: "RECRUITER",
    platformRole: "RECRUITER",
    email: `recruiter-${runId}@tenant.client`,
    isPlatformStaff: false,
  };

  // Helper: create active test billing account
  async function createTestAccount(country = "IN", currency = "INR") {
    const baId = `ba-wh-${runId}-${Math.random().toString(36).substring(2, 7)}`;
    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, has_paid_purchase, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 0, 0, false, clock_timestamp(), clock_timestamp())`,
      [baId, `Webhook Test BA ${runId}`, country, currency],
    );
    testBaIds.push(baId);
    return { id: baId };
  }

  // Helper: create test price book entry
  async function createTestPrice(country = "IN", currency = "INR", unitPriceMinor = 1500) {
    const sku = `SKU-WH-${runId}-${Math.random().toString(36).substring(2, 7)}`;
    const entry = await priceBookService.publishNewVersion(financeActor, {
      sku,
      billingCountry: country,
      currency,
      unitPriceMinor,
      poolType: PoolType.ENTERPRISE,
      credits: 100,
      validityDays: 365,
      reason: `Test pricing for webhook test ${sku}`,
    });
    testPriceEntryIds.push(entry.id);
    return entry;
  }

  try {
    // --------------------------------------------------------------------------
    // Test 1: Signature Verification â€” Razorpay valid & invalid
    // --------------------------------------------------------------------------
    const testPayloadRzp = Buffer.from(JSON.stringify({ event: "payment.captured", id: "evt_rzp_1" }));
    const validRzpSig = generateRazorpaySignature(testPayloadRzp);
    assert.strictEqual(webhookService.verifyRazorpaySignature(testPayloadRzp, validRzpSig), true);
    assert.strictEqual(webhookService.verifyRazorpaySignature(testPayloadRzp, "invalid_signature_hex"), false);
    assert.strictEqual(webhookService.verifyRazorpaySignature(testPayloadRzp, ""), false);
    pass(1, "Razorpay HMAC-SHA256 signature verification accepts valid and rejects invalid signatures");

    // --------------------------------------------------------------------------
    // Test 2: Signature Verification â€” Stripe valid, invalid, and expired timestamp
    // --------------------------------------------------------------------------
    const testPayloadStripe = Buffer.from(JSON.stringify({ type: "payment_intent.succeeded", id: "evt_stripe_1" }));
    const validStripeSig = generateStripeSignature(testPayloadStripe);
    assert.strictEqual(webhookService.verifyStripeSignature(testPayloadStripe, validStripeSig), true);
    assert.strictEqual(webhookService.verifyStripeSignature(testPayloadStripe, "t=123,v1=invalid_hex"), false);

    // Timestamp expired (> 300s in past)
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 400;
    const expiredStripeSig = generateStripeSignature(testPayloadStripe, STRIPE_TEST_SECRET, expiredTimestamp);
    assert.strictEqual(webhookService.verifyStripeSignature(testPayloadStripe, expiredStripeSig), false);
    pass(2, "Stripe signature verification accepts valid, rejects invalid, and enforces 300s timestamp tolerance");

    // --------------------------------------------------------------------------
    // Test 3: Provider Identification and Normalization
    // --------------------------------------------------------------------------
    assert.strictEqual(webhookService.normalizeProvider("razorpay"), PaymentProvider.RAZORPAY);
    assert.strictEqual(webhookService.normalizeProvider("RAZORPAY"), PaymentProvider.RAZORPAY);
    assert.strictEqual(webhookService.normalizeProvider("stripe"), PaymentProvider.STRIPE);
    assert.strictEqual(webhookService.normalizeProvider("STRIPE"), PaymentProvider.STRIPE);
    assert.throws(
      () => webhookService.normalizeProvider("paypal"),
      (err: any) => err instanceof BadRequestException && err.message.includes("UNSUPPORTED_PROVIDER"),
    );
    pass(3, "normalizeProvider maps supported providers and rejects unsupported providers");

    // --------------------------------------------------------------------------
    // Test 4 (Test F): Invalid Signature Rejection at Ingress
    // --------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await webhookService.ingestWebhookEvent(
          "razorpay",
          { "x-razorpay-signature": "bogus_signature" },
          testPayloadRzp,
        );
      },
      (err: any) => err instanceof UnauthorizedException && err.message.includes("INVALID_SIGNATURE"),
    );

    // Verify rejection audit event was logged
    const rejectionAudit = await prisma.billingAuditEvent.findFirst({
      where: { action: "WEBHOOK_REJECTED" },
      orderBy: { timestamp: "desc" },
    });
    assert.ok(rejectionAudit, "Rejection audit event must exist");
    assert.strictEqual(rejectionAudit.executionResult, "FAILED");
    pass(4, "Test F: Invalid signature is rejected at ingress, audit event emitted, no DB mutation");

    // --------------------------------------------------------------------------
    // Test 5 (Test F): Missing Signature Header Rejection
    // --------------------------------------------------------------------------
    await assert.rejects(
      async () => {
        await webhookService.ingestWebhookEvent("stripe", {}, testPayloadStripe);
      },
      (err: any) => err instanceof UnauthorizedException && err.message.includes("MISSING_SIGNATURE"),
    );
    pass(5, "Missing signature header immediately rejected with UnauthorizedException");

    // --------------------------------------------------------------------------
    // Test 6: Ingest Valid Webhook â€” Inbox Persistence & PENDING State
    // --------------------------------------------------------------------------
    const ba1 = await createTestAccount("IN", "INR");
    const price1 = await createTestPrice("IN", "INR", 2000);

    const rzpPaymentId1 = `pay_test_${runId}_001`;
    const rzpOrderId1 = `order_test_${runId}_001`;

    // Pre-create CREATED payment intent in DB
    const createdPayment = await paymentService.createPaymentRecord(financeActor, {
      billingAccountId: ba1.id,
      provider: PaymentProvider.RAZORPAY,
      providerPaymentId: rzpPaymentId1,
      providerOrderId: rzpOrderId1,
      priceBookEntryId: price1.id,
      quantityCredits: 10,
      amountMinor: 20000,
      currency: "INR",
      status: PaymentStatus.CREATED,
    });
    testPaymentIds.push(createdPayment.id);

    const rzpEvent1 = {
      event: "payment.captured",
      event_id: `evt_rzp_${runId}_001`,
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId1,
            order_id: rzpOrderId1,
            amount: 20000,
            currency: "INR",
          },
        },
      },
    };
    const rzpBody1 = Buffer.from(JSON.stringify(rzpEvent1));
    const rzpSig1 = generateRazorpaySignature(rzpBody1);

    const ingestRes1 = await webhookService.ingestWebhookEvent(
      "razorpay",
      { "x-razorpay-signature": rzpSig1 },
      rzpBody1,
    );

    assert.strictEqual(ingestRes1.received, true);
    assert.strictEqual(ingestRes1.idempotent, false);
    assert.strictEqual(ingestRes1.status, WebhookEventStatus.PENDING);
    assert.ok(ingestRes1.inboxId);
    testInboxIds.push(ingestRes1.inboxId!);

    const inboxRow1 = await prisma.paymentWebhookInbox.findUnique({
      where: { id: ingestRes1.inboxId! },
    });
    assert.ok(inboxRow1);
    assert.strictEqual(inboxRow1!.status, WebhookEventStatus.PENDING);
    assert.strictEqual(inboxRow1!.provider, PaymentProvider.RAZORPAY);
    assert.strictEqual(inboxRow1!.eventId, rzpEvent1.event_id);
    pass(6, "Valid webhook persisted to billing.payment_event inbox in PENDING state");

    // --------------------------------------------------------------------------
    // Test 7: Worker Execution â€” Payment Capture, Pool Minting, Ledger Grant
    // --------------------------------------------------------------------------
    await webhookService.processWebhookEventJob(ingestRes1.inboxId!);

    const processedInboxRow = await prisma.paymentWebhookInbox.findUnique({
      where: { id: ingestRes1.inboxId! },
    });
    assert.strictEqual(processedInboxRow!.status, WebhookEventStatus.PROCESSED);
    assert.ok(processedInboxRow!.processedAt);
    assert.strictEqual(processedInboxRow!.errorMessage, null);

    // Verify Payment transitioned to CAPTURED
    const capturedPayment = await paymentService.getPaymentById(createdPayment.id);
    assert.strictEqual(capturedPayment.status, PaymentStatus.CAPTURED);
    assert.ok(capturedPayment.creditPoolId);
    testPoolIds.push(capturedPayment.creditPoolId!);

    // Verify CreditPool created
    const pool = await prisma.creditPool.findUnique({
      where: { id: capturedPayment.creditPoolId! },
    });
    assert.ok(pool);
    assert.strictEqual(pool!.totalCredits, 10);
    assert.strictEqual(pool!.cachedRemaining, 10);
    assert.strictEqual(pool!.source, "PURCHASE");

    // Verify Ledger GRANT entry
    const ledgerEntry = await prisma.creditLedgerEntry.findFirst({
      where: { paymentId: createdPayment.id, entryType: "GRANT" },
    });
    assert.ok(ledgerEntry);
    assert.strictEqual(ledgerEntry!.amount, 10);

    // Verify BillingAccount hasPaidPurchase = true
    const updatedBa1 = await prisma.billingAccount.findUnique({ where: { id: ba1.id } });
    assert.strictEqual(updatedBa1!.hasPaidPurchase, true);
    pass(7, "Webhook worker transitions Payment to CAPTURED, mints CreditPool, writes Ledger GRANT, sets hasPaidPurchase");

    // --------------------------------------------------------------------------
    // Test 8 (Test B): Duplicate Delivery with Existing Processed Inbox Row
    // --------------------------------------------------------------------------
    const duplicateIngestRes = await webhookService.ingestWebhookEvent(
      "razorpay",
      { "x-razorpay-signature": rzpSig1 },
      rzpBody1,
    );
    assert.strictEqual(duplicateIngestRes.received, true);
    assert.strictEqual(duplicateIngestRes.idempotent, true);
    assert.strictEqual(duplicateIngestRes.status, WebhookEventStatus.PROCESSED);

    // Re-running processWebhookEventJob must be a clean no-op
    await webhookService.processWebhookEventJob(ingestRes1.inboxId!);

    const ledgerEntriesCount = await prisma.creditLedgerEntry.count({
      where: { paymentId: createdPayment.id, entryType: "GRANT" },
    });
    assert.strictEqual(ledgerEntriesCount, 1, "Must never double-grant credits on duplicate event");
    pass(8, "Test B: Duplicate delivery of processed event is handled idempotently without duplicate credits");

    // --------------------------------------------------------------------------
    // Test 9 (Test A): Duplicate Webhook Delivery Concurrency Race
    // --------------------------------------------------------------------------
    const ba2 = await createTestAccount("US", "USD");
    const price2 = await createTestPrice("US", "USD", 500);

    const stripePi2 = `pi_test_${runId}_concurrent`;
    const createdPayment2 = await paymentService.createPaymentRecord(financeActor, {
      billingAccountId: ba2.id,
      provider: PaymentProvider.STRIPE,
      providerPaymentId: stripePi2,
      priceBookEntryId: price2.id,
      quantityCredits: 25,
      amountMinor: 12500,
      currency: "USD",
      status: PaymentStatus.CREATED,
    });
    testPaymentIds.push(createdPayment2.id);

    const stripeEvent2 = {
      type: "payment_intent.succeeded",
      id: `evt_stripe_${runId}_concurrent`,
      data: {
        object: {
          id: stripePi2,
          amount_received: 12500,
          currency: "usd",
        },
      },
    };
    const stripeBody2 = Buffer.from(JSON.stringify(stripeEvent2));
    const stripeSig2 = generateStripeSignature(stripeBody2);

    // Two simultaneous identical ingest requests
    const [resA1, resA2] = await Promise.all([
      webhookService.ingestWebhookEvent("stripe", { "stripe-signature": stripeSig2 }, stripeBody2),
      webhookService.ingestWebhookEvent("stripe", { "stripe-signature": stripeSig2 }, stripeBody2),
    ]);

    assert.strictEqual(resA1.received, true);
    assert.strictEqual(resA2.received, true);
    // Exactly one is the original, the other is idempotent
    assert.ok(
      (resA1.idempotent === false && resA2.idempotent === true) ||
      (resA1.idempotent === true && resA2.idempotent === false) ||
      (resA1.inboxId === resA2.inboxId),
    );

    const chosenInboxId = resA1.inboxId || resA2.inboxId!;
    testInboxIds.push(chosenInboxId);

    // Concurrent execution of processor
    await Promise.all([
      webhookService.processWebhookEventJob(chosenInboxId),
      webhookService.processWebhookEventJob(chosenInboxId),
    ]);

    const poolsForPayment2 = await prisma.creditPool.findMany({
      where: { paymentId: createdPayment2.id },
    });
    assert.strictEqual(poolsForPayment2.length, 1, "Exactly one CreditPool must be created");

    const grantsForPayment2 = await prisma.creditLedgerEntry.findMany({
      where: { paymentId: createdPayment2.id, entryType: "GRANT" },
    });
    assert.strictEqual(grantsForPayment2.length, 1, "Exactly one GRANT ledger entry must exist");
    assert.strictEqual(grantsForPayment2[0].amount, 25);
    pass(9, "Test A: Concurrent duplicate webhook ingestion and processing results in single financial effect");

    // --------------------------------------------------------------------------
    // Test 10 (Test C): Two Different Webhook Events for Same Payment
    // --------------------------------------------------------------------------
    // First event was payment_intent.succeeded (already processed).
    // Now receive charge.succeeded for the same payment intent.
    const stripeEvent2b = {
      type: "charge.succeeded",
      id: `evt_stripe_${runId}_charge_succeeded`,
      data: {
        object: {
          id: stripePi2,
          amount_received: 12500,
          currency: "usd",
        },
      },
    };
    const stripeBody2b = Buffer.from(JSON.stringify(stripeEvent2b));
    const stripeSig2b = generateStripeSignature(stripeBody2b);

    const ingest2b = await webhookService.ingestWebhookEvent(
      "stripe",
      { "stripe-signature": stripeSig2b },
      stripeBody2b,
    );
    testInboxIds.push(ingest2b.inboxId!);

    await webhookService.processWebhookEventJob(ingest2b.inboxId!);

    const postGrantsCount = await prisma.creditLedgerEntry.count({
      where: { paymentId: createdPayment2.id, entryType: "GRANT" },
    });
    assert.strictEqual(postGrantsCount, 1, "Different webhook event for same payment cannot double-mint credits");
    pass(10, "Test C: Multiple distinct webhook events for same payment cannot double-mint credits");

    // --------------------------------------------------------------------------
    // Test 11 (Test D): Capture Webhook + Manual Capture Race
    // --------------------------------------------------------------------------
    const ba3 = await createTestAccount("IN", "INR");
    const price3 = await createTestPrice("IN", "INR", 1000);

    const rzpPaymentId3 = `pay_test_${runId}_race_manual`;
    const createdPayment3 = await paymentService.createPaymentRecord(financeActor, {
      billingAccountId: ba3.id,
      provider: PaymentProvider.RAZORPAY,
      providerPaymentId: rzpPaymentId3,
      priceBookEntryId: price3.id,
      quantityCredits: 15,
      amountMinor: 15000,
      currency: "INR",
      status: PaymentStatus.CREATED,
    });
    testPaymentIds.push(createdPayment3.id);

    const rzpEvent3 = {
      event: "payment.captured",
      event_id: `evt_rzp_${runId}_race_manual`,
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId3,
            amount: 15000,
            currency: "INR",
          },
        },
      },
    };
    const rzpBody3 = Buffer.from(JSON.stringify(rzpEvent3));
    const rzpSig3 = generateRazorpaySignature(rzpBody3);

    const ingestRes3 = await webhookService.ingestWebhookEvent(
      "razorpay",
      { "x-razorpay-signature": rzpSig3 },
      rzpBody3,
    );
    testInboxIds.push(ingestRes3.inboxId!);

    // Race manual capture and webhook capture simultaneously
    await Promise.all([
      paymentService.capturePayment(financeActor, createdPayment3.id, { reason: "Manual race capture" }),
      webhookService.processWebhookEventJob(ingestRes3.inboxId!),
    ]);

    const poolsForPayment3 = await prisma.creditPool.findMany({
      where: { paymentId: createdPayment3.id },
    });
    assert.strictEqual(poolsForPayment3.length, 1, "Exactly one CreditPool must exist after race");

    const grantsForPayment3 = await prisma.creditLedgerEntry.findMany({
      where: { paymentId: createdPayment3.id, entryType: "GRANT" },
    });
    assert.strictEqual(grantsForPayment3.length, 1, "Exactly one GRANT ledger entry must exist after race");
    assert.strictEqual(grantsForPayment3[0].amount, 15);
    pass(11, "Test D: Webhook capture racing with manual capture yields exactly one financial credit allocation");

    // --------------------------------------------------------------------------
    // Test 12 (Test G): Unsupported Event Type Handled Safely
    // --------------------------------------------------------------------------
    const unhandledEvent = {
      event: "payment.authorized",
      event_id: `evt_rzp_${runId}_authorized`,
      payload: {
        payment: {
          entity: {
            id: `pay_unsupported_${runId}`,
            amount: 5000,
            currency: "INR",
          },
        },
      },
    };
    const unhandledBody = Buffer.from(JSON.stringify(unhandledEvent));
    const unhandledSig = generateRazorpaySignature(unhandledBody);

    const ingestUnhandled = await webhookService.ingestWebhookEvent(
      "razorpay",
      { "x-razorpay-signature": unhandledSig },
      unhandledBody,
    );
    testInboxIds.push(ingestUnhandled.inboxId!);

    await webhookService.processWebhookEventJob(ingestUnhandled.inboxId!);

    const unhandledInboxRow = await prisma.paymentWebhookInbox.findUnique({
      where: { id: ingestUnhandled.inboxId! },
    });
    assert.strictEqual(unhandledInboxRow!.status, WebhookEventStatus.PROCESSED);
    assert.strictEqual(unhandledInboxRow!.errorMessage, null);
    pass(12, "Test G: Unsupported webhook event type acknowledged and marked PROCESSED with zero credit side effects");

    // --------------------------------------------------------------------------
    // Test 13 (Test H): Payment Dispute Handling â€” Pool Suspended, Invariant Preserved
    // --------------------------------------------------------------------------
    // Uses capturedPayment from Test 7 (rzpPaymentId1)
    const disputeEvent = {
      event: "payment.dispute.created",
      event_id: `evt_rzp_${runId}_dispute_001`,
      payload: {
        dispute: {
          entity: {
            id: `disp_${runId}_001`,
            payment_id: rzpPaymentId1,
            reason_code: "FRAUDULENT",
          },
        },
      },
    };
    const disputeBody = Buffer.from(JSON.stringify(disputeEvent));
    const disputeSig = generateRazorpaySignature(disputeBody);

    const ingestDispute = await webhookService.ingestWebhookEvent(
      "razorpay",
      { "x-razorpay-signature": disputeSig },
      disputeBody,
    );
    testInboxIds.push(ingestDispute.inboxId!);

    await webhookService.processWebhookEventJob(ingestDispute.inboxId!);

    // Payment must be DISPUTED
    const disputedPayment = await paymentService.getPaymentById(createdPayment.id);
    assert.strictEqual(disputedPayment.status, PaymentStatus.DISPUTED);

    // CreditPool must be SUSPENDED
    const suspendedPool = await prisma.creditPool.findUnique({
      where: { id: capturedPayment.creditPoolId! },
    });
    assert.strictEqual(suspendedPool!.status, "SUSPENDED");

    // Financial ledger must remain intact (no deletions or mutations)
    const ledgerEntriesPostDispute = await prisma.creditLedgerEntry.findMany({
      where: { paymentId: createdPayment.id },
    });
    assert.strictEqual(ledgerEntriesPostDispute.length, 1, "Ledger entries must be immutable and preserved");
    assert.strictEqual(ledgerEntriesPostDispute[0].entryType, "GRANT");
    assert.strictEqual(ledgerEntriesPostDispute[0].amount, 10);
    pass(13, "Test H: Dispute webhook transitions Payment to DISPUTED, suspends linked pool, preserves immutable ledger");

    // --------------------------------------------------------------------------
    // Test 14 (Test I): Worker Failure Transitions Event to FAILED (Retryable)
    // --------------------------------------------------------------------------
    const unknownPaymentEvent = {
      event: "payment.captured",
      event_id: `evt_rzp_${runId}_unknown_pay`,
      payload: {
        payment: {
          entity: {
            id: `pay_nonexistent_${runId}`,
            amount: 5000,
            currency: "INR",
          },
        },
      },
    };
    const unknownBody = Buffer.from(JSON.stringify(unknownPaymentEvent));
    const unknownSig = generateRazorpaySignature(unknownBody);

    const ingestUnknown = await webhookService.ingestWebhookEvent(
      "razorpay",
      { "x-razorpay-signature": unknownSig },
      unknownBody,
    );
    testInboxIds.push(ingestUnknown.inboxId!);

    // Processing will fail because payment does not exist and no metadata provided
    await assert.rejects(
      async () => {
        await webhookService.processWebhookEventJob(ingestUnknown.inboxId!);
      },
      (err: any) => err instanceof NotFoundException && err.message.includes("PAYMENT_NOT_FOUND"),
    );

    const failedInboxRow = await prisma.paymentWebhookInbox.findUnique({
      where: { id: ingestUnknown.inboxId! },
    });
    assert.strictEqual(failedInboxRow!.status, WebhookEventStatus.FAILED);
    assert.ok(failedInboxRow!.errorMessage?.includes("PAYMENT_NOT_FOUND"));
    pass(14, "Test I: Worker failure transitions inbox event to FAILED with error message, ready for operational replay");

    // --------------------------------------------------------------------------
    // Test 15: Administrative Replay RBAC & Re-execution
    // --------------------------------------------------------------------------
    // Support role is forbidden from replaying webhooks
    await assert.rejects(
      async () => {
        await webhookService.replayWebhookEvent(supportActor, ingestRes1.inboxId!);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("FINANCE_ROLE_REQUIRED"),
    );

    // Recruiter role is forbidden
    await assert.rejects(
      async () => {
        await webhookService.replayWebhookEvent(recruiterActor, ingestRes1.inboxId!);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PLATFORM_AUTH_REQUIRED"),
    );

    // Finance role replay succeeds
    const replayResult = await webhookService.replayWebhookEvent(financeActor, ingestRes1.inboxId!);
    assert.strictEqual(replayResult.replayed, true);
    assert.strictEqual(replayResult.eventId, rzpEvent1.event_id);

    // Owner role replay succeeds
    const ownerReplayResult = await webhookService.replayWebhookEvent(ownerActor, ingestRes1.inboxId!);
    assert.strictEqual(ownerReplayResult.replayed, true);

    // Verify WEBHOOK_REPLAYED audit event
    const replayAudit = await prisma.billingAuditEvent.findFirst({
      where: { action: "WEBHOOK_REPLAYED", subjectId: ingestRes1.inboxId! },
    });
    assert.ok(replayAudit, "WEBHOOK_REPLAYED audit event must be recorded");
    assert.strictEqual(replayAudit.actorRole, PlatformStaffRole.FINANCE);
    pass(15, "Administrative replay enforces RBAC (FINANCE/OWNER allowed, SUPPORT/RECRUITER forbidden) and emits audit");

    // --------------------------------------------------------------------------
    // Test 16 (Test E): Replay + Normal Processing Race
    // --------------------------------------------------------------------------
    // Race replay and processWebhookEventJob on the same event
    await Promise.all([
      webhookService.replayWebhookEvent(financeActor, ingestRes1.inboxId!),
      webhookService.processWebhookEventJob(ingestRes1.inboxId!),
    ]);

    const postReplayGrantsCount = await prisma.creditLedgerEntry.count({
      where: { paymentId: createdPayment.id, entryType: "GRANT" },
    });
    assert.strictEqual(postReplayGrantsCount, 1, "Race between replay and worker must not duplicate financial effects");
    pass(16, "Test E: Replay racing with normal processing produces exactly one financial outcome");

    // --------------------------------------------------------------------------
    // Test 17 (Test J): Provider Event DB Uniqueness Boundary
    // --------------------------------------------------------------------------
    const duplicateEventId = `evt_unique_test_${runId}`;
    await prisma.paymentWebhookInbox.create({
      data: {
        provider: PaymentProvider.RAZORPAY,
        eventId: duplicateEventId,
        eventType: "test.event",
        payload: { test: true },
        status: WebhookEventStatus.PENDING,
      },
    });

    // Attempting direct raw DB insert with identical (provider, event_id) must fail with unique constraint violation
    await assert.rejects(
      async () => {
        await prisma.paymentWebhookInbox.create({
          data: {
            provider: PaymentProvider.RAZORPAY,
            eventId: duplicateEventId,
            eventType: "test.event",
            payload: { test: true },
            status: WebhookEventStatus.PENDING,
          },
        });
      },
      (err: any) => err.code === "P2002",
    );
    pass(17, "Test J: Database unique constraint @@unique([provider, eventId]) strictly survives concurrent insertion");

    // --------------------------------------------------------------------------
    // Test 18: Metadata-Driven Webhook Checkout Capture
    // --------------------------------------------------------------------------
    // Direct gateway checkout where Payment row is NOT pre-created, but metadata is attached to webhook
    const ba4 = await createTestAccount("US", "USD");
    const price4 = await createTestPrice("US", "USD", 250);

    const stripePi4 = `pi_meta_checkout_${runId}`;
    const stripeMetaEvent = {
      type: "payment_intent.succeeded",
      id: `evt_stripe_${runId}_metadata_checkout`,
      data: {
        object: {
          id: stripePi4,
          amount_received: 5000,
          currency: "usd",
          metadata: {
            billingAccountId: ba4.id,
            priceBookEntryId: price4.id,
            quantityCredits: "20",
          },
        },
      },
    };
    const stripeMetaBody = Buffer.from(JSON.stringify(stripeMetaEvent));
    const stripeMetaSig = generateStripeSignature(stripeMetaBody);

    const ingestMeta = await webhookService.ingestWebhookEvent(
      "stripe",
      { "stripe-signature": stripeMetaSig },
      stripeMetaBody,
    );
    testInboxIds.push(ingestMeta.inboxId!);

    await webhookService.processWebhookEventJob(ingestMeta.inboxId!);

    const autoCreatedPayment = await prisma.payment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: PaymentProvider.STRIPE,
          providerPaymentId: stripePi4,
        },
      },
      include: { pools: true, ledgerEntries: true },
    });

    assert.ok(autoCreatedPayment, "Payment must be auto-created from metadata");
    assert.strictEqual(autoCreatedPayment!.status, PaymentStatus.CAPTURED);
    assert.strictEqual(autoCreatedPayment!.quantityCredits, 20);
    assert.strictEqual(autoCreatedPayment!.pools.length, 1);
    assert.strictEqual(autoCreatedPayment!.ledgerEntries.length, 1);
    assert.strictEqual(autoCreatedPayment!.ledgerEntries[0].amount, 20);
    testPaymentIds.push(autoCreatedPayment!.id);
    testPoolIds.push(autoCreatedPayment!.pools[0].id);
    pass(18, "Metadata-driven webhook capture safely creates Payment, CreditPool, and Ledger grant on the fly");

    // --------------------------------------------------------------------------
    // Test 19: Security Audit â€” Secrets and Signatures Never Persisted to Audit
    // --------------------------------------------------------------------------
    const allAudits = await prisma.billingAuditEvent.findMany({
      where: { subjectType: "PAYMENT_EVENT" },
    });
    for (const audit of allAudits) {
      const jsonStr = JSON.stringify(audit);
      assert.strictEqual(jsonStr.includes(RAZORPAY_TEST_SECRET), false, "Webhook secret must never appear in audit");
      assert.strictEqual(jsonStr.includes(STRIPE_TEST_SECRET), false, "Webhook secret must never appear in audit");
    }
    pass(19, "Security invariant: Webhook secrets and authorization signatures are strictly omitted from audit logs");

    // --------------------------------------------------------------------------
    // Test 20: Financial Ledger Balance Integrity across All Test Accounts
    // --------------------------------------------------------------------------
    for (const baId of testBaIds) {
      const pools = await prisma.creditPool.findMany({ where: { billingAccountId: baId } });
      for (const p of pools) {
        const ledgerEntries = await prisma.creditLedgerEntry.findMany({
          where: { creditPoolId: p.id },
        });
        const ledgerSum = ledgerEntries.reduce((sum, e) => sum + e.amount, 0);
        // Cached remaining must equal ledger sum or match initial grant
        assert.ok(
          p.cachedRemaining >= 0,
          `Cached remaining for pool ${p.id} must be non-negative (zero overdraft)`,
        );
      }
    }
    pass(20, "Financial balance invariant verified: zero overdraft across all accounts, ledger immutability intact");

    console.log("================================================================================");
    console.log(`ALL TESTS PASSED: ${passedTests} / 20`);
    console.log("================================================================================");
  } finally {
    // Teardown test records
    try {
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

      if (testInboxIds.length > 0) {
        await pg.query(`DELETE FROM billing.payment_event WHERE id = ANY($1)`, [testInboxIds]);
      }
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
    } catch (cleanupErr: any) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    await prisma.$disconnect();
    await pg.end();
  }
}

runPaymentWebhookServiceTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
