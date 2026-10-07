import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { strict as assert } from "assert";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { TrialGrantService } from "./trial-grant.service";
import { TRIAL_POLICY } from "./trial-grant.types";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function runTrialGrantServiceTests() {
  console.log("================================================================================");
  console.log("Phase 2 â€” TrialGrantService Comprehensive Verification & Hardening Suite");
  console.log("================================================================================");

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  const prisma = new PrismaClient();
  const ledgerService = new LedgerService(prisma as any);
  const creditPoolService = new CreditPoolService(prisma as any, ledgerService);
  const service = new TrialGrantService(prisma as any, creditPoolService);

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

  // Helper to create isolated test organization and billing account
  async function createTestAccount(suffix: string, status = "ACTIVE") {
    const baId = `ba-trial-${timestamp}-${suffix}`;
    const orgId = `org-trial-${timestamp}-${suffix}`;

    await pg.query(
      `INSERT INTO billing.billing_account (id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at)
       VALUES ($1, $2, 'IN', 'INR', $3, 0, 0, clock_timestamp(), clock_timestamp())`,
      [baId, `Trial Test Corp ${suffix}`, status],
    );
    testAccountsToCleanup.push(baId);

    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())`,
      [orgId, `Trial Test Corp ${suffix}`, `slug-trial-${timestamp}-${suffix}`, baId],
    );
    testOrgsToCleanup.push(orgId);

    return { baId, orgId };
  }

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Policy Invariants & Creation
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: Policy Invariants & Creation ---");

    const { baId: ba1 } = await createTestAccount("1");
    const domain1 = `acme-corp-${timestamp}.com`;

    const result1 = await service.grantTrial(ba1, domain1);

    assert.strictEqual(result1.billingAccountId, ba1);
    assert.strictEqual(result1.creditsGranted, 25, "Must grant exactly 25 credits per policy");
    assert.strictEqual(result1.validityDays, 30, "Must have exactly 30 days validity per policy");
    assert.strictEqual(result1.status, "ACTIVE", "Trial pool must start in ACTIVE status");
    assert.ok(result1.poolId, "Must return valid poolId");
    assert.ok(result1.ledgerEntryId, "Must return valid ledgerEntryId");
    assert.ok(result1.expiresAt instanceof Date, "Must calculate expiresAt Date");

    const expectedExpiry = new Date(Date.now() + 30 * 86400000);
    const diffHours = Math.abs(result1.expiresAt.getTime() - expectedExpiry.getTime()) / 3600000;
    assert.ok(diffHours < 2, "ExpiresAt must be approximately 30 days from now");
    pass("grantTrial executes policy grant (25 credits, 30 days, ACTIVE status)");

    // Verify CreditPool entity in database
    const pool1 = await prisma.creditPool.findUnique({ where: { id: result1.poolId } });
    assert.ok(pool1, "Credit pool record must exist");
    assert.strictEqual(pool1!.poolType, "TALENT_RESERVE", "Pool type must be TALENT_RESERVE");
    assert.strictEqual(pool1!.source, "TRIAL", "Grant source must be TRIAL");
    assert.strictEqual(pool1!.totalCredits, 25, "totalCredits must be 25");
    assert.strictEqual(pool1!.cachedRemaining, 25, "cachedRemaining must be 25");
    assert.strictEqual(pool1!.status, "ACTIVE", "Pool status must be ACTIVE");
    pass("Trial credit pool created with TALENT_RESERVE and TRIAL source");

    // Verify Ledger Entry as source of truth
    const ledgerEntry = await prisma.creditLedgerEntry.findUnique({
      where: { id: result1.ledgerEntryId },
    });
    assert.ok(ledgerEntry, "Opening ledger entry must exist");
    assert.strictEqual(ledgerEntry!.creditPoolId, result1.poolId);
    assert.strictEqual(ledgerEntry!.entryType, "GRANT");
    assert.strictEqual(ledgerEntry!.amount, 25);
    assert.strictEqual(ledgerEntry!.balanceAfter, 25);
    assert.strictEqual(ledgerEntry!.grantSource, "TRIAL");
    assert.strictEqual(ledgerEntry!.actorId, "system");
    assert.strictEqual(pool1!.cachedRemaining, ledgerEntry!.balanceAfter);
    pass("LedgerService source of truth: GRANT ledger entry (+25) matches pool cachedRemaining");

    // Verify BillingAccount trial metadata
    const updatedBa1 = await prisma.billingAccount.findUnique({ where: { id: ba1 } });
    assert.strictEqual(updatedBa1!.trialDomain, domain1);
    assert.ok(updatedBa1!.trialGrantedAt !== null, "trialGrantedAt timestamp must be recorded");
    pass("BillingAccount trialDomain and trialGrantedAt updated accurately");

    // -------------------------------------------------------------------------
    // SECTION 2: Validation & Eligibility Boundaries
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Validation & Eligibility Boundaries ---");

    // Missing billingAccountId
    await assert.rejects(
      async () => service.grantTrial("", domain1),
      (err: any) => err instanceof BadRequestException,
      "Must reject empty billingAccountId with BadRequestException",
    );
    pass("Rejects empty billingAccountId with BadRequestException");

    // Nonexistent billingAccountId
    await assert.rejects(
      async () => service.grantTrial("ba-nonexistent-uuid", domain1),
      (err: any) => err instanceof NotFoundException,
      "Must reject nonexistent billingAccountId with NotFoundException",
    );
    pass("Rejects nonexistent billingAccountId with NotFoundException");

    // Missing corporateDomain
    await assert.rejects(
      async () => service.grantTrial(ba1, ""),
      (err: any) => err instanceof BadRequestException,
      "Must reject empty corporateDomain with BadRequestException",
    );
    pass("Rejects empty corporateDomain with BadRequestException");

    // Invalid corporateDomain format
    await assert.rejects(
      async () => service.grantTrial(ba1, "invalid_domain_without_dot"),
      (err: any) => err instanceof BadRequestException,
      "Must reject domain without dot with BadRequestException",
    );
    await assert.rejects(
      async () => service.grantTrial(ba1, "space domain.com"),
      (err: any) => err instanceof BadRequestException,
      "Must reject domain with spaces with BadRequestException",
    );
    pass("Rejects malformed corporate domains with BadRequestException");

    // Suspended billing account
    const { baId: baSuspended } = await createTestAccount("suspended", "SUSPENDED");
    await assert.rejects(
      async () => service.grantTrial(baSuspended, `suspended-${timestamp}.com`),
      (err: any) => err instanceof ForbiddenException,
      "Must reject suspended billing account with ForbiddenException",
    );
    pass("Rejects suspended billing account with ForbiddenException");

    // -------------------------------------------------------------------------
    // SECTION 3: One Trial Per Corporate Domain (INV-TNT-02)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: One Trial Per Corporate Domain (INV-TNT-02) ---");

    const { baId: ba2 } = await createTestAccount("2");

    // Attempting to grant trial to ba2 using domain1 (already claimed by ba1)
    await assert.rejects(
      async () => service.grantTrial(ba2, domain1),
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.ok(err.message.includes("DOMAIN_ALREADY_RECEIVED_TRIAL"));
        return true;
      },
      "Must reject second trial on same corporate domain with ConflictException('DOMAIN_ALREADY_RECEIVED_TRIAL')",
    );
    pass("Rejects second trial for same corporate domain with DOMAIN_ALREADY_RECEIVED_TRIAL");

    // Case-insensitivity and whitespace normalization
    await assert.rejects(
      async () => service.grantTrial(ba2, `   ${domain1.toUpperCase()}   `),
      (err: any) => err instanceof ConflictException,
      "Domain normalization must prevent casing/whitespace bypass",
    );
    pass("Corporate domain normalization strictly prevents case/whitespace bypass");

    // -------------------------------------------------------------------------
    // SECTION 4: Idempotency & Replay Semantics
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Idempotency & Replay Semantics ---");

    // Exact retry for ba1 with domain1: must return existing canonical trial pool without minting credits
    const retryResult = await service.grantTrial(ba1, domain1);
    assert.strictEqual(retryResult.poolId, result1.poolId, "Idempotent retry must return existing poolId");
    assert.strictEqual(retryResult.ledgerEntryId, result1.ledgerEntryId);
    assert.strictEqual(retryResult.creditsGranted, 25);

    // Verify no duplicate pool was created
    const poolsForBa1 = await prisma.creditPool.findMany({ where: { billingAccountId: ba1 } });
    assert.strictEqual(poolsForBa1.length, 1, "Must NOT create duplicate credit pools on retry");

    // Verify no duplicate ledger entries were created
    const ledgersForBa1 = await prisma.creditLedgerEntry.findMany({ where: { billingAccountId: ba1 } });
    assert.strictEqual(ledgersForBa1.length, 1, "Must NOT create duplicate ledger entries on retry");
    assert.strictEqual(ledgersForBa1[0].amount, 25);
    pass("Exact retry returns canonical trial grant without creating duplicate pools or ledger entries");

    // Attempting to grant a trial to ba1 with a DIFFERENT domain must be rejected
    await assert.rejects(
      async () => service.grantTrial(ba1, `new-diff-domain-${timestamp}.com`),
      (err: any) => {
        assert.ok(err instanceof ConflictException);
        assert.ok(err.message.includes("ACCOUNT_ALREADY_RECEIVED_TRIAL"));
        return true;
      },
      "Account that already received a trial cannot claim another trial under a new domain",
    );
    pass("Account already granted trial rejected from claiming a second trial under another domain");

    // -------------------------------------------------------------------------
    // SECTION 5: Transactional Atomicity & Rollback
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: Transactional Atomicity & Rollback ---");

    const { baId: baRollback } = await createTestAccount("rollback");
    const domainRollback = `rollback-${timestamp}.com`;

    // Simulate downstream transaction failure in interactive transaction client
    try {
      await prisma.$transaction(async (tx) => {
        await service.grantTrial(baRollback, domainRollback, { transactionClient: tx });
        throw new Error("SIMULATED_DOWNSTREAM_FAILURE");
      });
    } catch (err: any) {
      assert.strictEqual(err.message, "SIMULATED_DOWNSTREAM_FAILURE");
    }

    // Verify rollback leaves zero traces
    const baRollbackRecord = await prisma.billingAccount.findUnique({ where: { id: baRollback } });
    assert.strictEqual(baRollbackRecord!.trialDomain, null, "trialDomain must remain null after rollback");
    assert.strictEqual(baRollbackRecord!.trialGrantedAt, null, "trialGrantedAt must remain null after rollback");

    const orphanPools = await prisma.creditPool.findMany({ where: { billingAccountId: baRollback } });
    assert.strictEqual(orphanPools.length, 0, "No orphan credit pool must exist after rollback");

    const orphanLedgers = await prisma.creditLedgerEntry.findMany({ where: { billingAccountId: baRollback } });
    assert.strictEqual(orphanLedgers.length, 0, "No orphan ledger entries must exist after rollback");
    pass("Transaction failure cleanly rolls back trial pool, ledger entry, and account metadata");

    // Retry after rollback must now succeed cleanly
    const postRollbackResult = await service.grantTrial(baRollback, domainRollback);
    assert.strictEqual(postRollbackResult.creditsGranted, 25);
    pass("Subsequent retry after transactional rollback succeeds cleanly");

    // -------------------------------------------------------------------------
    // SECTION 6: High Concurrency Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: High Concurrency Verification ---");

    // Test 6.1: 10 concurrent requests for the SAME corporate domain across 10 accounts
    console.log("  Running 10 concurrent grantTrial calls for SAME corporate domain across 10 accounts...");
    const domainShared = `shared-race-${timestamp}.com`;
    const accountsForRace: string[] = [];

    for (let i = 0; i < 10; i++) {
      const { baId } = await createTestAccount(`race-${i}`);
      accountsForRace.push(baId);
    }

    const concurrentDomainResults = await Promise.allSettled(
      accountsForRace.map((baId) => service.grantTrial(baId, domainShared)),
    );

    const domainSuccesses = concurrentDomainResults.filter((r) => r.status === "fulfilled");
    const domainFailures = concurrentDomainResults.filter((r) => r.status === "rejected");

    assert.strictEqual(
      domainSuccesses.length,
      1,
      `Exactly 1 account must win the trial grant (got ${domainSuccesses.length})`,
    );
    assert.strictEqual(
      domainFailures.length,
      9,
      `Exactly 9 accounts must be rejected with ConflictException (got ${domainFailures.length})`,
    );

    domainFailures.forEach((f: any) => {
      assert.ok(f.reason instanceof ConflictException);
      assert.ok(f.reason.message.includes("DOMAIN_ALREADY_RECEIVED_TRIAL"));
    });

    const totalSharedPools = await prisma.creditPool.findMany({
      where: { billingAccountId: { in: accountsForRace } },
    });
    assert.strictEqual(totalSharedPools.length, 1, "Exactly 1 credit pool minted across all 10 racing accounts");
    pass("10 concurrent grantTrial calls on SAME domain: exactly 1 wins, 9 rejected with ConflictException");

    // Test 6.2: 5 parallel calls for the SAME account and SAME domain (double-click simulation)
    console.log("  Running 5 parallel grantTrial calls for SAME account and SAME domain...");
    const { baId: baParallel } = await createTestAccount("parallel");
    const domainParallel = `parallel-${timestamp}.com`;

    const parallelResults = await Promise.allSettled(
      Array.from({ length: 5 }).map(() => service.grantTrial(baParallel, domainParallel)),
    );

    const parallelSuccesses = parallelResults.filter((r) => r.status === "fulfilled");
    assert.strictEqual(parallelSuccesses.length, 5, "All parallel requests must resolve to canonical trial grant");

    const canonicalPoolId = (parallelSuccesses[0] as any).value.poolId;
    parallelSuccesses.forEach((s: any) => {
      assert.strictEqual(s.value.poolId, canonicalPoolId, "All parallel calls must return identical poolId");
      assert.strictEqual(s.value.creditsGranted, 25);
    });

    const parallelPools = await prisma.creditPool.findMany({ where: { billingAccountId: baParallel } });
    assert.strictEqual(parallelPools.length, 1, "Exactly 1 pool created under parallel execution");
    pass("Parallel double-click calls on same account serialize and return identical canonical trial grant");

    // Test 6.3: Concurrent trial grants for 5 DIFFERENT corporate domains
    console.log("  Running 5 concurrent grantTrial calls for DIFFERENT corporate domains...");
    const independentAccounts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { baId } = await createTestAccount(`indep-${i}`);
      independentAccounts.push(baId);
    }

    const independentResults = await Promise.allSettled(
      independentAccounts.map((baId, idx) =>
        service.grantTrial(baId, `indep-${idx}-${timestamp}.com`),
      ),
    );

    const indepSuccesses = independentResults.filter((r) => r.status === "fulfilled");
    assert.strictEqual(indepSuccesses.length, 5, "All 5 independent domain grants must succeed");
    pass("Concurrent trial grants for independent corporate domains succeed cleanly in parallel");

    // -------------------------------------------------------------------------
    // SECTION 7: Zero Overdraft & Credit Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 7: Zero Overdraft & Credit Isolation ---");

    const checkedAccount = await prisma.billingAccount.findUnique({ where: { id: ba1 } });
    assert.strictEqual(checkedAccount!.overdraftLimit, 0, "overdraftLimit must remain 0");
    assert.strictEqual(checkedAccount!.overdraftUsed, 0, "overdraftUsed must remain 0");
    assert.strictEqual(checkedAccount!.hasPaidPurchase, false, "hasPaidPurchase must remain false for trial");
    pass("Trial grant preserves permanent zero overdraft and unpurchased status");

    // -------------------------------------------------------------------------
    // SECTION 8: Billing Audit Trail & System Actor
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 8: Billing Audit Trail & System Actor ---");

    const auditEvents = await prisma.billingAuditEvent.findMany({
      where: { subjectId: ba1, action: "TRIAL_GRANTED" },
    });

    assert.ok(auditEvents.length >= 1, "Must record TRIAL_GRANTED billing audit event");
    const trialAudit = auditEvents[0];
    assert.strictEqual(trialAudit.actorId, "system");
    assert.strictEqual(trialAudit.actorRole, "system");
    assert.strictEqual(trialAudit.subjectType, "BILLING_ACCOUNT");
    assert.strictEqual(trialAudit.executionResult, "SUCCESS");
    assert.ok(trialAudit.after, "Audit after payload must be recorded");

    // Verify immutability of audit record
    await assert.rejects(
      async () =>
        pg.query(
          `UPDATE billing.billing_audit_event SET action = 'TAMPERED' WHERE id = $1`,
          [trialAudit.id],
        ),
      (err: any) => err.message.includes("append-only"),
      "Audit event UPDATE must be blocked by database trigger",
    );
    pass("Append-only billing audit event recorded with actor=system and verified tamper-proof");

    // -------------------------------------------------------------------------
    // SECTION 9: Read Model (getTrialStatus)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 9: Read Model (getTrialStatus) ---");

    const statusGranted = await service.getTrialStatus(ba1);
    assert.strictEqual(statusGranted.hasReceivedTrial, true);
    assert.strictEqual(statusGranted.trialDomain, domain1);
    assert.ok(statusGranted.trialGrantedAt !== null);
    assert.ok(statusGranted.trialPool !== null);
    assert.strictEqual(statusGranted.trialPool!.totalCredits, 25);
    assert.strictEqual(statusGranted.trialPool!.cachedRemaining, 25);
    assert.strictEqual(statusGranted.trialPool!.status, "ACTIVE");

    const { baId: baFresh } = await createTestAccount("fresh");
    const statusFresh = await service.getTrialStatus(baFresh);
    assert.strictEqual(statusFresh.hasReceivedTrial, false);
    assert.strictEqual(statusFresh.trialDomain, null);
    assert.strictEqual(statusFresh.trialGrantedAt, null);
    assert.strictEqual(statusFresh.trialPool, null);
    pass("getTrialStatus returns accurate trial telemetry and pool breakdown without mutation");

    // -------------------------------------------------------------------------
    // SECTION 10: Baseline Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 10: Baseline Verification ---");

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
    pass("Baseline seed data (Acme & Globex, 50 credits each, 0 overdraft) remains 100% pristine");

    console.log("================================================================================");
    console.log(`Summary: All ${passedCount}/${totalCount} TrialGrantService Tests Passed!`);
    console.log("================================================================================");
  } finally {
    console.log("\nCleaning up isolated test fixtures...");
    try {
      await pg.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
      await pg.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

      await pg.query(`DELETE FROM billing.billing_audit_event WHERE subject_id LIKE '%-trial-%'`);

      for (const baId of testAccountsToCleanup) {
        await pg.query(`DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1`, [baId]);
        await pg.query(`DELETE FROM billing.credit_pool WHERE billing_account_id = $1`, [baId]);
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

runTrialGrantServiceTests().catch((err) => {
  console.error("FATAL: TrialGrantService test suite failed:", err);
  process.exit(1);
});
