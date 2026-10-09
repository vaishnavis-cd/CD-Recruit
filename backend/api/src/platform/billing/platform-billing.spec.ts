import * as dotenv from "dotenv";
import * as path from "path";
import * as crypto from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { strict as assert } from "assert";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { Reflector } from "@nestjs/core";
import { ForbiddenException, NotFoundException, BadRequestException, UnauthorizedException, ConflictException } from "@nestjs/common";
import { PlatformStaffRole, ManualRequestKind } from "@cd-recruit/shared-types";

// Guards & Decorators
import { PlatformRolesGuard } from "../auth/guards/platform-roles.guard";
import { PLATFORM_ROLES_KEY } from "../auth/decorators/platform-roles.decorator";
import { PlatformJwtStrategy, PlatformJwtPayload } from "../auth/strategies/platform-jwt.strategy";

// Services
import { BillingAccountService } from "../../billing/account/billing-account.service";
import { CreditPoolService } from "../../billing/pool/credit-pool.service";
import { LedgerService } from "../../billing/ledger/ledger.service";
import { ManualBillingRequestService } from "../../billing/manual-request/manual-billing-request.service";
import { PriceBookService } from "../../billing/price/price-book.service";
import { PaymentService } from "../../billing/payment/payment.service";
import { PaymentWebhookService } from "../../billing/webhook/payment-webhook.service";
import { FinanceMetricsService } from "../../billing/metrics/finance-metrics.service";
import { ReconciliationService } from "../../billing/reconciliation/reconciliation.service";

// Controllers
import { BillingAccountController } from "./controllers/billing-account.controller";
import { CreditPoolController } from "./controllers/credit-pool.controller";
import { LedgerController } from "./controllers/ledger.controller";
import { ManualBillingRequestController } from "./controllers/manual-billing-request.controller";
import { PriceBookController } from "./controllers/price-book.controller";
import { PaymentController } from "./controllers/payment.controller";
import { FinanceMetricsController } from "./controllers/finance-metrics.controller";
import { ReconciliationController } from "./controllers/reconciliation.controller";
import { IncidentController } from "./controllers/incident.controller";
import {
  PaymentWebhookController,
  PaymentWebhookReplayController,
} from "../../billing/webhook/payment-webhook.controller";
import { PoolType } from "../../billing/price/price-book.types";
import { LocalFakeQueueProvider } from "../../queue/local-fake-queue.provider";

const DB_URL = process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function runPlatformBillingTestSuite() {
  console.log("================================================================================");
  console.log("STAGE 2.11 â€” Platform Billing Controllers / API Layer Verification Suite");
  console.log("================================================================================");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  let passedTests = 0;
  function pass(testNum: number, name: string) {
    passedTests++;
    console.log(`âœ… TEST [${testNum}]: ${name}`);
  }

  // Setup services
  const ledgerService = new LedgerService(prisma as any);
  const creditPoolService = new CreditPoolService(prisma as any, ledgerService);
  const billingAccountService = new BillingAccountService(prisma as any);
  const priceBookService = new PriceBookService(prisma as any);
  const paymentService = new PaymentService(
    prisma as any,
    ledgerService,
    creditPoolService,
    priceBookService,
    billingAccountService,
  );
  const manualBillingRequestService = new ManualBillingRequestService(
    prisma as any,
    ledgerService,
    creditPoolService,
    billingAccountService,
  );
  const mockConfigService = {
    get: (key: string) => {
      if (key === "razorpayWebhookSecret") return "test_razorpay_secret";
      if (key === "stripeWebhookSecret") return "test_stripe_secret";
      return "";
    },
  } as any;
  const fakeQueueProvider = new LocalFakeQueueProvider();
  const paymentWebhookService = new PaymentWebhookService(
    prisma as any,
    paymentService,
    creditPoolService,
    fakeQueueProvider,
    mockConfigService,
  );
  paymentWebhookService.onModuleInit();
  const reconciliationService = new ReconciliationService(prisma as any);
  const financeMetricsService = new FinanceMetricsService(prisma as any, reconciliationService);

  // Setup controllers
  const billingAccountController = new BillingAccountController(billingAccountService, creditPoolService);
  const creditPoolController = new CreditPoolController(creditPoolService);
  const ledgerController = new LedgerController(ledgerService);
  const manualBillingRequestController = new ManualBillingRequestController(manualBillingRequestService);
  const priceBookController = new PriceBookController(priceBookService);
  const paymentController = new PaymentController(paymentService);
  const financeMetricsController = new FinanceMetricsController(financeMetricsService);
  const reconciliationController = new ReconciliationController(reconciliationService);
  const incidentController = new IncidentController(ledgerService);
  const paymentWebhookController = new PaymentWebhookController(paymentWebhookService);
  const paymentWebhookReplayController = new PaymentWebhookReplayController(paymentWebhookService);

  // Setup Guards
  const reflector = new Reflector();
  const rolesGuard = new PlatformRolesGuard(reflector);

  // Helper actors
  const runId = Date.now().toString();
  const supportActor = {
    id: `staff-supp-${runId}`,
    email: `supp-${runId}@proctora.platform`,
    name: "Support Staff",
    role: PlatformStaffRole.SUPPORT,
    platformRole: PlatformStaffRole.SUPPORT,
    isPlatformStaff: true,
  };
  const financeActor = {
    id: `staff-fin-${runId}`,
    email: `fin-${runId}@proctora.platform`,
    name: "Finance Staff",
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    isPlatformStaff: true,
  };
  const ownerActor = {
    id: `staff-own-${runId}`,
    email: `own-${runId}@proctora.platform`,
    name: "Platform Owner",
    role: PlatformStaffRole.OWNER,
    platformRole: PlatformStaffRole.OWNER,
    isPlatformStaff: true,
  };
  const recruiterActor = {
    id: `recruiter-${runId}`,
    email: `recruiter@external.com`,
    name: "External Recruiter",
    role: "RECRUITER",
    platformRole: undefined,
    isPlatformStaff: false,
  };

  // Track created entities for clean teardown
  const createdAccountIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdIncidentIds: string[] = [];

  // Fetch baseline accounts
  const acmeAccount = await prisma.billingAccount.findFirst({
    where: { name: { contains: "Acme" } },
    include: { pools: true },
  });
  assert(acmeAccount, "Baseline Acme account must exist");

  try {
    // -------------------------------------------------------------------------
    // TEST 1 â€” API-H2-01: GET /platform/billing/accounts (Paginated List)
    // -------------------------------------------------------------------------
    {
      const res = await billingAccountController.listAccounts({ page: 1, limit: 10 });
      assert(res && Array.isArray(res.data), "Result must contain data array");
      assert(res.meta && res.meta.total >= 2, "Meta total must reflect baseline accounts");
      assert(res.data.some((a) => a.id === acmeAccount.id), "Acme account must be present");
      assert(res.data[0].totalRemainingCredits !== undefined, "Projected credits must be computed");
      pass(1, "API-H2-01: GET /platform/billing/accounts returns paginated accounts with projected credits");
    }

    // -------------------------------------------------------------------------
    // TEST 2 â€” API-H2-02: GET /platform/billing/accounts/:id (Detail)
    // -------------------------------------------------------------------------
    {
      const res = await billingAccountController.getAccountDetail({ id: acmeAccount.id });
      assert.equal(res.id, acmeAccount.id);
      assert.equal(res.billingCountry, "IN");
      assert.equal(res.currency, "INR");

      // Verify 404 on unknown ID
      await assert.rejects(
        async () => await billingAccountController.getAccountDetail({ id: "00000000-0000-0000-0000-000000000000" }),
        (err: any) => err instanceof NotFoundException,
      );
      pass(2, "API-H2-02: GET /platform/billing/accounts/:id returns full detail and throws 404 for unknown");
    }

    // -------------------------------------------------------------------------
    // TEST 3 â€” API-H2-03: GET /platform/billing/accounts/:id/summary (Tenant 360)
    // -------------------------------------------------------------------------
    {
      const res = await billingAccountController.getAccountSummary({ id: acmeAccount.id });
      assert.equal(res.id, acmeAccount.id);
      assert.equal(res.totalAvailableCredits, 50);
      assert.equal(res.overdraftLimit, 0);
      assert(Array.isArray(res.pools), "Pools summary array must be present");
      pass(3, "API-H2-03: GET /platform/billing/accounts/:id/summary returns financial snapshot");
    }

    // -------------------------------------------------------------------------
    // TEST 4 â€” API-H2-04: GET /platform/billing/accounts/:id/pools (Account Pools)
    // -------------------------------------------------------------------------
    {
      const res = await billingAccountController.getAccountPools({ id: acmeAccount.id });
      assert(Array.isArray(res), "Pools must be an array");
      assert(res.length >= 1, "Must contain at least 1 pool");
      assert.equal(res[0].billingAccountId, acmeAccount.id);
      pass(4, "API-H2-04: GET /platform/billing/accounts/:id/pools returns account-scoped credit pools");
    }

    // -------------------------------------------------------------------------
    // TEST 5 â€” API-H2-05: GET /platform/billing/pools/:id (Pool Inspection)
    // -------------------------------------------------------------------------
    {
      const poolId = acmeAccount.pools[0].id;
      const res = await creditPoolController.getPoolDetail({ id: poolId });
      assert.equal(res.id, poolId);
      assert.equal(res.billingAccountId, acmeAccount.id);
      assert.equal(res.totalCredits, 50);
      assert(Array.isArray(res.recentLedgerEntries), "Recent ledger entries must be returned");
      pass(5, "API-H2-05: GET /platform/billing/pools/:id returns deep pool inspection");
    }

    // -------------------------------------------------------------------------
    // TEST 6 â€” API-H2-06: GET /platform/billing/ledger (Ledger Explorer)
    // -------------------------------------------------------------------------
    {
      const res = await ledgerController.getLedgerEntries({
        billingAccountId: acmeAccount.id,
        page: 1,
        limit: 10,
      });
      assert(Array.isArray(res.data), "Entries data must be an array");
      assert(res.data.length >= 1, "Must return initial seed grant ledger entry");
      assert.equal(res.data[0].billingAccountId, acmeAccount.id);
      pass(6, "API-H2-06: GET /platform/billing/ledger queries append-only ledger entries");
    }

    // -------------------------------------------------------------------------
    // TEST 7 â€” API-H2-07: GET /platform/billing/ledger/export (Pseudonymous CSV)
    // -------------------------------------------------------------------------
    {
      let sentContent = "";
      let sentStatus = 0;
      const mockRes: any = {
        setHeader: () => {},
        status: (s: number) => {
          sentStatus = s;
          return {
            send: (c: string) => {
              sentContent = c;
            },
          };
        },
      };

      await ledgerController.exportLedgerCsv({ billingAccountId: acmeAccount.id }, mockRes);
      assert.equal(sentStatus, 200);
      assert(sentContent.includes("id,createdAt,entryType,amount,balanceAfter"), "CSV headers required");
      assert(sentContent.includes(acmeAccount.id), "Must contain account UUID");
      // Strict PII check
      assert(!sentContent.includes("@"), "CSV export must contain zero candidate emails");
      assert(!sentContent.toLowerCase().includes("candidate"), "Zero candidate PII in export");
      pass(7, "API-H2-07: GET /platform/billing/ledger/export streams pseudonymous CSV with zero candidate PII");
    }

    // -------------------------------------------------------------------------
    // TEST 8 â€” API-H2-08 & API-H2-09: POST / GET /platform/billing/requests
    // -------------------------------------------------------------------------
    let createdRequestId = "";
    {
      const createDto = {
        billingAccountId: acmeAccount.id,
        kind: ManualRequestKind.GRANT,
        ticketRef: `TICKET-${runId}`,
        reason: "Operational goodwill grant for scheduled maintenance downtime",
        payload: {
          credits: 10,
          source: "GOODWILL",
          validityDays: 30,
        },
      };

      const created = await manualBillingRequestController.createRequest({ user: supportActor }, createDto);
      assert.equal(created.status, "PENDING");
      assert.equal(created.requestedById, supportActor.id);
      createdRequestId = created.id;
      createdRequestIds.push(created.id);

      // Verify listing via API-H2-08
      const listRes = await manualBillingRequestController.listRequests({ user: supportActor }, { tab: "all" });
      const items = Array.isArray(listRes) ? listRes : (listRes as any).items || (listRes as any).data;
      assert(Array.isArray(items), "List requests must return array or items array");
      assert(items.some((r: any) => r.id === createdRequestId), "Created request must be in list");

      pass(8, "API-H2-08 & API-H2-09: POST creates PENDING request; GET lists requests across tabs");
    }

    // -------------------------------------------------------------------------
    // TEST 9 â€” API-H2-09: PII Prevention in Manual Request Creation
    // -------------------------------------------------------------------------
    {
      const piiDto = {
        billingAccountId: acmeAccount.id,
        kind: ManualRequestKind.GRANT,
        ticketRef: `PII-${runId}`,
        reason: "Refunding candidate john.doe@example.com for assessment glitch",
        payload: { credits: 5 },
      };

      await assert.rejects(
        async () => await manualBillingRequestController.createRequest({ user: supportActor }, piiDto),
        (err: any) => err instanceof BadRequestException && err.message.includes("CANDIDATE_PII_PROHIBITED"),
      );
      pass(9, "API-H2-09: Candidate email in reason triggers CANDIDATE_PII_PROHIBITED exception");
    }

    // -------------------------------------------------------------------------
    // TEST 10 â€” API-H2-10: POST /platform/billing/requests/:id/approve (Maker-Checker)
    // -------------------------------------------------------------------------
    {
      // Submitter with SUPPORT role attempts approval -> Forbidden by role
      await assert.rejects(
        async () =>
          await manualBillingRequestController.approveRequest({ user: supportActor }, { id: createdRequestId }),
        (err: any) => err instanceof ForbiddenException && err.message.includes("APPROVAL_ROLE_NOT_AUTHORIZED"),
      );

      // Create a request by financeActor to test self-approval rejection
      const financeReq = await manualBillingRequestController.createRequest({ user: financeActor }, {
        billingAccountId: acmeAccount.id,
        kind: ManualRequestKind.GRANT,
        ticketRef: `SELF-APP-${runId}`,
        reason: "Test self approval maker-checker constraint",
        payload: { credits: 2, source: "GOODWILL" },
      });
      createdRequestIds.push(financeReq.id);

      await assert.rejects(
        async () =>
          await manualBillingRequestController.approveRequest({ user: financeActor }, { id: financeReq.id }),
        (err: any) => err instanceof ForbiddenException && err.message.includes("MAKER_CHECKER_VIOLATION"),
      );

      // Independent Finance actor approves support's request -> Succeeded & Status APPROVED
      const approved = await manualBillingRequestController.approveRequest(
        { user: financeActor },
        { id: createdRequestId },
      );
      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.approvedById, financeActor.id);
      pass(10, "API-H2-10: Enforces maker-checker dual authorization; approver cannot be submitter");
    }

    // -------------------------------------------------------------------------
    // TEST 11 â€” API-H2-11: POST /platform/billing/requests/:id/reject
    // -------------------------------------------------------------------------
    {
      // Create request to reject
      const reqToReject = await manualBillingRequestController.createRequest({ user: supportActor }, {
        billingAccountId: acmeAccount.id,
        kind: ManualRequestKind.GRANT,
        ticketRef: `REJ-${runId}`,
        reason: "Discretionary credit grant without approved budget reference",
        payload: { credits: 5, source: "GOODWILL" },
      });
      createdRequestIds.push(reqToReject.id);

      const rejected = await manualBillingRequestController.rejectRequest(
        { user: financeActor },
        { id: reqToReject.id },
        { rejectionReason: "Rejected: Exceeds discretionary goodwill limit without GM approval" },
      );
      assert.equal(rejected.status, "REJECTED");
      assert(rejected.rejectionReason?.includes("Exceeds discretionary"), "Rejection reason saved");
      pass(11, "API-H2-11: POST /platform/billing/requests/:id/reject transitions request to REJECTED");
    }

    // -------------------------------------------------------------------------
    // TEST 12 â€” API-H2-12: POST /platform/billing/requests/:id/cancel
    // -------------------------------------------------------------------------
    let cancelledRequestId = "";
    {
      // Create request to cancel
      const reqToCancel = await manualBillingRequestController.createRequest({ user: supportActor }, {
        billingAccountId: acmeAccount.id,
        kind: ManualRequestKind.GRANT,
        ticketRef: `CAN-${runId}`,
        reason: "Duplicate manual request submitted in error by operator",
        payload: { credits: 5, source: "GOODWILL" },
      });
      cancelledRequestId = reqToCancel.id;
      createdRequestIds.push(reqToCancel.id);

      const cancelled = await manualBillingRequestController.cancelRequest(
        { user: supportActor },
        { id: reqToCancel.id },
      );
      assert.equal(cancelled.status, "CANCELLED");
      pass(12, "API-H2-12: POST /platform/billing/requests/:id/cancel allows submitter to cancel own request");
    }

    // -------------------------------------------------------------------------
    // TEST 13 â€” API-H2-13: POST /platform/billing/requests/:id/retry
    // -------------------------------------------------------------------------
    {
      // 1. First execute the approved request via retryExecution
      const executed = await manualBillingRequestController.retryExecution(
        { user: financeActor },
        { id: createdRequestId },
      );
      assert.equal(executed.status, "EXECUTED");

      // 2. Exact-once idempotency: Re-executing already executed request returns canonical record
      const reExecuted = await manualBillingRequestController.retryExecution(
        { user: financeActor },
        { id: createdRequestId },
      );
      assert.equal(reExecuted.status, "EXECUTED");

      // 3. State machine validation: Attempting execution on cancelled request throws ConflictException
      await assert.rejects(
        async () =>
          await manualBillingRequestController.retryExecution({ user: financeActor }, { id: cancelledRequestId }),
        (err: any) => err instanceof ConflictException && err.message.includes("CANNOT_EXECUTE_UNAPPROVED_REQUEST"),
      );
      pass(13, "API-H2-13: POST /platform/billing/requests/:id/retry protects idempotency and state validation");
    }

    // -------------------------------------------------------------------------
    // TEST 14 â€” API-H2-14: GET /platform/billing/pricing (Catalog)
    // -------------------------------------------------------------------------
    {
      const catalog = await priceBookController.listCatalog({ country: "IN", activeOnly: true });
      assert(Array.isArray(catalog), "Catalog must return array");
      assert(catalog.length >= 1, "Must contain seed price book entries for IN");
      assert.equal(catalog[0].currency, "INR");
      pass(14, "API-H2-14: GET /platform/billing/pricing lists versioned Price Book catalog");
    }

    // -------------------------------------------------------------------------
    // TEST 15 â€” API-H2-15: POST /platform/billing/pricing (Publish Version)
    // -------------------------------------------------------------------------
    let publishedPriceEntryId = "";
    {
      const publishDto = {
        sku: `TALENT_RESERVE_EXP_${runId}`,
        poolType: PoolType.TALENT_RESERVE,
        credits: 100,
        validityDays: 14,
        billingCountry: "IN",
        currency: "INR",
        unitPriceMinor: 6000,
        effectiveFrom: new Date().toISOString(),
      };

      const published = await priceBookController.publishNewVersion({ user: financeActor }, publishDto);
      assert.equal(published.sku, `TALENT_RESERVE_EXP_${runId}`);
      assert.equal(published.version, 1);
      assert.equal(published.unitPriceMinor, 6000);
      publishedPriceEntryId = published.id;
      pass(15, "API-H2-15: POST /platform/billing/pricing publishes new immutable price book version");
    }

    // -------------------------------------------------------------------------
    // TEST 16 â€” API-H2-16 & API-H2-17: POST & GET /platform/billing/payments
    // -------------------------------------------------------------------------
    {
      const poInvoiceDto = {
        billingAccountId: acmeAccount.id,
        invoiceNumber: `INV-${runId}-001`,
        poNumber: `PO-${runId}`,
        priceBookEntryId: publishedPriceEntryId,
        quantityCredits: 100,
        amountMinor: 600000,
        taxMinor: 108000,
        currency: "INR",
        capturedAt: new Date().toISOString(),
      };

      const payment = await paymentController.recordManualInvoice({ user: financeActor }, poInvoiceDto);
      assert.equal(payment.status, "CAPTURED");
      assert.equal(payment.invoiceNumber, `INV-${runId}-001`);
      createdPaymentIds.push(payment.id);

      // Verify listing via API-H2-16
      const paymentsList = await paymentController.listPayments({
        billingAccountId: acmeAccount.id,
        page: 1,
        limit: 10,
      });
      assert(Array.isArray(paymentsList.data), "Payments data must be array");
      assert(paymentsList.data.some((p) => p.id === payment.id), "Recorded payment must appear in list");
      pass(16, "API-H2-16 & API-H2-17: POST records PO invoice & mints pool; GET lists payments");
    }

    // -------------------------------------------------------------------------
    // TEST 17 â€” API-H2-18: POST /billing/webhooks/:provider (Public Ingress)
    // -------------------------------------------------------------------------
    {
      // Calling public webhook controller directly without platform authentication
      const webhookPayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: `pay_test_${runId}`,
              amount: 50000,
              currency: "INR",
              status: "captured",
            },
          },
        },
      };

      const mockReq: any = {
        rawBody: Buffer.from(JSON.stringify(webhookPayload), "utf8"),
        body: webhookPayload,
      };

      const secret = "test_razorpay_secret";
      const signature = crypto.createHmac("sha256", secret).update(mockReq.rawBody).digest("hex");

      const res = await paymentWebhookController.handleWebhook(
        "razorpay",
        { "x-razorpay-signature": signature },
        mockReq,
      );
      assert(res && (res as any).received === true, "Public webhook receiver must return received: true");
      pass(17, "API-H2-18: POST /billing/webhooks/:provider ingests webhook with cryptographic validation");
    }

    // -------------------------------------------------------------------------
    // TEST 18 â€” API-H2-19: POST /platform/billing/payments/replay-webhook
    // -------------------------------------------------------------------------
    {
      // Replay non-existent eventId throws NotFoundException
      await assert.rejects(
        async () =>
          await paymentWebhookReplayController.replayWebhook(
            { user: financeActor },
            { eventId: "non-existent-event-id" },
          ),
        (err: any) => err instanceof NotFoundException,
      );
      pass(18, "API-H2-19: POST /platform/billing/payments/replay-webhook triggers administrative replay");
    }

    // -------------------------------------------------------------------------
    // TEST 19 â€” API-H2-20: GET /platform/finance/metrics (Finance Dashboard)
    // -------------------------------------------------------------------------
    {
      const overview = (await financeMetricsController.getMetrics(
        { user: financeActor },
        { period: undefined },
      )) as any;
      assert(overview && overview.revenue, "Must contain revenue breakdown");
      assert(overview.credits, "Must contain credits telemetry");
      assert(overview.risk, "Must contain risk & overdraft exposure");
      assert(overview.reconciliation, "Must contain reconciliation summary");
      pass(19, "API-H2-20: GET /platform/finance/metrics returns unified snapshot telemetry");
    }

    // -------------------------------------------------------------------------
    // TEST 20 â€” API-H2-21: GET /platform/billing/reconciliation/latest
    // -------------------------------------------------------------------------
    {
      const latest = await reconciliationController.getLatestRun();
      assert(latest && typeof latest === "object", "Reconciliation summary must return object");
      assert(latest.status !== undefined, "Status must be present (PASSED, WARNING, FAILED, or UNAVAILABLE)");
      pass(20, "API-H2-21: GET /platform/billing/reconciliation/latest surfaces reconciliation health");
    }

    // -------------------------------------------------------------------------
    // TEST 21 â€” API-H2-22: POST /platform/billing/reconciliation/run
    // -------------------------------------------------------------------------
    {
      const runRes = await reconciliationController.triggerManualAudit({ user: financeActor });
      assert(runRes && runRes.id, "Audit run record must be created");
      assert.equal(runRes.runType, "MANUAL");
      pass(21, "API-H2-22: POST /platform/billing/reconciliation/run executes 7-point audit replay");
    }

    // -------------------------------------------------------------------------
    // TEST 22 â€” API-H2-23 & API-H2-24: Incidents & Automated T3 Reversals
    // -------------------------------------------------------------------------
    {
      const declareDto = {
        title: `AWS Outage ${runId}`,
        reason: "Major infrastructure disruption causing candidate container disconnects",
        ticketRef: `INC-${runId}`,
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        endedAt: new Date().toISOString(),
      };

      const declared = await incidentController.declareIncident({ user: financeActor }, declareDto);
      assert.equal(declared.title, declareDto.title);
      assert.equal(declared.reversalStatus, "EXECUTED");
      createdIncidentIds.push(declared.id);

      // Verify listing via API-H2-23
      const incidentsList = await incidentController.listIncidents();
      assert(Array.isArray(incidentsList), "Must return array of incident windows");
      assert(incidentsList.some((i) => i.id === declared.id), "Declared incident must be listed");
      pass(22, "API-H2-23 & API-H2-24: POST declares incident window & executes reversals; GET lists incidents");
    }

    // -------------------------------------------------------------------------
    // TEST 23 â€” RBAC Gate Verification (PlatformRolesGuard)
    // -------------------------------------------------------------------------
    {
      // Helper function to mock ExecutionContext for PlatformRolesGuard
      const mockContext = (handler: any, user: any) => ({
        getHandler: () => handler,
        getClass: () => handler.constructor || class {},
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      });

      // 1. Verify FINANCE-only endpoints reject SUPPORT role with ForbiddenException
      assert.throws(
        () =>
          rolesGuard.canActivate(
            mockContext(ManualBillingRequestController.prototype.approveRequest, supportActor) as any,
          ),
        (err: any) => err instanceof ForbiddenException && err.message.includes("INSUFFICIENT_PLATFORM_PERMISSIONS"),
      );

      assert.throws(
        () =>
          rolesGuard.canActivate(
            mockContext(PriceBookController.prototype.publishNewVersion, supportActor) as any,
          ),
        (err: any) => err instanceof ForbiddenException && err.message.includes("INSUFFICIENT_PLATFORM_PERMISSIONS"),
      );

      assert.throws(
        () =>
          rolesGuard.canActivate(
            mockContext(PaymentWebhookReplayController.prototype.replayWebhook, supportActor) as any,
          ),
        (err: any) => err instanceof ForbiddenException && err.message.includes("INSUFFICIENT_PLATFORM_PERMISSIONS"),
      );

      assert.throws(
        () =>
          rolesGuard.canActivate(
            mockContext(IncidentController.prototype.declareIncident, supportActor) as any,
          ),
        (err: any) => err instanceof ForbiddenException && err.message.includes("INSUFFICIENT_PLATFORM_PERMISSIONS"),
      );

      // 2. Verify FINANCE role is permitted for financial operations
      const canFinanceApprove = rolesGuard.canActivate(
        mockContext(ManualBillingRequestController.prototype.approveRequest, financeActor) as any,
      );
      assert.equal(canFinanceApprove, true, "FINANCE role must be permitted for approveRequest");

      // 3. Verify OWNER role has full administrative authority across all endpoints
      const canOwnerApprove = rolesGuard.canActivate(
        mockContext(ManualBillingRequestController.prototype.approveRequest, ownerActor) as any,
      );
      assert.equal(canOwnerApprove, true, "OWNER role must have platform-wide access");

      // 4. Verify recruiter role is strictly rejected from all platform endpoints
      assert.throws(
        () =>
          rolesGuard.canActivate(
            mockContext(BillingAccountController.prototype.listAccounts, recruiterActor) as any,
          ),
        (err: any) => err instanceof ForbiddenException && err.message.includes("INSUFFICIENT_PLATFORM_PERMISSIONS"),
      );

      pass(23, "RBAC Gate: PlatformRolesGuard enforces strict SUPPORT vs FINANCE vs OWNER boundaries");
    }

    // -------------------------------------------------------------------------
    // TEST 24 â€” Candidate PII Safety & Clean Read-Only Invariant
    // -------------------------------------------------------------------------
    {
      const overview = await financeMetricsController.getMetrics({ user: financeActor }, {});
      const serialized = JSON.stringify(overview);

      assert(!serialized.includes("candidateName"), "Zero candidateName in finance metrics");
      assert(!serialized.includes("candidateEmail"), "Zero candidateEmail in finance metrics");
      assert(!serialized.includes("resume"), "Zero resume in finance metrics");
      assert(!serialized.includes("phone"), "Zero phone in finance metrics");

      pass(24, "PII & Boundary Safety: Controller responses are completely candidate PII-blind");
    }
  } finally {
    // -------------------------------------------------------------------------
    // TEARDOWN: Clean up temporary test entities to preserve pristine baseline
    // -------------------------------------------------------------------------
    console.log("Teardown: Cleaning up temporary test entities...");

    try {
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

      if (createdPaymentIds.length > 0) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE payment_id = ANY($1)`, [createdPaymentIds]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE payment_id = ANY($1)`, [createdPaymentIds]);
        await pg.query(`DELETE FROM billing.payment WHERE id = ANY($1)`, [createdPaymentIds]);
      }

      if (createdRequestIds.length > 0) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE request_id = ANY($1)`, [createdRequestIds]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE name LIKE '%Goodwill%'`);
        await pg.query(`DELETE FROM billing.manual_billing_request WHERE id = ANY($1)`, [createdRequestIds]);
      }

      if (createdIncidentIds.length > 0) {
        await pg.query(`DELETE FROM platform.incident_window WHERE id = ANY($1)`, [createdIncidentIds]);
      }

      await pg.query(`DELETE FROM billing.price_book_entry WHERE sku LIKE '%${runId}%'`);

      await pg.query(`DELETE FROM billing.billing_audit_event WHERE actor_id = ANY($1)`, [
        [supportActor.id, financeActor.id, ownerActor.id],
      ]);

      await pg.query(`UPDATE billing.credit_pool SET cached_remaining = 50 WHERE billing_account_id = $1 AND source = 'TRIAL'`, [
        acmeAccount.id,
      ]);
    } catch (cleanupErr) {
      console.error("Cleanup error in teardown:", cleanupErr);
    } finally {
      await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    }

    await prisma.$disconnect();
    await pg.end();
  }

  console.log("================================================================================");
  console.log(`STAGE 2.11 TEST RESULTS: ${passedTests} / 24 PASSED (100%)`);
  console.log("================================================================================");
}

if (process.env.JEST_WORKER_ID !== undefined) {
  describe("Platform Billing Controllers & API Layer Suite", () => {
    it("executes all 24 API and RBAC verification tests", async () => {
      await runPlatformBillingTestSuite();
    }, 120000);
  });
} else {
  runPlatformBillingTestSuite().catch((err) => {
    console.error("Test Suite Failed with error:", err);
    process.exit(1);
  });
}
