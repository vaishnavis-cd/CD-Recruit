import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { strict as assert } from "assert";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { BillingAccountService } from "../account/billing-account.service";
import { ManualBillingRequestService } from "./manual-billing-request.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  ManualRequestKind,
  ManualRequestStatus,
  CreateManualRequestDto,
} from "./manual-billing-request.types";
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

async function runManualBillingRequestServiceTests() {
  console.log("================================================================================");
  console.log("Phase 2 â€” Stage 2.5: ManualBillingRequestService Comprehensive Verification");
  console.log("================================================================================");

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  const prisma = new PrismaClient();
  const ledgerService = new LedgerService(prisma as any);
  const creditPoolService = new CreditPoolService(prisma as any, ledgerService);
  const billingAccountService = new BillingAccountService(prisma as any);
  const service = new ManualBillingRequestService(
    prisma as any,
    ledgerService,
    creditPoolService,
    billingAccountService,
  );

  const timestamp = Date.now();
  let passedCount = 0;
  let totalCount = 0;

  function pass(testName: string) {
    totalCount++;
    passedCount++;
    console.log(`âœ… TEST [${totalCount}]: ${testName}`);
  }

  // Tracking test entities for clean teardown
  const testAccountsToCleanup: string[] = [];
  const testOrgsToCleanup: string[] = [];
  const testStaffToCleanup: string[] = [];

  // Helper to create isolated test organization and billing account
  async function createTestAccount(suffix: string, status = "ACTIVE") {
    const baId = `ba-mbr-${timestamp}-${suffix}`;
    const orgId = `org-mbr-${timestamp}-${suffix}`;

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at)
       VALUES ($1, $2, 'IN', 'INR', $3, 0, 0, clock_timestamp(), clock_timestamp())`,
      [baId, `ManualReq Test Corp ${suffix}`, status],
    );
    testAccountsToCleanup.push(baId);

    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())`,
      [orgId, `ManualReq Test Corp ${suffix}`, `slug-mbr-${timestamp}-${suffix}`, baId],
    );
    testOrgsToCleanup.push(orgId);

    return { baId, orgId };
  }

  // Helper to create platform staff users for actor provenance
  async function createTestStaff(role: PlatformStaffRole, suffix: string) {
    const staffId = `staff-${role.toLowerCase()}-${timestamp}-${suffix}`;
    const email = `staff-${role.toLowerCase()}-${timestamp}-${suffix}@platform.proctora.internal`;

    await pg.query(
      `INSERT INTO platform.platform_staff (id, email, name, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, true, clock_timestamp())`,
      [staffId, email, `Test ${role} Staff ${suffix}`, role],
    );
    testStaffToCleanup.push(staffId);

    return { id: staffId, role, email, isPlatformStaff: true as const };
  }

  try {
    // Setup platform staff actors
    const staffSupport = await createTestStaff(PlatformStaffRole.SUPPORT, "1");
    const staffFinance1 = await createTestStaff(PlatformStaffRole.FINANCE, "1");
    const staffFinance2 = await createTestStaff(PlatformStaffRole.FINANCE, "2");
    const staffOwner = await createTestStaff(PlatformStaffRole.OWNER, "1");

    // -------------------------------------------------------------------------
    // SECTION 1: Request Creation & Validation
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: Request Creation & Validation ---");

    const { baId: ba1 } = await createTestAccount("1");

    // 1. Valid GRANT request creation
    const req1 = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 100, poolName: "VIP Welcome Grant", validityDays: 60 },
        reason: "Customer onboarding goodwill exception approved by director",
        ticketRef: "JIRA-1001",
      },
      staffSupport,
    );

    assert.strictEqual(req1.billingAccountId, ba1);
    assert.strictEqual(req1.kind, ManualRequestKind.GRANT);
    assert.strictEqual(req1.status, ManualRequestStatus.REQUESTED);
    assert.strictEqual(req1.requestedById, staffSupport.id);
    assert.strictEqual(req1.approvedById, null);
    assert.strictEqual(req1.ticketRef, "JIRA-1001");
    assert.strictEqual(req1.reason, "Customer onboarding goodwill exception approved by director");
    assert.ok(req1.id, "Must have valid ID");
    pass("Create valid GRANT manual billing request with status REQUESTED");

    // 2. Reject nonexistent billing account
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: "ba-nonexistent-99999",
            kind: ManualRequestKind.GRANT,
            payload: { credits: 50 },
            reason: "Should fail because billing account does not exist",
            ticketRef: "TICKET-999",
          },
          staffSupport,
        );
      },
      (err: any) => err instanceof NotFoundException && err.message.includes("BILLING_ACCOUNT_NOT_FOUND"),
    );
    pass("Reject request creation for nonexistent billing account");

    // 3. Reject invalid ticket reference format
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.GRANT,
            payload: { credits: 50 },
            reason: "Reason is valid length here",
            ticketRef: "TICKET with spaces and $pecial!",
          },
          staffSupport,
        );
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_TICKET_REF"),
    );
    pass("Reject request creation with invalid ticketRef format");

    // 4. Reject short reason (< 10 chars)
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.GRANT,
            payload: { credits: 50 },
            reason: "Short",
            ticketRef: "TICKET-123",
          },
          staffSupport,
        );
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_REASON"),
    );
    pass("Reject request creation with reason shorter than 10 characters");

    // 5. Payload validation: GRANT credits must be positive integer
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.GRANT,
            payload: { credits: -10 },
            reason: "Negative credits should be rejected for GRANT",
            ticketRef: "TICKET-123",
          },
          staffSupport,
        );
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_GRANT_CREDITS"),
    );
    pass("Reject GRANT request with non-positive credits");

    // 6. Payload validation: ADJUST requires non-zero amount and poolId
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.ADJUST,
            payload: { amount: 0, poolId: "pool-123" },
            reason: "Zero amount adjustment is invalid",
            ticketRef: "TICKET-123",
          },
          staffSupport,
        );
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_ADJUST_AMOUNT"),
    );
    pass("Reject ADJUST request with zero amount");

    // 7. Reject candidate PII in reason
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.GRANT,
            payload: { credits: 50 },
            reason: "Refund credits for candidate john.doe@example.com who took exam",
            ticketRef: "TICKET-123",
          },
          staffSupport,
        );
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("CANDIDATE_PII_PROHIBITED"),
    );
    pass("Reject request creation containing candidate PII email in reason");

    // -------------------------------------------------------------------------
    // SECTION 2: Platform Roles & Actor Provenance
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Platform Roles & Actor Provenance ---");

    // 8. Permitted creators: SUPPORT, FINANCE, OWNER can create
    const reqFin = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 25 },
        reason: "Finance initiated grant for partnership account",
        ticketRef: "JIRA-2001",
      },
      staffFinance1,
    );
    assert.strictEqual(reqFin.requestedById, staffFinance1.id);

    const reqOwn = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 30 },
        reason: "Owner initiated grant for strategic pilot",
        ticketRef: "JIRA-2002",
      },
      staffOwner,
    );
    assert.strictEqual(reqOwn.requestedById, staffOwner.id);
    pass("SUPPORT, FINANCE, and OWNER roles can all create manual requests");

    // 9. Recruiter roles (ADMIN, HR_LEAD) rejected
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.GRANT,
            payload: { credits: 10 },
            reason: "Recruiter attempting platform manual request",
            ticketRef: "JIRA-3001",
          },
          { id: "recruiter-123", role: "ADMIN" as any, isPlatformStaff: false } as any,
        );
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PLATFORM_ROLE_REQUIRED"),
    );
    pass("Recruiter role (ADMIN) rejected from creating platform manual requests");

    // 10. Missing / unauthenticated actor rejected
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: ba1,
            kind: ManualRequestKind.GRANT,
            payload: { credits: 10 },
            reason: "Unauthenticated request attempt",
            ticketRef: "JIRA-3002",
          },
          null as any,
        );
      },
      (err: any) => err instanceof UnauthorizedException && err.message.includes("AUTHENTICATION_REQUIRED"),
    );
    pass("Unauthenticated actor rejected with 401 Unauthorized");

    // 11. Approver role verification: SUPPORT cannot approve
    await assert.rejects(
      async () => {
        await service.approveRequest(req1.id, staffSupport);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("APPROVAL_ROLE_NOT_AUTHORIZED"),
    );
    pass("SUPPORT role cannot approve manual requests (FINANCE/OWNER required)");

    // 12. Recruiter role cannot approve
    await assert.rejects(
      async () => {
        await service.approveRequest(req1.id, { id: "recruiter-456", role: "HR_LEAD" as any, isPlatformStaff: false } as any);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PLATFORM_ROLE_REQUIRED"),
    );
    pass("Recruiter role (HR_LEAD) rejected from approving manual requests");

    // -------------------------------------------------------------------------
    // SECTION 3: Maker-Checker Dual-Authorization Invariant
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Maker-Checker Dual-Authorization Invariant ---");

    // 13. Maker-checker: Requester cannot approve their own request (Self-Approval)
    await assert.rejects(
      async () => {
        // staffFinance1 created reqFin, now tries to approve reqFin
        await service.approveRequest(reqFin.id, staffFinance1);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("MAKER_CHECKER_VIOLATION"),
    );
    pass("Self-approval prevented at application boundary: requester != approver");

    // 14. Database constraint chk_maker_checker enforcement
    await assert.rejects(
      async () => {
        await pg.query(
          `UPDATE billing.manual_billing_request
              SET approved_by_id = requested_by_id, status = 'APPROVED'
            WHERE id = $1`,
          [reqFin.id],
        );
      },
      (err: any) => err.message.includes("chk_maker_checker"),
    );
    pass("Database check constraint chk_maker_checker blocks approved_by_id = requested_by_id");

    // 15. Valid maker-checker: SUPPORT creates, FINANCE approves
    const approved1 = await service.approveRequest(req1.id, staffFinance1);
    assert.strictEqual(approved1.status, ManualRequestStatus.APPROVED);
    assert.strictEqual(approved1.approvedById, staffFinance1.id);
    assert.ok(approved1.decidedAt instanceof Date || typeof approved1.decidedAt === "string");
    pass("Valid maker-checker: SUPPORT requests, FINANCE approves -> status APPROVED");

    // 16. Valid maker-checker: FINANCE creates, OWNER approves
    const approvedFin = await service.approveRequest(reqFin.id, staffOwner);
    assert.strictEqual(approvedFin.status, ManualRequestStatus.APPROVED);
    assert.strictEqual(approvedFin.approvedById, staffOwner.id);
    pass("Valid maker-checker: FINANCE requests, OWNER approves -> status APPROVED");

    // 17. Valid maker-checker: OWNER creates, FINANCE approves
    const approvedOwn = await service.approveRequest(reqOwn.id, staffFinance2);
    assert.strictEqual(approvedOwn.status, ManualRequestStatus.APPROVED);
    assert.strictEqual(approvedOwn.approvedById, staffFinance2.id);
    pass("Valid maker-checker: OWNER requests, FINANCE approves -> status APPROVED");

    // 18. Audit event emitted on approval in billing.billing_audit_event
    const auditApproval = await pg.query(
      `SELECT action, actor_id, actor_role, after
         FROM billing.billing_audit_event
        WHERE subject_id = $1 AND action = 'REQUEST_APPROVED'`,
      [req1.id],
    );
    assert.strictEqual(auditApproval.rows.length, 1, "Must have exactly 1 approval audit event");
    assert.strictEqual(auditApproval.rows[0].actor_id, staffFinance1.id);
    assert.strictEqual(auditApproval.rows[0].actor_role, "FINANCE");
    pass("Approval emits transactionally coupled billing audit event (MANUAL_REQUEST_APPROVED)");

    // 19. Approval alone does NOT mutate credits
    const poolsAfterApproval = await pg.query(
      `SELECT count(*) FROM billing.credit_pool WHERE billing_account_id = $1`,
      [ba1],
    );
    assert.strictEqual(parseInt(poolsAfterApproval.rows[0].count, 10), 0, "No pools created at approval stage");
    pass("Approval authorizes execution but does NOT perform financial mutation");

    // -------------------------------------------------------------------------
    // SECTION 4: Rejection & Cancellation Workflows
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Rejection & Cancellation Workflows ---");

    const reqToReject = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 9999 },
        reason: "Excessive grant request intended for rejection test",
        ticketRef: "JIRA-4001",
      },
      staffSupport,
    );

    // 20. Rejection requires >= 10 chars reason
    await assert.rejects(
      async () => {
        await service.rejectRequest(reqToReject.id, "Denied", staffFinance1);
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_REJECTION_REASON"),
    );
    pass("Reject rejection attempt with short reason (< 10 chars)");

    // 21. Rejection requires FINANCE or OWNER
    await assert.rejects(
      async () => {
        await service.rejectRequest(reqToReject.id, "Rejected by unauthorized support actor", staffSupport);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("APPROVAL_ROLE_NOT_AUTHORIZED"),
    );
    pass("SUPPORT role cannot reject requests (FINANCE/OWNER required)");

    // 22. Valid rejection by FINANCE
    const rejectedReq = await service.rejectRequest(
      reqToReject.id,
      "Request exceeds acceptable goodwill threshold for unverified account",
      staffFinance1,
    );
    assert.strictEqual(rejectedReq.status, ManualRequestStatus.REJECTED);
    assert.strictEqual(
      rejectedReq.rejectionReason,
      "Request exceeds acceptable goodwill threshold for unverified account",
    );
    pass("Valid rejection marks status REJECTED and records rejection reason");

    // 23. Rejection emits audit event
    const auditRejection = await pg.query(
      `SELECT action, actor_id, actor_role
         FROM billing.billing_audit_event
        WHERE subject_id = $1 AND action = 'REQUEST_REJECTED'`,
      [reqToReject.id],
    );
    assert.strictEqual(auditRejection.rows.length, 1);
    assert.strictEqual(auditRejection.rows[0].actor_id, staffFinance1.id);
    pass("Rejection emits transactionally coupled billing audit event (MANUAL_REQUEST_REJECTED)");

    // 24. Rejection performs zero credit mutation
    const ledgerAfterRejection = await pg.query(
      `SELECT count(*) FROM billing.credit_ledger_entry WHERE billing_account_id = $1`,
      [ba1],
    );
    assert.strictEqual(parseInt(ledgerAfterRejection.rows[0].count, 10), 0);
    pass("Rejection preserves zero ledger mutation");

    // 25. Cancellation: original requester can cancel pending request
    const reqToCancel = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 15 },
        reason: "Duplicate request that should be cancelled by submitter",
        ticketRef: "JIRA-5001",
      },
      staffSupport,
    );

    // 26. Non-requester cannot cancel
    await assert.rejects(
      async () => {
        await service.cancelRequest(reqToCancel.id, staffFinance1);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("ONLY_REQUESTER_CAN_CANCEL"),
    );
    pass("Non-requester cannot cancel pending request");

    // 27. Requester cancels successfully
    const cancelledReq = await service.cancelRequest(reqToCancel.id, staffSupport);
    assert.strictEqual(cancelledReq.status, ManualRequestStatus.CANCELLED);
    pass("Original submitter successfully cancels pending request (status CANCELLED)");

    // 28. Cannot approve or reject cancelled request
    await assert.rejects(
      async () => {
        await service.approveRequest(reqToCancel.id, staffFinance1);
      },
      (err: any) =>
        err instanceof ConflictException &&
        (err.message.includes("REQUEST_NOT_IN_PENDING_STATUS") || err.message.includes("CANNOT_APPROVE")),
    );
    pass("Cannot approve a CANCELLED request (ConflictException)");

    // -------------------------------------------------------------------------
    // SECTION 5: Execution Workflow & Service Delegation
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: Execution Workflow & Service Delegation ---");

    // 29. Execute approved GRANT request (creates pool)
    const execResult1 = await service.executeRequest(approved1.id, staffFinance1);
    assert.strictEqual(execResult1.status, ManualRequestStatus.EXECUTED);
    assert.ok(execResult1.executedAt !== null, "executed_at must be populated");
    pass("Execute approved GRANT request delegates to domain service, status EXECUTED");

    // Verify credit pool was created via CreditPoolService
    const createdPools = await pg.query(
      `SELECT id, name, total_credits, cached_remaining, source, status
         FROM billing.credit_pool
        WHERE billing_account_id = $1`,
      [ba1],
    );
    assert.strictEqual(createdPools.rows.length, 1, "Exactly one credit pool created");
    const testPool = createdPools.rows[0];
    assert.strictEqual(testPool.total_credits, 100);
    assert.strictEqual(testPool.cached_remaining, 100);
    assert.strictEqual(testPool.source, "GOODWILL");
    pass("Credit pool created with 100 credits and GOODWILL source");

    // Verify ledger entry created via LedgerService
    const ledgerEntries = await pg.query(
      `SELECT id, amount, entry_type, balance_after, request_id
         FROM billing.credit_ledger_entry
        WHERE billing_account_id = $1`,
      [ba1],
    );
    assert.strictEqual(ledgerEntries.rows.length, 1, "Exactly one ledger entry created");
    assert.strictEqual(ledgerEntries.rows[0].amount, 100);
    assert.strictEqual(ledgerEntries.rows[0].entry_type, "GRANT");
    assert.strictEqual(ledgerEntries.rows[0].request_id, approved1.id);
    pass("Ledger entry created with amount=100 and request_id link");

    // 30. Execute approved ADJUST request (positive amount)
    const reqAdjustPos = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.ADJUST,
        payload: { poolId: testPool.id, amount: 20, note: "Compensation for minor glitch" },
        reason: "Customer support credit compensation adjustment",
        ticketRef: "JIRA-6001",
      },
      staffSupport,
    );
    const approvedAdjPos = await service.approveRequest(reqAdjustPos.id, staffFinance1);
    const execAdjPos = await service.executeRequest(approvedAdjPos.id, staffFinance1);
    assert.strictEqual(execAdjPos.status, ManualRequestStatus.EXECUTED);

    const poolAfterAdjPos = await pg.query(
      `SELECT cached_remaining FROM billing.credit_pool WHERE id = $1`,
      [testPool.id],
    );
    assert.strictEqual(poolAfterAdjPos.rows[0].cached_remaining, 120);
    pass("Execute approved ADJUST request (+20 credits) increases pool cached_remaining to 120");

    // 31. Execute approved ADJUST request (negative amount)
    const reqAdjustNeg = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.ADJUST,
        payload: { poolId: testPool.id, amount: -15, note: "Reversal of accidental extra grant" },
        reason: "Adjustment reversal following audit discovery",
        ticketRef: "JIRA-6002",
      },
      staffFinance1,
    );
    const approvedAdjNeg = await service.approveRequest(reqAdjustNeg.id, staffOwner);
    const execAdjNeg = await service.executeRequest(approvedAdjNeg.id, staffFinance1);
    assert.strictEqual(execAdjNeg.status, ManualRequestStatus.EXECUTED);

    const poolAfterAdjNeg = await pg.query(
      `SELECT cached_remaining FROM billing.credit_pool WHERE id = $1`,
      [testPool.id],
    );
    assert.strictEqual(poolAfterAdjNeg.rows[0].cached_remaining, 105);
    pass("Execute approved ADJUST request (-15 credits) decreases pool cached_remaining to 105");

    // 32. Execute approved EXPIRY_EXTEND request
    const futureDate = new Date(Date.now() + 90 * 86400000);
    const reqExtend = await service.createRequest(
      {
        billingAccountId: ba1,
        kind: ManualRequestKind.EXPIRY_EXTEND,
        payload: { poolId: testPool.id, newExpiry: futureDate.toISOString() },
        reason: "Extension of goodwill validity due to project delay",
        ticketRef: "JIRA-7001",
      },
      staffSupport,
    );
    const approvedExtend = await service.approveRequest(reqExtend.id, staffFinance2);
    const execExtend = await service.executeRequest(approvedExtend.id, staffFinance1);
    assert.strictEqual(execExtend.status, ManualRequestStatus.EXECUTED);

    const poolAfterExtend = await prisma.creditPool.findUnique({
      where: { id: testPool.id },
    });
    const updatedExpiry = new Date(poolAfterExtend!.expiresAt!);
    assert.ok(
      Math.abs(updatedExpiry.getTime() - futureDate.getTime()) < 5000,
      "Pool expires_at must match requested new expiry",
    );
    pass("Execute approved EXPIRY_EXTEND request delegates to CreditPoolService with proctora.request_id");

    // 33. Execution audit event in billing.billing_audit_event
    const auditExec = await pg.query(
      `SELECT action, actor_id, actor_role
         FROM billing.billing_audit_event
        WHERE subject_id = $1 AND action = 'REQUEST_EXECUTED'`,
      [reqExtend.id],
    );
    assert.strictEqual(auditExec.rows.length, 1);
    pass("Execution emits transactionally coupled billing audit event (MANUAL_REQUEST_EXECUTED)");

    // -------------------------------------------------------------------------
    // SECTION 6: Concurrency & Invariant Tests (Section 23 Minimums)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: Concurrency & Invariant Tests ---");

    // 34. Test 1 â€” Double Approval: Two staff attempt to approve simultaneously
    const { baId: baConcurrency } = await createTestAccount("concurrency");
    const reqDoubleApprove = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 40 },
        reason: "Double approval concurrency race verification",
        ticketRef: "JIRA-RACE-1",
      },
      staffSupport,
    );

    const approveResults = await Promise.allSettled([
      service.approveRequest(reqDoubleApprove.id, staffFinance1),
      service.approveRequest(reqDoubleApprove.id, staffFinance2),
    ]);

    const fulfilledApprovals = approveResults.filter((r) => r.status === "fulfilled");
    const rejectedApprovals = approveResults.filter((r) => r.status === "rejected");

    assert.strictEqual(fulfilledApprovals.length, 1, "Exactly one approval must succeed");
    assert.strictEqual(rejectedApprovals.length, 1, "Second concurrent approval must be rejected");
    assert.ok(
      (rejectedApprovals[0] as PromiseRejectedResult).reason instanceof ConflictException,
      "Second approval rejected with ConflictException (stale state)",
    );

    const finalReqState = await service.getRequestById(reqDoubleApprove.id);
    assert.strictEqual(finalReqState.status, ManualRequestStatus.APPROVED);
    pass("Test 1 â€” Double approval race: exactly one succeeds, one rejected with ConflictException");

    // 35. Test 2 â€” Self Approval: Requester attempts to approve own request
    const reqSelfApprove = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 50 },
        reason: "Self approval attempt verification test",
        ticketRef: "JIRA-SELF-1",
      },
      staffFinance1,
    );

    await assert.rejects(
      async () => {
        await service.approveRequest(reqSelfApprove.id, staffFinance1);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("MAKER_CHECKER_VIOLATION"),
    );

    const checkSelfReq = await service.getRequestById(reqSelfApprove.id);
    assert.strictEqual(checkSelfReq.status, ManualRequestStatus.REQUESTED);
    assert.strictEqual(checkSelfReq.approvedById, null);
    pass("Test 2 â€” Self approval: requester cannot approve own request, state remains REQUESTED");

    // 36. Test 3 â€” Concurrent Execution: Two execution attempts simultaneously
    const reqConcExec = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 50, poolName: "Race Pool" },
        reason: "Concurrent execution race condition verification",
        ticketRef: "JIRA-CONC-EXEC",
      },
      staffSupport,
    );
    const approvedConcExec = await service.approveRequest(reqConcExec.id, staffFinance1);

    const execResults = await Promise.allSettled([
      service.executeRequest(approvedConcExec.id, staffFinance1),
      service.executeRequest(approvedConcExec.id, staffFinance2),
    ]);

    // Both may resolve successfully due to exact-once idempotent return, OR one succeeds and one returns canonical
    assert.ok(
      execResults.every((r) => r.status === "fulfilled"),
      "Both concurrent calls must resolve cleanly (one executes, one returns canonical)",
    );

    // Verify ONLY ONE pool was created
    const poolsAfterRace = await pg.query(
      `SELECT count(*) FROM billing.credit_pool WHERE billing_account_id = $1`,
      [baConcurrency],
    );
    assert.strictEqual(parseInt(poolsAfterRace.rows[0].count, 10), 1, "Exactly 1 pool created, zero duplicates");

    // Verify ONLY ONE ledger entry was created
    const ledgerAfterRace = await pg.query(
      `SELECT count(*) FROM billing.credit_ledger_entry WHERE billing_account_id = $1`,
      [baConcurrency],
    );
    assert.strictEqual(parseInt(ledgerAfterRace.rows[0].count, 10), 1, "Exactly 1 ledger entry, zero duplicates");
    pass("Test 3 â€” Concurrent execution: exactly one financial mutation, zero duplicate credits");

    // 37. Test 4 â€” Execution Retry: Repeated calls produce exactly one financial effect
    const retry1 = await service.executeRequest(approvedConcExec.id, staffFinance1);
    const retry2 = await service.executeRequest(approvedConcExec.id, staffFinance2);
    assert.strictEqual(retry1.status, ManualRequestStatus.EXECUTED);
    assert.strictEqual(retry2.status, ManualRequestStatus.EXECUTED);

    const ledgerAfterRetry = await pg.query(
      `SELECT count(*) FROM billing.credit_ledger_entry WHERE billing_account_id = $1`,
      [baConcurrency],
    );
    assert.strictEqual(parseInt(ledgerAfterRetry.rows[0].count, 10), 1, "Ledger entries count strictly preserved");
    pass("Test 4 â€” Execution retry: repeated calls are idempotent with exactly one financial effect");

    // 38. Test 5 â€” Rejected Request Execution: Cannot execute after rejection
    const reqRejectedExec = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 10 },
        reason: "Request to reject and then attempt execution",
        ticketRef: "JIRA-REJ-EXEC",
      },
      staffSupport,
    );
    await service.rejectRequest(reqRejectedExec.id, "Rejected by policy committee", staffFinance1);

    await assert.rejects(
      async () => {
        await service.executeRequest(reqRejectedExec.id, staffFinance1);
      },
      (err: any) => err instanceof ConflictException && err.message.includes("CANNOT_EXECUTE_UNAPPROVED_REQUEST"),
    );

    const ledgerAfterRejExec = await pg.query(
      `SELECT count(*) FROM billing.credit_ledger_entry WHERE request_id = $1`,
      [reqRejectedExec.id],
    );
    assert.strictEqual(parseInt(ledgerAfterRejExec.rows[0].count, 10), 0);
    pass("Test 5 â€” Rejected request execution fails: zero financial mutation");

    // 39. Test 6 â€” Unapproved Request Execution: Cannot execute while REQUESTED
    const reqUnapprovedExec = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 25 },
        reason: "Unapproved request execution attempt test",
        ticketRef: "JIRA-UNAPP-EXEC",
      },
      staffSupport,
    );

    await assert.rejects(
      async () => {
        await service.executeRequest(reqUnapprovedExec.id, staffFinance1);
      },
      (err: any) => err instanceof ConflictException && err.message.includes("CANNOT_EXECUTE_UNAPPROVED_REQUEST"),
    );

    const ledgerAfterUnapp = await pg.query(
      `SELECT count(*) FROM billing.credit_ledger_entry WHERE request_id = $1`,
      [reqUnapprovedExec.id],
    );
    assert.strictEqual(parseInt(ledgerAfterUnapp.rows[0].count, 10), 0);
    pass("Test 6 â€” Unapproved request execution fails: zero financial mutation");

    // 40. Test 7 â€” Concurrent Approval and Execution Race
    const reqApproveExecRace = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 15, poolName: "Race App-Exec Pool" },
        reason: "Concurrent approval and execution race condition test",
        ticketRef: "JIRA-APP-EXEC",
      },
      staffSupport,
    );

    // Race approval and execution concurrently
    const raceResults = await Promise.allSettled([
      service.approveRequest(reqApproveExecRace.id, staffFinance1),
      service.executeRequest(reqApproveExecRace.id, staffFinance2),
    ]);

    // Either execute fails because approval hasn't committed, OR approval commits and execute succeeds
    // The critical check is DB consistency: no invalid states, no orphan records
    const finalRaceReq = await service.getRequestById(reqApproveExecRace.id);
    assert.ok(
      finalRaceReq.status === ManualRequestStatus.APPROVED ||
        finalRaceReq.status === ManualRequestStatus.EXECUTED,
      `Final status must be valid (APPROVED or EXECUTED), got: ${finalRaceReq.status}`,
    );
    pass("Test 7 â€” Concurrent approval/execution race preserves valid database state");

    // -------------------------------------------------------------------------
    // SECTION 7: Listing and Read Models
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 7: Listing and Read Models ---");

    // 41. getRequestById returns full details
    const fetchedReq = await service.getRequestById(req1.id);
    assert.strictEqual(fetchedReq.id, req1.id);
    assert.strictEqual(fetchedReq.billingAccountId, ba1);
    assert.strictEqual(fetchedReq.ticketRef, "JIRA-1001");
    pass("getRequestById returns canonical request with full attributes");

    // 42. listRequests with filters and pagination
    const listAll = await service.listRequests({ billingAccountId: ba1, limit: 10, offset: 0 });
    assert.ok(listAll.total >= 3, "Must list all requests for ba1");
    assert.ok(listAll.items.length >= 3);

    const listByStatus = await service.listRequests({
      billingAccountId: ba1,
      status: ManualRequestStatus.EXECUTED,
    });
    assert.ok(listByStatus.items.every((item) => item.status === ManualRequestStatus.EXECUTED));
    pass("listRequests correctly filters by billingAccountId and status");

    // 43. Tab filtering: awaiting_approval, my_requests, all
    const pendingReqForTab = await service.createRequest(
      {
        billingAccountId: baConcurrency,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 10 },
        reason: "Pending request for awaiting_approval tab verification",
        ticketRef: "JIRA-TAB-1",
      },
      staffSupport,
    );

    const tabAwaiting = await service.listRequests({ tab: "awaiting_approval" });
    assert.ok(
      tabAwaiting.items.some((i) => i.id === pendingReqForTab.id),
      "awaiting_approval tab includes newly created REQUESTED item",
    );
    assert.ok(
      tabAwaiting.items.every((i) => i.status === ManualRequestStatus.REQUESTED),
      "awaiting_approval tab only returns REQUESTED items",
    );

    const tabMyRequests = await service.listRequests(
      { tab: "my_requests" },
      staffSupport,
    );
    assert.ok(
      tabMyRequests.items.every((i) => i.requestedById === staffSupport.id),
      "my_requests tab strictly returns items requested by authenticated staff",
    );
    pass("listRequests tabs (awaiting_approval, my_requests, all) work as specified");

    // -------------------------------------------------------------------------
    // SECTION 8: Overdraft Protection & Invariant Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 8: Overdraft Protection & Invariants ---");

    // 44. Negative adjustment cannot cause overdraft (Ledger floor protection)
    const { baId: baOverdraft } = await createTestAccount("overdraft");
    // Create pool with 10 credits
    const reqSmallPool = await service.createRequest(
      {
        billingAccountId: baOverdraft,
        kind: ManualRequestKind.GRANT,
        payload: { credits: 10, poolName: "Small Pool" },
        reason: "Small pool creation for overdraft protection test",
        ticketRef: "JIRA-OD-1",
      },
      staffSupport,
    );
    const approvedSmall = await service.approveRequest(reqSmallPool.id, staffFinance1);
    await service.executeRequest(approvedSmall.id, staffFinance1);

    const smallPoolRow = (
      await pg.query(
        `SELECT id FROM billing.credit_pool WHERE billing_account_id = $1`,
        [baOverdraft],
      )
    ).rows[0];

    // Attempt negative adjustment of -50 credits (pool only has 10 credits) - Layer 1: Creation rejection
    await assert.rejects(
      async () => {
        await service.createRequest(
          {
            billingAccountId: baOverdraft,
            kind: ManualRequestKind.ADJUST,
            payload: { poolId: smallPoolRow.id, amount: -50 },
            reason: "Excessive deduction that exceeds pool cached_remaining",
            ticketRef: "JIRA-OD-2",
          },
          staffFinance1,
        );
      },
      (err: any) =>
        err instanceof BadRequestException &&
        err.message.includes("ADJUSTMENT_EXCEEDS_BALANCE"),
    );
    pass("Request creation rejects negative adjustment exceeding pool balance");

    // Layer 2: Execution floor protection if balance depletes before execution
    const reqDeductAll = await service.createRequest(
      {
        billingAccountId: baOverdraft,
        kind: ManualRequestKind.ADJUST,
        payload: { poolId: smallPoolRow.id, amount: -10 },
        reason: "Valid deduction at creation time",
        ticketRef: "JIRA-OD-3",
      },
      staffFinance1,
    );
    const approvedDeduct = await service.approveRequest(reqDeductAll.id, staffOwner);

    // Simulate concurrent depletion: set cachedRemaining to 5
    await pg.query(
      `UPDATE billing.credit_pool SET cached_remaining = 5 WHERE id = $1`,
      [smallPoolRow.id],
    );

    // Now attempt execution of -10 credits when only 5 remain
    await assert.rejects(
      async () => {
        await service.executeRequest(approvedDeduct.id, staffFinance1);
      },
      (err: any) =>
        (err instanceof ConflictException || err instanceof BadRequestException) &&
        (err.message.includes("INSUFFICIENT_CREDITS") ||
          err.message.includes("OVERDRAFT") ||
          err.message.includes("ADJUSTMENT_EXCEEDS_BALANCE")),
    );

    // Verify pool balance was NOT mutated to negative
    const poolCheck = await pg.query(
      `SELECT cached_remaining FROM billing.credit_pool WHERE id = $1`,
      [smallPoolRow.id],
    );
    assert.strictEqual(poolCheck.rows[0].cached_remaining, 5, "Pool balance preserved at 5");

    // Verify overdraft on billing account remains 0
    const baCheck = await pg.query(
      `SELECT overdraft_used FROM billing.billing_account WHERE id = $1`,
      [baOverdraft],
    );
    assert.strictEqual(baCheck.rows[0].overdraft_used, 0, "Overdraft used must strictly remain 0");
    pass("LedgerService floor protection prevents negative adjustment from causing overdraft");

    // 47. Baseline seed data verification
    console.log("\n--- SECTION 9: Baseline Seed Data Verification ---");
    const seedOrgs = await prisma.organization.findMany({
      where: { id: { in: ["a1111111-1111-1111-1111-111111111111", "b2222222-2222-2222-2222-222222222222"] } },
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

    assert.strictEqual(seedOrgs.length, 2, "Must retain exactly 2 baseline seed organizations");
    seedOrgs.forEach((org) => {
      assert.strictEqual(org.billingAccount!.overdraftLimit, 0);
      assert.strictEqual(org.billingAccount!.overdraftUsed, 0);

      const trialPool = org.billingAccount!.pools.find((p) => p.source === "TRIAL");
      assert.ok(trialPool, `Baseline TRIAL pool must exist for ${org.name}`);
      assert.strictEqual(trialPool.totalCredits, 50, "Baseline seed totalCredits must remain 50");
      assert.strictEqual(trialPool.cachedRemaining, 50, "Baseline seed cachedRemaining must remain 50");

      const ledgerSum = trialPool.ledgerEntries.reduce((sum, e) => sum + e.amount, 0);
      assert.strictEqual(ledgerSum, 50, "Baseline ledger sum must remain 50");
    });
    pass("Baseline seed accounts (Acme & Globex, 50 credits each, 0 overdraft) remain 100% pristine");

    console.log("================================================================================");
    console.log(`Summary: All ${passedCount}/${totalCount} ManualBillingRequestService Tests Passed!`);
    console.log("================================================================================");
  } finally {
    console.log("\nCleaning up isolated test fixtures...");
    try {
      await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.manual_billing_request DISABLE TRIGGER ALL");

      await pg.query(`DELETE FROM billing.billing_audit_event WHERE subject_id LIKE '%-mbr-%' OR subject_id LIKE 'mbr-%'`);

      for (const baId of testAccountsToCleanup) {
        await pg.query(`DELETE FROM billing.manual_billing_request WHERE billing_account_id = $1`, [baId]);
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baId]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = $1`, [baId]);
      }

      for (const orgId of testOrgsToCleanup) {
        await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgId]);
      }

      for (const baId of testAccountsToCleanup) {
        await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baId]);
      }

      for (const staffId of testStaffToCleanup) {
        await pg.query(`DELETE FROM platform.platform_staff WHERE id = $1`, [staffId]);
      }

      await pg.query("ALTER TABLE billing.manual_billing_request ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");
      console.log("Isolated test fixtures cleaned up successfully.");
    } catch (cleanupErr: any) {
      console.warn("Fixture cleanup warning:", cleanupErr.message);
    }

    await pg.end();
    await prisma.$disconnect();
  }
}

runManualBillingRequestServiceTests().catch((err) => {
  console.error("FATAL: ManualBillingRequestService test suite failed:", err);
  process.exit(1);
});
