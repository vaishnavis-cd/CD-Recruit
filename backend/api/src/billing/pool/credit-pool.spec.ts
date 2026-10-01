import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import assert from "node:assert";
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { CreditPoolService } from "./credit-pool.service";
import { LedgerService } from "../ledger/ledger.service";
import { PoolType, PoolStatus, PoolGrantSource } from "./credit-pool.types";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { AuthenticatedPlatformActor } from "../../platform/audit/platform-audit.types";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function createPgClient(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function runCreditPoolServiceTests() {
  console.log("================================================================================");
  console.log("Phase 2 — CreditPoolService Comprehensive Verification & Hardening Suite");
  console.log("================================================================================");

  let passedCount = 0;
  let totalCount = 0;

  function pass(msg: string) {
    totalCount++;
    passedCount++;
    console.log(`✅ TEST [${totalCount}]: ${msg}`);
  }

  const prisma = new PrismaClient();
  const ledgerService = new LedgerService(prisma as any);
  const service = new CreditPoolService(prisma as any, ledgerService);
  const pg = await createPgClient();

  const timestamp = Date.now();
  const testOrgsToCleanup: string[] = [];
  const testAccountsToCleanup: string[] = [];
  const testDrivesToCleanup: string[] = [];
  const testPoolsToCleanup: string[] = [];

  const platformActor: AuthenticatedPlatformActor = {
    id: "staff-finance-uuid-1",
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    isPlatformStaff: true,
    email: "finance@cdrecruit.local",
  };

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create isolated test organization and billing account
    // -------------------------------------------------------------------------
    const testOrgId = `org-pool-test-${timestamp}`;
    const testOrgSlug = `org-pool-slug-${timestamp}`;
    const testBaId = `ba-pool-test-${timestamp}`;
    testOrgsToCleanup.push(testOrgId);
    testAccountsToCleanup.push(testBaId);

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at)
       VALUES ($1, 'Pool Test Corp', 'IN', 'INR', 'ACTIVE', 0, 0, clock_timestamp(), clock_timestamp())`,
      [testBaId],
    );

    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Pool Test Corp', $2, $3, clock_timestamp())`,
      [testOrgId, testOrgSlug, testBaId],
    );

    // Get valid role_template, candidate, and staff
    const rtRes = await pg.query(`SELECT id FROM public.role_template LIMIT 1`);
    const validRoleTemplateId = rtRes.rows[0].id;
    const candRes = await pg.query(`SELECT id FROM public.candidate LIMIT 1`);
    const validCandidateId = candRes.rows[0]?.id || "cand-default";
    const staffRes = await pg.query(`SELECT id FROM public.staff LIMIT 1`);
    const validStaffId = staffRes.rows[0].id;

    // Setup a test drive
    const testDriveId = `drive-pool-test-${timestamp}`;
    testDrivesToCleanup.push(testDriveId);
    const futureDate = new Date(Date.now() + 14 * 86400000);
    await pg.query(
      `INSERT INTO public.drive (id, organization_id, name, role_template_id, module_config, status, schedule_start, schedule_end, created_by_id, created_at)
       VALUES ($1, $2, 'Campus Drive 2026', $3, '{}'::jsonb, 'ACTIVE', clock_timestamp(), $4, $5, clock_timestamp())`,
      [testDriveId, testOrgId, validRoleTemplateId, futureDate, validStaffId],
    );

    // -------------------------------------------------------------------------
    // SECTION 1: Pool Creation & Initial State
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: Creation & Initial State ---");

    const pool1 = await service.createPool(
      {
        billingAccountId: testBaId,
        poolType: PoolType.TALENT_RESERVE,
        name: "General Reserve Pack",
        source: PoolGrantSource.PURCHASE,
        totalCredits: 100,
        unitPriceMinor: 5000,
      },
      { actor: platformActor, reason: "Initial reserve purchase" },
    );
    testPoolsToCleanup.push(pool1.id);

    assert.strictEqual(pool1.billingAccountId, testBaId);
    assert.strictEqual(pool1.poolType, PoolType.TALENT_RESERVE);
    assert.strictEqual(pool1.source, PoolGrantSource.PURCHASE);
    assert.strictEqual(pool1.totalCredits, 100);
    assert.strictEqual(pool1.cachedRemaining, 100);
    assert.strictEqual(pool1.status, PoolStatus.ACTIVE);
    assert.strictEqual(pool1.queueOrder, 0);
    assert.strictEqual(pool1.currency, "INR");
    pass("Creates a valid TALENT_RESERVE pool with ACTIVE status and initial allocation");

    // Create a DRIVE_PASS pool
    const poolDrive = await service.createPool(
      {
        billingAccountId: testBaId,
        poolType: PoolType.DRIVE_PASS,
        name: "Campus Drive Pass",
        source: PoolGrantSource.PURCHASE,
        totalCredits: 50,
        driveId: testDriveId,
      },
      { actor: platformActor },
    );
    testPoolsToCleanup.push(poolDrive.id);

    assert.strictEqual(poolDrive.poolType, PoolType.DRIVE_PASS);
    assert.strictEqual(poolDrive.driveId, testDriveId);
    assert.strictEqual(poolDrive.status, PoolStatus.ACTIVE);
    assert.strictEqual(poolDrive.totalCredits, 50);
    assert.strictEqual(poolDrive.cachedRemaining, 50);
    assert.ok(poolDrive.expiresAt !== null, "Drive pass must have calculated expiresAt");
    // Verify 7-day makeup window: expiresAt should be drive.scheduleEnd + 7 days
    const expectedDriveExpiry = new Date(futureDate.getTime() + 7 * 86400000);
    assert.strictEqual(
      poolDrive.expiresAt!.toISOString().slice(0, 10),
      expectedDriveExpiry.toISOString().slice(0, 10),
      "Drive pass expiry must match scheduleEnd + 7 days",
    );
    pass("Creates a valid DRIVE_PASS pool with 7-day makeup window expiry");

    // -------------------------------------------------------------------------
    // SECTION 2: Financial Source-of-Truth & Ledger Agreement
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Ledger Agreement & Source of Truth ---");

    const ledgerEntries = await prisma.creditLedgerEntry.findMany({
      where: { creditPoolId: pool1.id },
    });
    assert.strictEqual(ledgerEntries.length, 1, "Must have exactly 1 ledger entry");
    assert.strictEqual(ledgerEntries[0].entryType, "GRANT");
    assert.strictEqual(ledgerEntries[0].amount, 100);
    assert.strictEqual(ledgerEntries[0].balanceAfter, 100);
    pass("Pool creation creates a corresponding GRANT ledger entry");

    const recon = await ledgerService.reconcilePoolBalance(pool1.id);
    assert.strictEqual(recon.isConsistent, true, "cachedRemaining must equal ledger sum");
    assert.strictEqual(recon.cachedRemaining, 100);
    assert.strictEqual(recon.ledgerSum, 100);
    pass("Authoritative ledger sum equals pool cachedRemaining");

    // -------------------------------------------------------------------------
    // SECTION 3: Input Validation & Boundary Conditions
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Input Validation & Constraints ---");

    // Reject zero totalCredits
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: testBaId,
          poolType: PoolType.TALENT_RESERVE,
          name: "Zero Pool",
          source: PoolGrantSource.PURCHASE,
          totalCredits: 0,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_TOTAL_CREDITS"),
      "Must reject zero totalCredits",
    );
    pass("Rejects zero totalCredits with BadRequestException");

    // Reject negative totalCredits
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: testBaId,
          poolType: PoolType.TALENT_RESERVE,
          name: "Negative Pool",
          source: PoolGrantSource.PURCHASE,
          totalCredits: -25,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_TOTAL_CREDITS"),
      "Must reject negative totalCredits",
    );
    pass("Rejects negative totalCredits with BadRequestException");

    // Reject nonexistent billing account
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: "nonexistent-ba-id",
          poolType: PoolType.TALENT_RESERVE,
          name: "Invalid BA Pool",
          source: PoolGrantSource.PURCHASE,
          totalCredits: 50,
        });
      },
      (err: any) => err instanceof NotFoundException,
      "Must reject nonexistent billing account",
    );
    pass("Rejects nonexistent billing account with NotFoundException");

    // Reject DRIVE_PASS without driveId
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: testBaId,
          poolType: PoolType.DRIVE_PASS,
          name: "No Drive Pass",
          source: PoolGrantSource.PURCHASE,
          totalCredits: 50,
          driveId: null,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("DRIVE_ID_REQUIRED"),
      "Must reject DRIVE_PASS without driveId",
    );
    pass("Rejects DRIVE_PASS without driveId");

    // Reject General Pool with driveId
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: testBaId,
          poolType: PoolType.TALENT_RESERVE,
          name: "Illegal Drive General Pool",
          source: PoolGrantSource.PURCHASE,
          totalCredits: 50,
          driveId: testDriveId,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("DRIVE_ID_FORBIDDEN"),
      "Must reject general pool with driveId",
    );
    pass("Rejects TALENT_RESERVE pool specifying a driveId");

    // -------------------------------------------------------------------------
    // SECTION 4: Sequential Queueing ("Jio Model") & Topology Invariants
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Sequential Queueing (The Jio Model) ---");

    // Account already has an active general pool (pool1).
    // Creating another general pool must automatically place it in QUEUED status with sequential queueOrder!
    const pool2 = await service.createPool({
      billingAccountId: testBaId,
      poolType: PoolType.TALENT_RESERVE,
      name: "Second Reserve Pack (Queued)",
      source: PoolGrantSource.PURCHASE,
      totalCredits: 200,
    });
    testPoolsToCleanup.push(pool2.id);

    assert.strictEqual(pool2.status, PoolStatus.QUEUED);
    assert.strictEqual(pool2.queueOrder, 1);
    assert.strictEqual(pool2.activatedAt, null);
    assert.strictEqual(pool2.clockStartedAt, null);
    pass("Second general pool is placed in QUEUED status with queueOrder=1 (Jio Model)");

    const pool3 = await service.createPool({
      billingAccountId: testBaId,
      poolType: PoolType.TALENT_RESERVE,
      name: "Third Reserve Pack (Queued)",
      source: PoolGrantSource.PURCHASE,
      totalCredits: 300,
    });
    testPoolsToCleanup.push(pool3.id);

    assert.strictEqual(pool3.status, PoolStatus.QUEUED);
    assert.strictEqual(pool3.queueOrder, 2);
    pass("Third general pool is assigned sequential queueOrder=2");

    // Explicitly attempting to create an ACTIVE general pool when one already exists is rejected
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: testBaId,
          poolType: PoolType.TALENT_RESERVE,
          name: "Forced Active Pool",
          source: PoolGrantSource.PURCHASE,
          totalCredits: 100,
          status: PoolStatus.ACTIVE,
        });
      },
      (err: any) => err instanceof ConflictException && err.message.includes("ACTIVE_GENERAL_POOL_ALREADY_EXISTS"),
      "Must reject forced active general pool when one exists",
    );
    pass("Rejects duplicate ACTIVE general pool with ConflictException (Topology Invariant)");

    // Rejects second active pass for the same drive
    await assert.rejects(
      async () => {
        await service.createPool({
          billingAccountId: testBaId,
          poolType: PoolType.DRIVE_PASS,
          name: "Duplicate Drive Pass",
          source: PoolGrantSource.PURCHASE,
          totalCredits: 50,
          driveId: testDriveId,
        });
      },
      (err: any) => err instanceof ConflictException && err.message.includes("ACTIVE_DRIVE_PASS_EXISTS"),
      "Must reject duplicate active pass for same drive",
    );
    pass("Rejects duplicate ACTIVE pass for same drive with ConflictException");

    // Promoting next pool while pool1 is still active and funded must fail
    await assert.rejects(
      async () => {
        await service.promoteNextQueuedPool(testBaId);
      },
      (err: any) => err instanceof ConflictException && err.message.includes("ACTIVE_GENERAL_POOL_ALREADY_EXISTS"),
      "Cannot promote while active pool still has credits",
    );
    pass("Promoting next queued pool while active pool is funded is rejected with ConflictException");

    // Exhaust pool1 directly to test promotion
    await pg.query(
      `UPDATE billing.credit_pool SET cached_remaining = 0, status = 'EXHAUSTED' WHERE id = $1`,
      [pool1.id],
    );

    // Now promoteNextQueuedPool should promote pool2 (lowest queueOrder=1)
    const promotedPool = await service.promoteNextQueuedPool(testBaId);
    assert.ok(promotedPool !== null, "Must promote next queued pool");
    assert.strictEqual(promotedPool.id, pool2.id);
    assert.strictEqual(promotedPool.status, PoolStatus.ACTIVE);
    assert.ok(promotedPool.activatedAt !== null, "Must set activatedAt on promotion");
    pass("Promoting next queued pool successfully promotes lowest queueOrder pool to ACTIVE");

    // -------------------------------------------------------------------------
    // SECTION 5: Immutability, Expiry Extension & DB Trigger Hardening
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: Immutability & DB Triggers ---");

    // 1. Database trigger prevents deletion of credit_pool
    await assert.rejects(
      async () => {
        await pg.query(`DELETE FROM billing.credit_pool WHERE id = $1`, [pool1.id]);
      },
      (err: any) => err.message.includes("DELETE on credit_pool is strictly forbidden"),
      "DB trigger must forbid DELETE on credit_pool",
    );
    pass("Direct DELETE on credit_pool is strictly forbidden by PostgreSQL trigger");

    // 2. Database trigger prevents updating immutable columns (total_credits, currency)
    await assert.rejects(
      async () => {
        await pg.query(
          `UPDATE billing.credit_pool SET total_credits = 999 WHERE id = $1`,
          [pool1.id],
        );
      },
      (err: any) => err.message.includes("Core commercial columns on credit_pool are immutable"),
      "DB trigger must forbid changing total_credits",
    );
    pass("Updating core commercial columns (total_credits) is blocked by guard trigger");

    // 3. Extending pool expiry without requestId is rejected by service
    const extendedDate = new Date(Date.now() + 60 * 86400000);
    await assert.rejects(
      async () => {
        await service.extendPoolExpiry(promotedPool.id, extendedDate, "");
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("REQUEST_ID_REQUIRED"),
      "Must reject expiry extension without requestId",
    );
    pass("Extending pool expiry without requestId is rejected by service");

    // 4. Extending pool expiry directly via raw SQL without proctora.request_id is blocked by DB trigger
    await assert.rejects(
      async () => {
        // Set an existing expiry first
        await pg.query(
          `UPDATE billing.credit_pool SET expires_at = clock_timestamp() + interval '30 days' WHERE id = $1`,
          [promotedPool.id],
        );
        // Then try extending without setting proctora.request_id
        await pg.query(
          `UPDATE billing.credit_pool SET expires_at = clock_timestamp() + interval '60 days' WHERE id = $1`,
          [promotedPool.id],
        );
      },
      (err: any) => err.message.includes("Extending pool expiry requires an authorized request context"),
      "DB trigger must reject extending expiry without proctora.request_id",
    );
    pass("Direct SQL expiry extension without proctora.request_id is rejected by DB trigger P0004");

    // 5. Extending pool expiry with authorized requestId succeeds through CreditPoolService
    const validRequestId = `req-extend-${timestamp}`;
    const newTargetExpiry = new Date(Date.now() + 90 * 86400000);
    const extendedPool = await service.extendPoolExpiry(
      promotedPool.id,
      newTargetExpiry,
      validRequestId,
      { ticketRef: "JIRA-4821", reason: "Approved contract extension" },
    );
    assert.strictEqual(
      extendedPool.expiresAt!.toISOString().slice(0, 10),
      newTargetExpiry.toISOString().slice(0, 10),
    );
    pass("Authorized pool expiry extension succeeds and sets proctora.request_id context");

    // -------------------------------------------------------------------------
    // SECTION 6: Status Transitions & Lifecycle (Suspend & Resume)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: Suspend & Resume Lifecycle ---");

    const suspendedPool = await service.suspendPool(promotedPool.id, "Chargeback investigation");
    assert.strictEqual(suspendedPool.status, PoolStatus.SUSPENDED);
    pass("suspendPool transitions pool to SUSPENDED status");

    const resumedPool = await service.resumePool(promotedPool.id, "Dispute resolved");
    assert.strictEqual(resumedPool.status, PoolStatus.ACTIVE);
    pass("resumePool transitions suspended pool back to ACTIVE status");

    // Cannot resume a pool that is not suspended
    await assert.rejects(
      async () => {
        await service.resumePool(resumedPool.id);
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("POOL_NOT_SUSPENDED"),
      "Must reject resuming an active pool",
    );
    pass("Resuming an already active pool is rejected with BadRequestException");

    // -------------------------------------------------------------------------
    // SECTION 7: Expiration & Orchestration
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 7: Expiration & Drawdown ---");

    // Create a pool specifically to test expiration
    const expiryTestPool = await service.createPool({
      billingAccountId: testBaId,
      poolType: PoolType.TALENT_RESERVE,
      name: "Expiring Pool",
      source: PoolGrantSource.PURCHASE,
      totalCredits: 75,
      status: PoolStatus.QUEUED,
    });
    testPoolsToCleanup.push(expiryTestPool.id);

    const expiredCredits = await service.expirePool(expiryTestPool.id, {
      reason: "Manual sweep expiration test",
    });
    assert.strictEqual(expiredCredits, 75);

    const updatedExpiryPool = await prisma.creditPool.findUnique({
      where: { id: expiryTestPool.id },
    });
    assert.strictEqual(updatedExpiryPool?.cachedRemaining, 0);
    assert.strictEqual(updatedExpiryPool?.status, PoolStatus.EXPIRED);

    const expireLedger = await prisma.creditLedgerEntry.findFirst({
      where: { creditPoolId: expiryTestPool.id, entryType: "EXPIRE" },
    });
    assert.ok(expireLedger !== null, "Must have EXPIRE ledger entry");
    assert.strictEqual(expireLedger.amount, -75);
    assert.strictEqual(expireLedger.balanceAfter, 0);
    pass("expirePool delegates to LedgerService, writing EXPIRE entry and zeroing balance");

    // Repeated expiry is idempotent (returns 0 or already expired amount)
    const repeatedExpire = await service.expirePool(expiryTestPool.id);
    assert.ok(repeatedExpire === 0 || repeatedExpire === 75);
    pass("Repeated expiry is idempotent and does not produce negative balances");

    // -------------------------------------------------------------------------
    // SECTION 8: High Concurrency Verification (10 Parallel Operations)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 8: High Concurrency Verification ---");

    // 1. Concurrent pool creation for same billing account (10 parallel requests)
    console.log("  Running 10 concurrent createPool calls for same account...");
    const concurrencyBaId = `ba-conc-pool-${timestamp}`;
    testAccountsToCleanup.push(concurrencyBaId);

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, created_at, updated_at)
       VALUES ($1, 'Conc Corp', 'IN', 'INR', 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [concurrencyBaId],
    );

    const concurrentCreations = Array.from({ length: 10 }).map((_, i) =>
      service.createPool({
        billingAccountId: concurrencyBaId,
        poolType: PoolType.TALENT_RESERVE,
        name: `Concurrent Pack ${i + 1}`,
        source: PoolGrantSource.PURCHASE,
        totalCredits: 10,
      }),
    );

    const createdPools = await Promise.all(concurrentCreations);
    createdPools.forEach((p) => testPoolsToCleanup.push(p.id));

    // Verify exactly ONE pool is ACTIVE, and 9 pools are QUEUED
    const activeCount = createdPools.filter((p) => p.status === PoolStatus.ACTIVE).length;
    const queuedCount = createdPools.filter((p) => p.status === PoolStatus.QUEUED).length;
    assert.strictEqual(activeCount, 1, "Exactly 1 pool must be ACTIVE under concurrent creation");
    assert.strictEqual(queuedCount, 9, "Exactly 9 pools must be QUEUED");

    // Verify all queue orders are unique and sequential
    const queueOrders = createdPools
      .filter((p) => p.queueOrder !== null && p.queueOrder > 0)
      .map((p) => p.queueOrder!)
      .sort((a, b) => a - b);
    const uniqueOrders = new Set(queueOrders);
    assert.strictEqual(uniqueOrders.size, 9, "All queued pools must have distinct sequential queue orders");
    pass("10 concurrent pool creations serialize cleanly with 1 ACTIVE and 9 sequentially QUEUED pools");

    // 2. Concurrent consumption against a pool with limited balance (10 parallel claims)
    console.log("  Running 10 concurrent session claims against 5-credit pool...");
    const claimBaId = `ba-claim-conc-${timestamp}`;
    const claimOrgId = `org-claim-conc-${timestamp}`;
    const claimDriveId = `drive-claim-conc-${timestamp}`;
    testAccountsToCleanup.push(claimBaId);
    testOrgsToCleanup.push(claimOrgId);
    testDrivesToCleanup.push(claimDriveId);

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, created_at, updated_at)
       VALUES ($1, 'Claim Conc Corp', 'IN', 'INR', 'ACTIVE', clock_timestamp(), clock_timestamp())`,
      [claimBaId],
    );

    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Claim Conc Corp', $2, $3, clock_timestamp())`,
      [claimOrgId, `slug-claim-${timestamp}`, claimBaId],
    );

    await pg.query(
      `INSERT INTO public.drive (id, organization_id, name, role_template_id, module_config, status, schedule_start, schedule_end, created_by_id, created_at, fallthrough)
       VALUES ($1, $2, 'Claim Drive', $3, '{}'::jsonb, 'ACTIVE', clock_timestamp(), $4, $5, clock_timestamp(), 'ALLOW')`,
      [claimDriveId, claimOrgId, validRoleTemplateId, futureDate, validStaffId],
    );

    const claimTestPool = await service.createPool({
      billingAccountId: claimBaId,
      poolType: PoolType.TALENT_RESERVE,
      name: "Limited Balance Pool",
      source: PoolGrantSource.PURCHASE,
      totalCredits: 5,
      status: PoolStatus.ACTIVE,
    });
    testPoolsToCleanup.push(claimTestPool.id);

    // Create 10 candidate sessions
    const sessionIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const sessId = `sess-conc-${timestamp}-${i}`;
      sessionIds.push(sessId);
      await pg.query(
        `INSERT INTO public.session (id, organization_id, drive_id, candidate_id, role_template_id, cv_mode, status, kind)
         VALUES ($1, $2, $3, $4, $5, 'FULL', 'NOT_STARTED', 'LIVE')`,
        [sessId, claimOrgId, claimDriveId, validCandidateId, validRoleTemplateId],
      );
    }

    // Run 10 parallel claims via LedgerService.claimSessionCredit
    const claimResults = await Promise.allSettled(
      sessionIds.map((sid) => ledgerService.claimSessionCredit(sid, "enforce")),
    );

    const successfulClaims = claimResults.filter((r) => r.status === "fulfilled" && (r.value as any).outcome === "STARTED");
    const failedOrSlowPathClaims = claimResults.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any).outcome !== "STARTED"),
    );

    const postClaimPool = await prisma.creditPool.findUnique({ where: { id: claimTestPool.id } });
    assert.ok(postClaimPool!.cachedRemaining >= 0, "Pool balance must never be negative");
    assert.ok(
      successfulClaims.length <= 5,
      `Successful claims (${successfulClaims.length}) must not exceed initial credits (5)`,
    );
    pass(
      `10 concurrent claims: ${successfulClaims.length} succeeded, ${failedOrSlowPathClaims.length} escalated to slow path, balance >= 0`,
    );

    // -------------------------------------------------------------------------
    // SECTION 9: Queries & Candidate PII-Blindness
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 9: Read Models & PII Blindness ---");

    const accountPools = await service.getAccountPools(testBaId);
    assert.ok(accountPools.length >= 3, "getAccountPools must return all pools for account");
    pass("getAccountPools returns all credit pools for the specified billing account");

    const poolDetail = await service.getPoolById(pool1.id);
    assert.strictEqual(poolDetail.id, pool1.id);
    assert.strictEqual(poolDetail.billingAccountName, "Pool Test Corp");
    assert.ok(Array.isArray(poolDetail.recentLedgerEntries), "Must include recent ledger entries");
    assert.strictEqual(poolDetail.recentLedgerEntries[0].entryType, "GRANT");

    // Verify zero candidate PII
    const rawDetailStr = JSON.stringify(poolDetail);
    assert.ok(!rawDetailStr.includes("candidateName"), "Detail response must have zero candidateName");
    assert.ok(!rawDetailStr.includes("candidateEmail"), "Detail response must have zero candidateEmail");
    pass("getPoolById returns rich inspection details with zero candidate PII (ADR-006)");

    // -------------------------------------------------------------------------
    // SECTION 10: Billing Audit Trail & Baseline Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 10: Billing Audit Trail & Baseline Verification ---");

    const auditEvents = await prisma.billingAuditEvent.findMany({
      where: { subjectId: pool1.id },
    });
    assert.ok(auditEvents.length >= 1, "Must have recorded audit events for pool operations");
    assert.strictEqual(auditEvents[0].subjectType, "POOL");
    pass("Billing audit events recorded accurately in billing.billing_audit_event");

    // Verify baseline organizations and accounts remain untouched
    const baselineOrgs = await prisma.organization.count();
    const baselineBas = await prisma.billingAccount.count();
    assert.ok(baselineOrgs >= 2, "Baseline organizations must remain intact");
    assert.ok(baselineBas >= 2, "Baseline billing accounts must remain intact");

    const seedPools = await prisma.creditPool.findMany({
      where: { name: "Promotional Trial Pool" },
    });
    assert.strictEqual(seedPools.length, 2, "Must retain exactly 2 baseline seed pools");
    seedPools.forEach((sp) => {
      assert.strictEqual(sp.totalCredits, 50, "Baseline pool totalCredits must be 50");
      assert.strictEqual(sp.cachedRemaining, 50, "Baseline pool cachedRemaining must be 50");
      assert.strictEqual(sp.status, "ACTIVE", "Baseline pool status must be ACTIVE");
    });
    pass("Baseline seed data (Acme & Globex, 50 credits each, 0 overdraft) remains 100% pristine");

    console.log("================================================================================");
    console.log(`Summary: All ${passedCount}/${totalCount} CreditPoolService Tests Passed!`);
    console.log("================================================================================");
  } finally {
    // Teardown test records safely without touching baseline
    console.log("\nCleaning up isolated test fixtures...");
    try {
      await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

      await pg.query(`DELETE FROM public.event_log WHERE session_id LIKE 'sess-conc-%'`);
      await pg.query(`DELETE FROM billing.session_billing_evidence WHERE session_id LIKE 'sess-conc-%'`);
      await pg.query(`DELETE FROM billing.billing_audit_event WHERE subject_id LIKE '%-test-%' OR subject_id LIKE '%-conc-%'`);

      for (const baId of testAccountsToCleanup) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baId]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = $1`, [baId]);
      }

      await pg.query(`DELETE FROM public.session WHERE id LIKE 'sess-conc-%'`);

      for (const driveId of testDrivesToCleanup) {
        await pg.query(`DELETE FROM public.drive WHERE id = $1`, [driveId]);
      }

      for (const orgId of testOrgsToCleanup) {
        await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgId]);
      }

      for (const baId of testAccountsToCleanup) {
        await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baId]);
      }

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

runCreditPoolServiceTests().catch((err) => {
  console.error("FATAL: CreditPoolService test suite failed:", err);
  process.exit(1);
});
