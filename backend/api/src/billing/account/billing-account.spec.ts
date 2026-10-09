import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import assert from "node:assert";
import { NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { BillingAccountService } from "./billing-account.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { AuthenticatedPlatformActor } from "../../platform/audit/platform-audit.types";

const DB_URL = process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function createPgClient(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function runBillingAccountServiceTests() {
  console.log("================================================================================");
  console.log("Phase 2 — BillingAccountService Characterization & Lifecycle Gate Suite");
  console.log("================================================================================");

  let passedCount = 0;
  let totalCount = 0;

  function pass(msg: string) {
    totalCount++;
    passedCount++;
    console.log(`✅ TEST [${totalCount}]: ${msg}`);
  }

  const prisma = new PrismaClient();
  const service = new BillingAccountService(prisma as any);
  const pg = await createPgClient();

  const timestamp = Date.now();
  const testOrgsToCleanup: string[] = [];
  const testAccountsToCleanup: string[] = [];

  const platformActor: AuthenticatedPlatformActor = {
    id: "staff-owner-uuid-1",
    role: PlatformStaffRole.OWNER,
    platformRole: PlatformStaffRole.OWNER,
    isPlatformStaff: true,
    email: "owner@cdrecruit.local",
  };

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Account Creation & Linking for Organization Without Account
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: Creation & Linking ---");

    const org1Id = `org-ba-test-1-${timestamp}`;
    const org1Slug = `org-ba-slug-1-${timestamp}`;
    testOrgsToCleanup.push(org1Id);

    // Create target organization with no billing account (billingAccountId = null)
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Alpha Corp', $2, NULL, clock_timestamp())`,
      [org1Id, org1Slug],
    );

    const result1 = await service.createForOrganization(
      org1Id,
      {
        accountName: "Alpha Corp Payer",
        billingCountry: "IN",
        legalEntityName: "Alpha Corporate India Private Limited",
        taxId: "29AABCA1234F1Z1",
        trialDomain: `alpha-${timestamp}.com`,
      },
      { actor: platformActor },
    );
    testAccountsToCleanup.push(result1.id);

    // TEST 1: Creates a BillingAccount for an Organization without one
    assert.ok(result1.id, "Result must contain generated billing account id");
    assert.strictEqual(result1.organizationId, org1Id);
    assert.strictEqual(result1.name, "Alpha Corp Payer");
    pass("Creates a BillingAccount for an Organization without one");

    // TEST 2: Links Organization.billingAccountId
    const orgCheck1 = await prisma.organization.findUnique({
      where: { id: org1Id },
    });
    assert.strictEqual(orgCheck1?.billingAccountId, result1.id, "Organization must be linked to newly created account");
    pass("Links Organization.billingAccountId accurately in database");

    // TEST 3: Uses the correct currency derived from country
    assert.strictEqual(result1.billingCountry, "IN");
    assert.strictEqual(result1.currency, "INR", "India country must derive INR currency");
    pass("Uses the correct currency derived from country (IN -> INR)");

    // TEST 4: Uses the correct initial account state
    assert.strictEqual(result1.status, "ACTIVE");
    assert.strictEqual(result1.trialDomain, `alpha-${timestamp}.com`);
    const dbAccount1 = await prisma.billingAccount.findUnique({
      where: { id: result1.id },
    });
    assert.strictEqual(dbAccount1?.status, "ACTIVE");
    assert.strictEqual(dbAccount1?.hasPaidPurchase, false);
    assert.strictEqual(dbAccount1?.legalEntityName, "Alpha Corporate India Private Limited");
    assert.strictEqual(dbAccount1?.taxId, "29AABCA1234F1Z1");
    pass("Uses authoritative initial account state (ACTIVE, hasPaidPurchase=false, exact metadata)");

    // TEST 5: Overdraft limit is zero permanently
    assert.strictEqual(dbAccount1?.overdraftLimit, 0, "Overdraft limit must be 0");
    assert.strictEqual(dbAccount1?.overdraftUsed, 0, "Overdraft used must be 0");
    pass("Overdraft limit and overdraft used are strictly zero");

    // -------------------------------------------------------------------------
    // SECTION 2: Idempotency & Replay Handling
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Idempotency & Double-Submit ---");

    // TEST 6: Calling creation again returns the existing account and does not create a second one
    const result2 = await service.createForOrganization(org1Id, {
      accountName: "Attempted Duplicate",
      billingCountry: "IN",
    });

    assert.strictEqual(result2.id, result1.id, "Idempotent call must return the existing billing account ID");
    assert.strictEqual(result2.organizationId, org1Id);

    const totalAccountsForOrg = await prisma.billingAccount.count({
      where: { organizations: { some: { id: org1Id } } },
    });
    assert.strictEqual(totalAccountsForOrg, 1, "Exactly one billing account must exist for the organization");
    pass("Calling creation again does not create a second account (idempotent replay)");

    // TEST 7: Existing relationship remains intact
    const orgCheck2 = await prisma.organization.findUnique({
      where: { id: org1Id },
    });
    assert.strictEqual(orgCheck2?.billingAccountId, result1.id);
    pass("Existing Organization -> BillingAccount relationship remains intact");

    // -------------------------------------------------------------------------
    // SECTION 3: Currency Derivation & Country Policy
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Currency Derivation Matrix ---");

    const orgUsId = `org-ba-test-us-${timestamp}`;
    testOrgsToCleanup.push(orgUsId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'US Corp', $2, NULL, clock_timestamp())`,
      [orgUsId, `org-ba-slug-us-${timestamp}`],
    );

    const resultUs = await service.createForOrganization(orgUsId, {
      billingCountry: "US",
    });
    testAccountsToCleanup.push(resultUs.id);

    assert.strictEqual(resultUs.billingCountry, "US");
    assert.strictEqual(resultUs.currency, "USD", "US country must derive USD currency");
    pass("Derives USD currency for country US");

    const orgMyId = `org-ba-test-my-${timestamp}`;
    testOrgsToCleanup.push(orgMyId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Malaysia Corp', $2, NULL, clock_timestamp())`,
      [orgMyId, `org-ba-slug-my-${timestamp}`],
    );

    const resultMy = await service.createForOrganization(orgMyId, {
      billingCountry: "MY",
    });
    testAccountsToCleanup.push(resultMy.id);

    assert.strictEqual(resultMy.billingCountry, "MY");
    assert.strictEqual(resultMy.currency, "MYR", "MY country must derive MYR currency");
    pass("Derives MYR currency for country MY");

    // TEST: Caller providing matching currency succeeds
    const orgMatchId = `org-ba-test-match-${timestamp}`;
    testOrgsToCleanup.push(orgMatchId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Match Corp', $2, NULL, clock_timestamp())`,
      [orgMatchId, `org-ba-slug-match-${timestamp}`],
    );

    const resultMatch = await service.createForOrganization(orgMatchId, {
      billingCountry: "IN",
      currency: "INR",
    });
    testAccountsToCleanup.push(resultMatch.id);
    assert.strictEqual(resultMatch.currency, "INR");
    pass("Explicitly provided currency matching country policy is accepted");

    // TEST: Caller providing conflicting currency is rejected
    const orgMismatchId = `org-ba-test-mismatch-${timestamp}`;
    testOrgsToCleanup.push(orgMismatchId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Mismatch Corp', $2, NULL, clock_timestamp())`,
      [orgMismatchId, `org-ba-slug-mismatch-${timestamp}`],
    );

    let currencyMismatchCaught = false;
    try {
      await service.createForOrganization(orgMismatchId, {
        billingCountry: "IN",
        currency: "USD", // Illegal mismatch: India requires INR
      });
    } catch (err: any) {
      currencyMismatchCaught = true;
      assert.ok(err instanceof BadRequestException, "Must throw BadRequestException on currency mismatch");
      assert.ok(err.message.includes("CURRENCY_COUNTRY_MISMATCH"));
    }
    assert.ok(currencyMismatchCaught, "Must reject conflicting currency");
    pass("Conflicting currency parameter is rejected with BadRequestException");

    // -------------------------------------------------------------------------
    // SECTION 4: Atomicity & Rollback Integrity
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Atomicity & Transaction Boundaries ---");

    const orgAtomId = `org-ba-test-atom-${timestamp}`;
    testOrgsToCleanup.push(orgAtomId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Atomic Corp', $2, NULL, clock_timestamp())`,
      [orgAtomId, `org-ba-slug-atom-${timestamp}`],
    );

    // Fail transaction intentionally using an external transaction client that aborts
    let txRollbackCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        await service.createForOrganization(
          orgAtomId,
          {
            accountName: "Rollback Payer",
            billingCountry: "IN",
          },
          { transactionClient: tx },
        );
        // Force an exception to simulate failure midway
        throw new Error("SIMULATED_TRANSACTION_FAILURE");
      });
    } catch (err: any) {
      if (err.message === "SIMULATED_TRANSACTION_FAILURE") {
        txRollbackCaught = true;
      }
    }
    assert.ok(txRollbackCaught, "Transaction must fail and roll back");

    // Verify Organization.billingAccountId remains NULL
    const orgAtomCheck = await prisma.organization.findUnique({
      where: { id: orgAtomId },
    });
    assert.strictEqual(orgAtomCheck?.billingAccountId, null, "Organization must not have a billingAccountId after rollback");

    // Verify no orphan BillingAccount was created
    const orphanCheck = await prisma.billingAccount.findMany({
      where: { name: "Rollback Payer" },
    });
    assert.strictEqual(orphanCheck.length, 0, "No orphan BillingAccount should be left behind on failure");
    pass("Transaction failure leaves no orphan BillingAccount and rolls back Organization link atomically");

    // -------------------------------------------------------------------------
    // SECTION 5: Concurrency & Double-Submit Race Handling
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: Concurrency & Parallel Submission ---");

    const orgConcId = `org-ba-test-conc-${timestamp}`;
    testOrgsToCleanup.push(orgConcId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Concurrent Corp', $2, NULL, clock_timestamp())`,
      [orgConcId, `org-ba-slug-conc-${timestamp}`],
    );

    // Trigger 5 simultaneous calls attempting to create a billing account for the same org
    const parallelCalls = await Promise.all([
      service.createForOrganization(orgConcId, { accountName: "Concurrent Payer 1", billingCountry: "IN" }),
      service.createForOrganization(orgConcId, { accountName: "Concurrent Payer 2", billingCountry: "IN" }),
      service.createForOrganization(orgConcId, { accountName: "Concurrent Payer 3", billingCountry: "IN" }),
      service.createForOrganization(orgConcId, { accountName: "Concurrent Payer 4", billingCountry: "IN" }),
      service.createForOrganization(orgConcId, { accountName: "Concurrent Payer 5", billingCountry: "IN" }),
    ]);

    // All calls must resolve to the identical canonical BillingAccount
    const primaryAccountId = parallelCalls[0].id;
    testAccountsToCleanup.push(primaryAccountId);

    for (let i = 1; i < parallelCalls.length; i++) {
      assert.strictEqual(
        parallelCalls[i].id,
        primaryAccountId,
        `Call ${i + 1} must return the identical canonical billing account ID`,
      );
    }
    pass("Concurrent creation attempts serialize cleanly and return identical canonical account");

    // Verify exactly one account linked to the organization
    const orgConcCheck = await prisma.organization.findUnique({
      where: { id: orgConcId },
    });
    assert.strictEqual(orgConcCheck?.billingAccountId, primaryAccountId);

    const concAccounts = await prisma.billingAccount.findMany({
      where: { name: { startsWith: "Concurrent Payer" } },
    });
    assert.strictEqual(concAccounts.length, 1, "Exactly one account must be created across all concurrent calls");
    pass("No duplicate accounts or orphan accounts left behind by concurrent calls");

    // -------------------------------------------------------------------------
    // SECTION 6: Credit Isolation & Non-Financial Boundary
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: Strict Credit Isolation Boundary ---");

    // Verify account creation created zero credit pools
    const poolsCount = await prisma.creditPool.count({
      where: { billingAccountId: result1.id },
    });
    assert.strictEqual(poolsCount, 0, "BillingAccountService must NOT create credit pools");
    pass("Creating a BillingAccount creates zero credit pools (credit isolation)");

    // Verify account creation created zero ledger entries
    const ledgerCount = await prisma.creditLedgerEntry.count({
      where: { billingAccountId: result1.id },
    });
    assert.strictEqual(ledgerCount, 0, "BillingAccountService must NOT write ledger entries");
    pass("Creating a BillingAccount writes zero ledger entries (ledger isolation)");

    // Verify overdraft used is 0 and trialGrantedAt is null
    const freshAccount = await prisma.billingAccount.findUnique({
      where: { id: result1.id },
    });
    assert.strictEqual(freshAccount?.overdraftUsed, 0);
    assert.strictEqual(freshAccount?.trialGrantedAt, null, "Trial grant belongs to TrialGrantService, not BillingAccountService");
    pass("Creating a BillingAccount does not grant trial credits or alter balances");

    // -------------------------------------------------------------------------
    // SECTION 7: Boundary & Error Handling
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 7: Validation & Boundary Edge Cases ---");

    // Nonexistent organization rejection
    let nonExistentCaught = false;
    try {
      await service.createForOrganization("non-existent-org-uuid-000", { billingCountry: "IN" });
    } catch (err: any) {
      nonExistentCaught = true;
      assert.ok(err instanceof NotFoundException, "Must throw NotFoundException for nonexistent organization");
    }
    assert.ok(nonExistentCaught, "Nonexistent organization must be rejected cleanly");
    pass("Nonexistent organization is rejected cleanly with NotFoundException");

    // Unsupported billing country rejection
    const orgInvalidCountryId = `org-ba-test-inv-country-${timestamp}`;
    testOrgsToCleanup.push(orgInvalidCountryId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Invalid Country Org', $2, NULL, clock_timestamp())`,
      [orgInvalidCountryId, `org-ba-slug-inv-${timestamp}`],
    );

    let invalidCountryCaught = false;
    try {
      await service.createForOrganization(orgInvalidCountryId, { billingCountry: "XX" });
    } catch (err: any) {
      invalidCountryCaught = true;
      assert.ok(err instanceof BadRequestException, "Must throw BadRequestException for unsupported country");
      assert.ok(err.message.includes("UNSUPPORTED_BILLING_COUNTRY"));
    }
    assert.ok(invalidCountryCaught, "Unsupported country must be rejected");
    pass("Unsupported billing country rejected with BadRequestException('UNSUPPORTED_BILLING_COUNTRY')");

    // Duplicate trial domain rejection
    const orgDomainDupId = `org-ba-test-dup-domain-${timestamp}`;
    testOrgsToCleanup.push(orgDomainDupId);
    await pg.query(
      `INSERT INTO public.organization (id, name, slug, billing_account_id, created_at)
       VALUES ($1, 'Domain Dup Org', $2, NULL, clock_timestamp())`,
      [orgDomainDupId, `org-ba-slug-dup-${timestamp}`],
    );

    let dupDomainCaught = false;
    try {
      await service.createForOrganization(orgDomainDupId, {
        billingCountry: "IN",
        trialDomain: `alpha-${timestamp}.com`, // Same domain used on org1
      });
    } catch (err: any) {
      dupDomainCaught = true;
      assert.ok(err instanceof ConflictException, "Must throw ConflictException for duplicate trial domain");
      assert.ok(err.message.includes("TRIAL_DOMAIN_ALREADY_EXISTS"));
    }
    assert.ok(dupDomainCaught, "Duplicate trial domain must be rejected");
    pass("Duplicate trial domain rejected with ConflictException('TRIAL_DOMAIN_ALREADY_EXISTS')");

    // Missing organizationId rejection
    let missingOrgIdCaught = false;
    try {
      await service.createForOrganization("", { billingCountry: "IN" });
    } catch (err: any) {
      missingOrgIdCaught = true;
      assert.ok(err instanceof BadRequestException);
    }
    assert.ok(missingOrgIdCaught);
    pass("Empty or missing organizationId rejected with BadRequestException");

    // -------------------------------------------------------------------------
    // SECTION 8: Read & Update Contracts
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 8: Query & Update Contracts ---");

    // getAccountById
    const fetchedById = await service.getAccountById(result1.id);
    assert.ok(fetchedById);
    assert.strictEqual(fetchedById.id, result1.id);
    assert.strictEqual(fetchedById.name, "Alpha Corp Payer");
    pass("getAccountById retrieves canonical billing account with organization");

    // getAccountByOrganizationId
    const fetchedByOrg = await service.getAccountByOrganizationId(org1Id);
    assert.ok(fetchedByOrg);
    assert.strictEqual(fetchedByOrg.id, result1.id);
    pass("getAccountByOrganizationId retrieves billing account linked to organization");

    // getAccountSummary
    const summary = await service.getAccountSummary(result1.id);
    assert.strictEqual(summary.id, result1.id);
    assert.strictEqual(summary.organizationId, org1Id);
    assert.strictEqual(summary.overdraftLimit, 0);
    assert.strictEqual(summary.totalAvailableCredits, 0);
    assert.ok(Array.isArray(summary.pools));
    pass("getAccountSummary returns financial summary with zero overdraft and pool breakdown");

    // updateAccount (name, legalEntityName, taxId)
    const updatedAccount = await service.updateAccount(
      result1.id,
      {
        legalEntityName: "Alpha Worldwide Holdings Ltd",
        taxId: "GSTIN-NEW-9999",
      },
      { actor: platformActor, ticketRef: "JIRA-BA-100" },
    );
    assert.strictEqual(updatedAccount.legalEntityName, "Alpha Worldwide Holdings Ltd");
    assert.strictEqual(updatedAccount.taxId, "GSTIN-NEW-9999");
    pass("updateAccount updates non-financial metadata and records audit event");

    // updateStatus (ACTIVE -> SUSPENDED with requestId)
    const suspendedAccount = await service.updateStatus(
      result1.id,
      "SUSPENDED",
      "req-status-change-1",
      { actor: platformActor, ticketRef: "JIRA-SUSPEND-1" },
    );
    assert.strictEqual(suspendedAccount.status, "SUSPENDED");
    pass("updateStatus transitions status to SUSPENDED with approved requestId");

    // updateStatus without requestId is rejected
    let missingReqIdCaught = false;
    try {
      await service.updateStatus(result1.id, "ACTIVE", "");
    } catch (err: any) {
      missingReqIdCaught = true;
      assert.ok(err instanceof BadRequestException);
    }
    assert.ok(missingReqIdCaught);
    pass("updateStatus without approved requestId is rejected with BadRequestException");

    // -------------------------------------------------------------------------
    // SECTION 9: Transactional Billing Audit Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 9: Billing Audit Integrity ---");

    const auditEvents = await prisma.billingAuditEvent.findMany({
      where: { subjectId: result1.id },
      orderBy: { timestamp: "asc" },
    });

    assert.ok(auditEvents.length >= 3, "Must have recorded creation, update, and status change audit events");
    assert.strictEqual(auditEvents[0].action, "ACCOUNT_CREATED");
    assert.strictEqual(auditEvents[1].action, "ACCOUNT_UPDATED");
    assert.strictEqual(auditEvents[2].action, "ACCOUNT_STATUS_CHANGE");
    assert.strictEqual(auditEvents[2].requestId, "req-status-change-1");
    pass("Billing audit trail accurately captures account creation, update, and status change");

    // -------------------------------------------------------------------------
    // SECTION 10: Teardown & Pristine Database Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 10: Cleanup & Baseline Verification ---");
  } finally {
    // Teardown isolated test fixtures
    try {
      await pg.query("ALTER TABLE billing.billing_audit_event DISABLE TRIGGER ALL");

      for (const orgId of testOrgsToCleanup) {
        await pg.query(`UPDATE public.organization SET billing_account_id = NULL WHERE id = $1`, [orgId]);
        await pg.query(`DELETE FROM public.organization WHERE id = $1`, [orgId]);
      }

      for (const baId of testAccountsToCleanup) {
        await pg.query(`DELETE FROM billing.billing_audit_event WHERE subject_id = $1`, [baId]);
        await pg.query(`DELETE FROM billing.billing_account WHERE id = $1`, [baId]);
      }

      await pg.query("ALTER TABLE billing.billing_audit_event ENABLE TRIGGER ALL");
    } catch (cleanupErr) {
      console.warn("Teardown warning:", cleanupErr);
    }

    // Verify baseline organizations and accounts remain untouched
    const acmeBa = await prisma.billingAccount.findFirst({ where: { name: "Acme Corporation" } });
    const globexBa = await prisma.billingAccount.findFirst({ where: { name: "Globex Industries" } });

    assert.ok(acmeBa, "Acme Corporation must exist in pristine state");
    assert.ok(globexBa, "Globex Industries must exist in pristine state");
    assert.strictEqual(acmeBa.overdraftLimit, 0);
    assert.strictEqual(globexBa.overdraftLimit, 0);

    const acmePool = await prisma.creditPool.findFirst({ where: { billingAccountId: acmeBa.id } });
    const globexPool = await prisma.creditPool.findFirst({ where: { billingAccountId: globexBa.id } });

    assert.strictEqual(acmePool?.cachedRemaining, 50, "Acme pool balance must remain 50");
    assert.strictEqual(globexPool?.cachedRemaining, 50, "Globex pool balance must remain 50");

    await prisma.$disconnect();
    await pg.end();

    pass("Baseline organizations (Acme and Globex) remain 100% pristine with 50 credits and 0 overdraft");
  }

  console.log("================================================================================");
  console.log(`Summary: All ${passedCount}/${totalCount} BillingAccountService Tests Passed!`);
  console.log("================================================================================");
}

if (process.env.JEST_WORKER_ID !== undefined) {
  describe("BillingAccountService Characterization & Lifecycle Suite", () => {
    it("runs all BillingAccountService characterization and lifecycle tests", async () => {
      await runBillingAccountServiceTests();
    }, 120000);
  });
} else {
  runBillingAccountServiceTests().catch((err) => {
    console.error("FATAL BillingAccountService Test Failure:", err);
    process.exit(1);
  });
}
