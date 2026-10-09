import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { strict as assert } from "assert";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PriceBookService } from "./price-book.service";
import {
  PublishPriceBookEntryDto,
  PriceBookActor,
  PoolType,
  SUPPORTED_BILLING_COUNTRIES,
} from "./price-book.types";
import { PlatformStaffRole, StaffRole } from "@cd-recruit/shared-types";
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

async function runPriceBookServiceTests() {
  console.log("================================================================================");
  console.log("PHASE 2.6 — PriceBookService Verification Suite");
  console.log("================================================================================");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  const priceBookService = new PriceBookService(prisma as any);

  let passedTests = 0;
  function pass(testNum: number, name: string) {
    passedTests++;
    console.log(`✅ TEST [${testNum}]: ${name}`);
  }

  // Generate unique run ID to isolate test fixtures completely
  const runId = Date.now().toString();
  const createdEntryIds: string[] = [];

  // Helper actors
  const financeActor: PriceBookActor = {
    id: `staff-finance-${runId}`,
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    email: `finance-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const ownerActor: PriceBookActor = {
    id: `staff-owner-${runId}`,
    role: PlatformStaffRole.OWNER,
    platformRole: PlatformStaffRole.OWNER,
    email: `owner-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const supportActor: PriceBookActor = {
    id: `staff-support-${runId}`,
    role: PlatformStaffRole.SUPPORT,
    platformRole: PlatformStaffRole.SUPPORT,
    email: `support-${runId}@proctora.platform`,
    isPlatformStaff: true,
  };

  const recruiterActor: any = {
    id: `recruiter-${runId}`,
    role: StaffRole.HR_LEAD,
    email: `recruiter-${runId}@acme.corp`,
    isPlatformStaff: false,
  };

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: Baseline Seed Data & Read Catalog Tests
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: Baseline Seed Data & Read Catalog Tests ---");

    // TEST 1: Baseline IN price
    const inPrice = await priceBookService.getActivePrice("DRIVE_PASS", "IN");
    assert.strictEqual(inPrice.sku, "DRIVE_PASS");
    assert.strictEqual(inPrice.billingCountry, "IN");
    assert.strictEqual(inPrice.currency, "INR");
    assert.strictEqual(inPrice.unitPriceMinor, 5000, "INR unitPriceMinor should be 5000 (₹50.00)");
    assert.strictEqual(inPrice.credits, 1);
    assert.strictEqual(inPrice.validityDays, 30);
    assert.strictEqual(inPrice.version, 1);
    assert.strictEqual(inPrice.effectiveTo, null);
    pass(1, "Baseline IN price book entry returns v1 ₹50.00 (5000 minor units)");

    // TEST 2: Baseline US price
    const usPrice = await priceBookService.getActivePrice("DRIVE_PASS", "US");
    assert.strictEqual(usPrice.sku, "DRIVE_PASS");
    assert.strictEqual(usPrice.billingCountry, "US");
    assert.strictEqual(usPrice.currency, "USD");
    assert.strictEqual(usPrice.unitPriceMinor, 200, "USD unitPriceMinor should be 200 ($2.00)");
    assert.strictEqual(usPrice.credits, 1);
    assert.strictEqual(usPrice.validityDays, 30);
    assert.strictEqual(usPrice.version, 1);
    assert.strictEqual(usPrice.effectiveTo, null);
    pass(2, "Baseline US price book entry returns v1 $2.00 (200 minor units)");

    // TEST 3: List catalog by country (IN)
    const inCatalog = await priceBookService.listCatalog("IN");
    assert(inCatalog.length >= 1, "Catalog for IN must have at least 1 entry");
    assert(inCatalog.some((e) => e.sku === "DRIVE_PASS" && e.billingCountry === "IN"));
    pass(3, "listCatalog('IN') returns India catalog entries including DRIVE_PASS v1");

    // TEST 4: List catalog by country (US)
    const usCatalog = await priceBookService.listCatalog("US");
    assert(usCatalog.length >= 1, "Catalog for US must have at least 1 entry");
    assert(usCatalog.some((e) => e.sku === "DRIVE_PASS" && e.billingCountry === "US"));
    pass(4, "listCatalog('US') returns US catalog entries including DRIVE_PASS v1");

    // TEST 5: List full catalog across countries
    const fullCatalog = await priceBookService.listCatalog();
    assert(fullCatalog.length >= 2, "Full catalog must include at least IN and US entries");
    assert(fullCatalog.some((e) => e.billingCountry === "IN"));
    assert(fullCatalog.some((e) => e.billingCountry === "US"));
    pass(5, "listCatalog() without arguments returns full cross-country catalog");

    // TEST 6: Get price entry by ID
    const fetchedById = await priceBookService.getPriceEntryById(inPrice.id);
    assert.strictEqual(fetchedById.id, inPrice.id);
    assert.strictEqual(fetchedById.sku, "DRIVE_PASS");
    pass(6, "getPriceEntryById returns canonical price entry by UUID");

    // TEST 7: Get non-existent price entry by ID throws NotFoundException
    await assert.rejects(
      async () => {
        await priceBookService.getPriceEntryById("00000000-0000-0000-0000-000000000000");
      },
      (err: any) => err instanceof NotFoundException && err.message.includes("PRICE_BOOK_ENTRY_NOT_FOUND"),
    );
    pass(7, "getPriceEntryById for unknown ID throws NotFoundException");

    // TEST 8: getActivePrice for unknown SKU throws NotFoundException
    await assert.rejects(
      async () => {
        await priceBookService.getActivePrice("NON_EXISTENT_SKU_12345", "IN");
      },
      (err: any) => err instanceof NotFoundException && err.message.includes("NO_ACTIVE_PRICE"),
    );
    pass(8, "getActivePrice for unknown SKU throws NotFoundException");

    // TEST 9: getActivePrice for unsupported country throws BadRequestException
    await assert.rejects(
      async () => {
        await priceBookService.getActivePrice("DRIVE_PASS", "XX");
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("UNSUPPORTED_BILLING_COUNTRY"),
    );
    pass(9, "getActivePrice for unsupported country throws BadRequestException");

    // -------------------------------------------------------------------------
    // SECTION 2: Currency & Country Policy Enforcement
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Currency & Country Policy Enforcement ---");

    // TEST 10: Supported countries constant
    assert.deepStrictEqual([...SUPPORTED_BILLING_COUNTRIES], ["IN", "US", "MY"]);
    pass(10, "Supported countries strictly anchored to ['IN', 'US', 'MY'] per Artifact 03 & 07");

    // TEST 11: Currency mismatch rejected when publishing
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_SKU_MISMATCH_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 100,
          billingCountry: "IN",
          currency: "USD", // Illegal: India must be INR
          unitPriceMinor: 6000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("CURRENCY_COUNTRY_MISMATCH"),
    );
    pass(11, "Publishing price with currency mismatch (e.g. IN with USD) throws BadRequestException");

    // TEST 12: Country unsupported rejected
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_SKU_COUNTRY_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 100,
          billingCountry: "FR", // France unsupported
          currency: "EUR",
          unitPriceMinor: 1000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("UNSUPPORTED_BILLING_COUNTRY"),
    );
    pass(12, "Publishing price for unsupported country (e.g. FR) throws BadRequestException");

    // TEST 13: Currency automatically derived when omitted
    const testSkuAuto = `TEST_AUTO_CURRENCY_${runId}`;
    const autoPublished = await priceBookService.publishNewVersion(financeActor, {
      sku: testSkuAuto,
      poolType: PoolType.TALENT_RESERVE,
      credits: 50,
      billingCountry: "IN",
      // currency omitted
      unitPriceMinor: 4500,
    });
    createdEntryIds.push(autoPublished.id);
    assert.strictEqual(autoPublished.currency, "INR", "Omitted currency should automatically resolve to INR for IN");
    pass(13, "Omitted currency in PublishPriceBookEntryDto automatically resolves to policy currency");

    // -------------------------------------------------------------------------
    // SECTION 3: Platform Authorization & Role Matrix
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Platform Authorization & Role Matrix ---");

    // TEST 14: Recruiter rejected from publishing
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(recruiterActor, {
          sku: `TEST_RECRUITER_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PLATFORM_ROLE_REQUIRED"),
    );
    pass(14, "Recruiter identity strictly forbidden from publishing price book entries");

    // TEST 15: Unauthenticated / null actor rejected
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(null as any, {
          sku: `TEST_UNAUTH_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof UnauthorizedException && err.message.includes("AUTHENTICATION_REQUIRED"),
    );
    pass(15, "Unauthenticated actor rejected with UnauthorizedException");

    // TEST 16: SUPPORT role cannot publish new version
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(supportActor, {
          sku: `TEST_SUPPORT_PUB_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PRICE_PUBLISH_FORBIDDEN"),
    );
    pass(16, "Platform SUPPORT role strictly forbidden from publishing price book entries");

    // TEST 17: SUPPORT role cannot retire price entry
    await assert.rejects(
      async () => {
        await priceBookService.retirePriceEntry(supportActor, autoPublished.id);
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes("PRICE_PUBLISH_FORBIDDEN"),
    );
    pass(17, "Platform SUPPORT role strictly forbidden from retiring price book entries");

    // TEST 18: FINANCE role can publish new version
    const testSkuFinance = `TEST_FINANCE_${runId}`;
    const financePublished = await priceBookService.publishNewVersion(financeActor, {
      sku: testSkuFinance,
      poolType: PoolType.TALENT_RESERVE,
      credits: 20,
      billingCountry: "US",
      unitPriceMinor: 350,
    });
    createdEntryIds.push(financePublished.id);
    assert.strictEqual(financePublished.version, 1);
    pass(18, "Platform FINANCE role authorized to publish price book entry");

    // TEST 19: OWNER role can publish new version
    const testSkuOwner = `TEST_OWNER_${runId}`;
    const ownerPublished = await priceBookService.publishNewVersion(ownerActor, {
      sku: testSkuOwner,
      poolType: PoolType.ENTERPRISE,
      credits: 500,
      billingCountry: "IN",
      unitPriceMinor: 4000,
    });
    createdEntryIds.push(ownerPublished.id);
    assert.strictEqual(ownerPublished.version, 1);
    pass(19, "Platform OWNER role authorized to publish price book entry");

    // -------------------------------------------------------------------------
    // SECTION 4: Validation & Boundary Invariants
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Validation & Boundary Invariants ---");

    // TEST 20: Empty SKU rejected
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: "   ",
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_SKU"),
    );
    pass(20, "Empty SKU code rejected with BadRequestException");

    // TEST 21: Invalid pool type rejected
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_BAD_POOL_${runId}`,
          poolType: "UNSUPPORTED_POOL" as any,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_POOL_TYPE"),
    );
    pass(21, "Invalid pool type rejected with BadRequestException");

    // TEST 22: Non-positive credits rejected (0 credits)
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_ZERO_CREDITS_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 0,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_CREDITS"),
    );
    pass(22, "Zero credits pack size rejected with BadRequestException");

    // TEST 23: Non-integer credits rejected (float 10.5)
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_FLOAT_CREDITS_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10.5 as any,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_CREDITS"),
    );
    pass(23, "Floating-point credits pack size rejected with BadRequestException");

    // TEST 24: Non-positive validity days rejected (0 days)
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_ZERO_VALIDITY_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          validityDays: 0,
          billingCountry: "IN",
          unitPriceMinor: 5000,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_VALIDITY_DAYS"),
    );
    pass(24, "Zero validity days rejected with BadRequestException");

    // TEST 25: Non-positive unitPriceMinor rejected (0 minor units)
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_ZERO_PRICE_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 0,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_UNIT_PRICE"),
    );
    pass(25, "Zero unit price minor rejected with BadRequestException");

    // TEST 26: Floating-point unitPriceMinor rejected (5000.5 paise)
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_FLOAT_PRICE_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000.5,
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_UNIT_PRICE"),
    );
    pass(26, "Floating-point unit price minor rejected with BadRequestException");

    // TEST 27: Invalid effectiveFrom date format rejected
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: `TEST_BAD_DATE_${runId}`,
          poolType: PoolType.TALENT_RESERVE,
          credits: 10,
          billingCountry: "IN",
          unitPriceMinor: 5000,
          effectiveFrom: "not-a-valid-date",
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_EFFECTIVE_DATE"),
    );
    pass(27, "Malformed effectiveFrom date string rejected with BadRequestException");

    // -------------------------------------------------------------------------
    // SECTION 5: Versioning & Effective Date Semantics
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: Versioning & Effective Date Semantics ---");

    const versionTestSku = `SKU_VERSION_TEST_${runId}`;
    const t0 = new Date("2026-02-01T00:00:00.000Z");
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-04-01T00:00:00.000Z");

    // TEST 28: Publish Version 1
    const v1 = await priceBookService.publishNewVersion(financeActor, {
      sku: versionTestSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 100,
      validityDays: 60,
      billingCountry: "IN",
      unitPriceMinor: 5000, // ₹50.00
      effectiveFrom: t0,
      reason: "Initial version 1 release",
      ticketRef: `TICKET-V1-${runId}`,
    });
    createdEntryIds.push(v1.id);
    assert.strictEqual(v1.version, 1);
    assert.strictEqual(v1.unitPriceMinor, 5000);
    assert.strictEqual(v1.effectiveTo, null);
    pass(28, "Publish initial price entry creates version 1 with effective_to = NULL");

    // TEST 29: Publish Version 2
    const v2 = await priceBookService.publishNewVersion(financeActor, {
      sku: versionTestSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 100,
      validityDays: 60,
      billingCountry: "IN",
      unitPriceMinor: 5500, // ₹55.00
      effectiveFrom: t1,
      reason: "Annual price adjustment v2",
      ticketRef: `TICKET-V2-${runId}`,
    });
    createdEntryIds.push(v2.id);
    assert.strictEqual(v2.version, 2);
    assert.strictEqual(v2.unitPriceMinor, 5500);
    assert.strictEqual(v2.effectiveTo, null);

    // Verify v1 was retired: v1.effective_to must now equal t1
    const v1Reloaded = await priceBookService.getPriceEntryById(v1.id);
    assert.notStrictEqual(v1Reloaded.effectiveTo, null);
    assert.strictEqual(new Date(v1Reloaded.effectiveTo!).toISOString(), t1.toISOString());
    pass(29, "Publishing version 2 automatically retires version 1 with effective_to = v2.effectiveFrom");

    // TEST 30: Publish Version 3
    const v3 = await priceBookService.publishNewVersion(ownerActor, {
      sku: versionTestSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 100,
      validityDays: 60,
      billingCountry: "IN",
      unitPriceMinor: 6000, // ₹60.00
      effectiveFrom: t2,
      reason: "Promotional adjustment v3",
      ticketRef: `TICKET-V3-${runId}`,
    });
    createdEntryIds.push(v3.id);
    assert.strictEqual(v3.version, 3);
    assert.strictEqual(v3.unitPriceMinor, 6000);
    assert.strictEqual(v3.effectiveTo, null);

    // Verify v2 was retired: v2.effective_to must now equal t2
    const v2Reloaded = await priceBookService.getPriceEntryById(v2.id);
    assert.strictEqual(new Date(v2Reloaded.effectiveTo!).toISOString(), t2.toISOString());
    pass(30, "Publishing version 3 increments version sequence and retires version 2");

    // TEST 31: Publishing new version with effectiveFrom prior to previous version rejected
    await assert.rejects(
      async () => {
        await priceBookService.publishNewVersion(financeActor, {
          sku: versionTestSku,
          poolType: PoolType.TALENT_RESERVE,
          credits: 100,
          billingCountry: "IN",
          unitPriceMinor: 7000,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), // Prior to t2 (April 2026)
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("INVALID_EFFECTIVE_DATE"),
    );
    pass(31, "New price version cannot have effectiveFrom prior to existing version (time monotonicity)");

    // TEST 32: Deterministic Historical Lookup at t0 + 15 days -> returns v1 (₹50)
    const midFeb = new Date("2026-02-15T00:00:00.000Z");
    const histPriceV1 = await priceBookService.getHistoricalPrice(versionTestSku, "IN", midFeb);
    assert.strictEqual(histPriceV1.version, 1);
    assert.strictEqual(histPriceV1.unitPriceMinor, 5000);
    pass(32, "Historical lookup at 2026-02-15 deterministically returns version 1 (₹50.00)");

    // TEST 33: Deterministic Historical Lookup at t1 + 15 days -> returns v2 (₹55)
    const midMar = new Date("2026-03-15T00:00:00.000Z");
    const histPriceV2 = await priceBookService.getHistoricalPrice(versionTestSku, "IN", midMar);
    assert.strictEqual(histPriceV2.version, 2);
    assert.strictEqual(histPriceV2.unitPriceMinor, 5500);
    pass(33, "Historical lookup at 2026-03-15 deterministically returns version 2 (₹55.00)");

    // TEST 34: Active Price Lookup (now) -> returns v3 (₹60)
    const activePrice = await priceBookService.getActivePrice(versionTestSku, "IN");
    assert.strictEqual(activePrice.version, 3);
    assert.strictEqual(activePrice.unitPriceMinor, 6000);
    assert.strictEqual(activePrice.effectiveTo, null);
    pass(34, "Active price lookup for current time deterministically returns latest active version (v3 ₹60.00)");

    // TEST 35: Historical lookup prior to t0 throws NotFoundException
    await assert.rejects(
      async () => {
        await priceBookService.getHistoricalPrice(
          versionTestSku,
          "IN",
          new Date("2025-12-31T00:00:00.000Z"),
        );
      },
      (err: any) => err instanceof NotFoundException && err.message.includes("NO_ACTIVE_PRICE"),
    );
    pass(35, "Historical lookup prior to first version effective date throws NotFoundException");

    // TEST 36: Explicit retirement of an active price entry
    const retireSku = `SKU_RETIRE_TEST_${runId}`;
    const entryToRetire = await priceBookService.publishNewVersion(financeActor, {
      sku: retireSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 50,
      billingCountry: "IN",
      unitPriceMinor: 4800,
    });
    createdEntryIds.push(entryToRetire.id);

    const retiredEntry = await priceBookService.retirePriceEntry(financeActor, entryToRetire.id, {
      reason: "Decommissioning temporary SKU",
      ticketRef: `TICKET-RETIRE-${runId}`,
    });
    assert.notStrictEqual(retiredEntry.effectiveTo, null);
    pass(36, "retirePriceEntry explicitly sets effective_to on active entry");

    // TEST 37: Attempting to retire an already-retired entry throws ConflictException
    await assert.rejects(
      async () => {
        await priceBookService.retirePriceEntry(financeActor, entryToRetire.id);
      },
      (err: any) => err instanceof ConflictException && err.message.includes("PRICE_ALREADY_RETIRED"),
    );
    pass(37, "Retiring an already retired price entry throws ConflictException");

    // TEST 38: Attempting to retire a non-existent entry throws NotFoundException
    await assert.rejects(
      async () => {
        await priceBookService.retirePriceEntry(
          financeActor,
          "00000000-0000-0000-0000-000000000000",
        );
      },
      (err: any) => err instanceof NotFoundException && err.message.includes("PRICE_BOOK_ENTRY_NOT_FOUND"),
    );
    pass(38, "Retiring non-existent price entry throws NotFoundException");

    // -------------------------------------------------------------------------
    // SECTION 6: Audit Trail Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 6: Audit Trail Verification ---");

    // TEST 39: Check audit event for v1 publication
    const v1Audit = await prisma.billingAuditEvent.findFirst({
      where: {
        subjectType: "PRICE_BOOK_ENTRY",
        subjectId: v1.id,
        action: "PRICE_VERSION_PUBLISHED",
      },
    });
    assert(v1Audit, "Billing audit event must exist for v1 publication");
    assert.strictEqual(v1Audit.actorRole, PlatformStaffRole.FINANCE);
    assert.strictEqual(v1Audit.before, null, "v1 before state must be null");
    assert.strictEqual((v1Audit.after as any).version, 1);
    assert.strictEqual(v1Audit.ticketRef, `TICKET-V1-${runId}`);
    pass(39, "Publishing v1 records immutable audit log with action PRICE_VERSION_PUBLISHED and ticketRef");

    // TEST 40: Check audit event for v2 publication (with before state)
    const v2Audit = await prisma.billingAuditEvent.findFirst({
      where: {
        subjectType: "PRICE_BOOK_ENTRY",
        subjectId: v2.id,
        action: "PRICE_VERSION_PUBLISHED",
      },
    });
    assert(v2Audit, "Billing audit event must exist for v2 publication");
    assert.strictEqual((v2Audit.before as any).version, 1);
    assert.strictEqual((v2Audit.before as any).unitPriceMinor, 5000);
    assert.strictEqual((v2Audit.after as any).version, 2);
    assert.strictEqual((v2Audit.after as any).unitPriceMinor, 5500);
    pass(40, "Publishing v2 records audit event capturing before (v1 ₹50) and after (v2 ₹55) snapshots");

    // TEST 41: Check audit event for retirement
    const retireAudit = await prisma.billingAuditEvent.findFirst({
      where: {
        subjectType: "PRICE_BOOK_ENTRY",
        subjectId: entryToRetire.id,
        action: "PRICE_ENTRY_RETIRED",
      },
    });
    assert(retireAudit, "Billing audit event must exist for price entry retirement");
    assert.strictEqual(retireAudit.action, "PRICE_ENTRY_RETIRED");
    assert.strictEqual(retireAudit.ticketRef, `TICKET-RETIRE-${runId}`);
    pass(41, "Retiring price entry records audit log with action PRICE_ENTRY_RETIRED");

    // -------------------------------------------------------------------------
    // SECTION 7: Mandatory Concurrency Tests (per Section 20 of prompt)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 7: Mandatory Concurrency Tests (per Section 20) ---");

    // TEST 42: Test 1 — Concurrent Activation / Versioning Race
    // Two transactions attempt to publish next version of the same existing SKU simultaneously.
    const concSku1 = `SKU_CONC_ACT_${runId}`;
    const baseEntry = await priceBookService.publishNewVersion(financeActor, {
      sku: concSku1,
      poolType: PoolType.TALENT_RESERVE,
      credits: 100,
      billingCountry: "IN",
      unitPriceMinor: 5000,
    });
    createdEntryIds.push(baseEntry.id);

    const racePublishes = await Promise.allSettled([
      priceBookService.publishNewVersion(financeActor, {
        sku: concSku1,
        poolType: PoolType.TALENT_RESERVE,
        credits: 100,
        billingCountry: "IN",
        unitPriceMinor: 5500,
      }),
      priceBookService.publishNewVersion(ownerActor, {
        sku: concSku1,
        poolType: PoolType.TALENT_RESERVE,
        credits: 100,
        billingCountry: "IN",
        unitPriceMinor: 6000,
      }),
    ]);

    const successfulRaces = racePublishes
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value as any);

    for (const s of successfulRaces) {
      createdEntryIds.push(s.id);
    }

    // Both succeeded sequentially with distinct versions (v2 and v3) due to advisory transaction locking
    const versions = successfulRaces.map((e) => e.version).sort();
    assert.deepStrictEqual(versions, [2, 3], "Concurrent publishes must be ordered sequentially as v2 and v3");
    pass(42, "Test 1 — Concurrent activation race: serialized cleanly into v2 and v3 with zero duplicates");

    // TEST 43: Test 2 — Concurrent Creation of First Version (v1)
    // Two requests simultaneously attempt to publish v1 of a completely new SKU.
    const concSku2 = `SKU_CONC_NEW_${runId}`;
    const raceCreates = await Promise.allSettled([
      priceBookService.publishNewVersion(financeActor, {
        sku: concSku2,
        poolType: PoolType.DRIVE_PASS,
        credits: 1,
        billingCountry: "US",
        unitPriceMinor: 200,
      }),
      priceBookService.publishNewVersion(ownerActor, {
        sku: concSku2,
        poolType: PoolType.DRIVE_PASS,
        credits: 1,
        billingCountry: "US",
        unitPriceMinor: 250,
      }),
    ]);

    const successfulCreates = raceCreates
      .filter((r) => r.status === "fulfilled")
      .map((r: any) => r.value as any);

    for (const s of successfulCreates) {
      createdEntryIds.push(s.id);
    }

    const createdVersions = successfulCreates.map((e) => e.version).sort();
    assert.deepStrictEqual(createdVersions, [1, 2], "Concurrent creations must serialize cleanly into v1 and v2");
    pass(43, "Test 2 — Concurrent creation of brand new SKU: serialized cleanly into v1 and v2, zero collisions");

    // TEST 44: Test 3 — Historical Lookup Consistency During Price Change
    // One transaction publishes a new price version while multiple readers perform lookups.
    const liveSku = `SKU_LIVE_TEST_${runId}`;
    const pastTime = new Date("2026-01-01T00:00:00.000Z");
    const liveV1 = await priceBookService.publishNewVersion(financeActor, {
      sku: liveSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 100,
      billingCountry: "IN",
      unitPriceMinor: 5000,
      effectiveFrom: pastTime,
    });
    createdEntryIds.push(liveV1.id);

    // Concurrently: 1 writer publishes v2, 5 readers query historical (pastTime), 5 readers query active
    const publishPromise = priceBookService.publishNewVersion(ownerActor, {
      sku: liveSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 100,
      billingCountry: "IN",
      unitPriceMinor: 6500,
    });

    const historicalLookups = Promise.all(
      Array.from({ length: 5 }).map(() =>
        priceBookService.getHistoricalPrice(liveSku, "IN", new Date("2026-01-15T00:00:00.000Z")),
      ),
    );

    const activeLookups = Promise.all(
      Array.from({ length: 5 }).map(() => priceBookService.getActivePrice(liveSku, "IN")),
    );

    const [pubResult, histResults, actResults] = await Promise.all([
      publishPromise,
      historicalLookups,
      activeLookups,
    ]);
    createdEntryIds.push(pubResult.id);

    // Historical lookups for Jan 2026 must ALL have returned v1 (5000 minor)
    for (const h of histResults) {
      assert.strictEqual(h.version, 1);
      assert.strictEqual(h.unitPriceMinor, 5000);
    }

    // Active lookups must have returned either v1 or v2 (both are valid snapshots, neither throws error)
    for (const a of actResults) {
      assert(a.version === 1 || a.version === 2);
    }
    pass(44, "Test 3 — Historical lookups remain 100% deterministic during concurrent price publication");

    // TEST 45: Test 4 — Concurrent Read Throughput
    // 20 simultaneous concurrent reads across different SKUs and countries
    const readPromises = Array.from({ length: 20 }).map((_, i) =>
      i % 2 === 0
        ? priceBookService.getActivePrice("DRIVE_PASS", "IN")
        : priceBookService.getActivePrice("DRIVE_PASS", "US"),
    );
    const readResults = await Promise.all(readPromises);
    assert.strictEqual(readResults.length, 20);
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) {
        assert.strictEqual(readResults[i].currency, "INR");
        assert.strictEqual(readResults[i].unitPriceMinor, 5000);
      } else {
        assert.strictEqual(readResults[i].currency, "USD");
        assert.strictEqual(readResults[i].unitPriceMinor, 200);
      }
    }
    pass(45, "Test 4 — Concurrent read throughput: 20 parallel lookups produce 100% consistent results");

    // -------------------------------------------------------------------------
    // SECTION 8: Financial Isolation Invariants
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 8: Financial Isolation Invariants ---");

    // Count ledger and credit pool rows before publication
    const ledgerCountBefore = await prisma.creditLedgerEntry.count();
    const poolCountBefore = await prisma.creditPool.count();

    const isolatedSku = `SKU_ISOLATED_${runId}`;
    const isoEntry = await priceBookService.publishNewVersion(financeActor, {
      sku: isolatedSku,
      poolType: PoolType.TALENT_RESERVE,
      credits: 50,
      billingCountry: "IN",
      unitPriceMinor: 5200,
    });
    createdEntryIds.push(isoEntry.id);

    const ledgerCountAfter = await prisma.creditLedgerEntry.count();
    const poolCountAfter = await prisma.creditPool.count();

    // Invariant: ZERO mutations to ledger or credit pools
    assert.strictEqual(ledgerCountAfter, ledgerCountBefore, "Zero ledger entries must be created");
    assert.strictEqual(poolCountAfter, poolCountBefore, "Zero credit pools must be created");
    pass(46, "Price is NOT money movement: zero ledger mutations, zero credit pool mutations");

    // -------------------------------------------------------------------------
    // SECTION 9: Baseline Seed Data Verification
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 9: Baseline Seed Data Verification ---");

    const postTestInPrice = await priceBookService.getActivePrice("DRIVE_PASS", "IN");
    assert.strictEqual(postTestInPrice.version, 1);
    assert.strictEqual(postTestInPrice.unitPriceMinor, 5000);
    assert.strictEqual(postTestInPrice.effectiveTo, null);

    const postTestUsPrice = await priceBookService.getActivePrice("DRIVE_PASS", "US");
    assert.strictEqual(postTestUsPrice.version, 1);
    assert.strictEqual(postTestUsPrice.unitPriceMinor, 200);
    assert.strictEqual(postTestUsPrice.effectiveTo, null);

    pass(47, "Baseline seed prices (DRIVE_PASS IN v1 ₹50 & US v1 $2.00) remain 100% intact and pristine");

    console.log("================================================================================");
    console.log(`Summary: All ${passedTests}/${passedTests} PriceBookService Tests Passed!`);
    console.log("================================================================================");
  } finally {
    console.log("\nCleaning up isolated test fixtures...");
    try {
      if (createdEntryIds.length > 0) {
        // Remove test price book entries only (audit events are append-only by DB trigger)
        await pg.query(
          `DELETE FROM billing.price_book_entry WHERE id = ANY($1::text[])`,
          [createdEntryIds],
        );
      }
      console.log(`Isolated test fixtures (${createdEntryIds.length} entries) cleaned up successfully.`);
    } catch (cleanupErr: any) {
      console.warn("Fixture cleanup warning:", cleanupErr.message);
    }

    await pg.end();
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID !== undefined) {
  describe("PriceBookService", () => {
    it("executes all PriceBookService integration tests", async () => {
      await runPriceBookServiceTests();
    }, 120000);
  });
} else {
  runPriceBookServiceTests().catch((err) => {
    console.error("FATAL: PriceBookService test suite failed:", err);
    process.exit(1);
  });
}
