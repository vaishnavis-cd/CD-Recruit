import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import assert from "node:assert";
import { ForbiddenException, BadRequestException, UnauthorizedException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { JwtService } from "@nestjs/jwt";
import { PlatformStaffRole, StaffRole } from "@cd-recruit/shared-types";
import { PlatformAuthService } from "./auth/platform-auth.service";
import { PlatformJwtStrategy } from "./auth/strategies/platform-jwt.strategy";
import { JwtStrategy as RecruiterJwtStrategy } from "../auth/strategies/jwt.strategy";
import { PlatformRolesGuard } from "./auth/guards/platform-roles.guard";
import { PlatformAuditService } from "./audit/platform-audit.service";
import { PlatformAuditController } from "./audit/platform-audit.controller";
import {
  PlatformAuditAction,
  PlatformAuditSubjectType,
  AuthenticatedPlatformActor,
} from "./audit/platform-audit.types";
import { sanitizeAuditData } from "./audit/platform-audit.util";
import { Reflector } from "@nestjs/core";

const DB_URL = process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit";

async function createPgClient(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function runFoundationGateTests() {
  console.log("================================================================================");
  console.log("Phase 1 — Step 1.7: Final Foundation Hardening & Integration Gate Spec");
  console.log("================================================================================");

  let passedCount = 0;
  let totalCount = 0;

  function pass(msg: string) {
    totalCount++;
    passedCount++;
    console.log(`✅ GATE CHECK [${totalCount}]: ${msg}`);
  }

  const prisma = new PrismaClient();
  const testPlatformSecret = "test-platform-jwt-secret-xyz";
  const testRecruiterSecret = "test-recruiter-jwt-secret-abc";

  const configService: any = {
    get: (key: string) => {
      if (key === "app.platformJwtSecret") return testPlatformSecret;
      if (key === "app.jwtSecret") return testRecruiterSecret;
      return null;
    },
  };

  const jwtService = new JwtService({
    secret: testPlatformSecret,
    signOptions: { expiresIn: "15m", issuer: "proctora-platform" },
  });

  const platformAuthService = new PlatformAuthService(jwtService, configService, prisma as any);
  const platformJwtStrategy = new PlatformJwtStrategy(configService, prisma as any);
  const recruiterJwtStrategy = new RecruiterJwtStrategy(configService, prisma as any);

  const platformAuditService = new PlatformAuditService(prisma as any);
  const platformAuditController = new PlatformAuditController(platformAuditService);
  const rolesGuard = new PlatformRolesGuard(new Reflector());

  try {
    // =========================================================================
    // SECTION 1: Cross-Boundary Authentication & Authorization
    // =========================================================================
    console.log("\n--- SECTION 1: Cross-Boundary Authentication & Authorization ---");

    // 1.1 Platform JWT can authenticate as PlatformStaff
    const ownerTokenRes = await platformAuthService.getDevToken({
      email: "owner@cdrecruit.local",
      role: PlatformStaffRole.OWNER,
    });
    assert.ok(ownerTokenRes.token, "Should generate signed platform token");
    const decodedToken = jwtService.decode(ownerTokenRes.token) as any;
    const validatedOwner = await platformJwtStrategy.validate(decodedToken);
    assert.strictEqual(validatedOwner.isPlatformStaff, true);
    assert.strictEqual(validatedOwner.platformRole, PlatformStaffRole.OWNER);
    pass("Platform JWT authenticates authoritative PlatformStaff identity");

    // 1.2 Recruiter JWT cannot access Platform Ops routes
    const recruiterPayload = {
      sub: "recruiter-staff-uuid-1",
      email: "recruiter@acme.com",
      organizationId: "org-1",
      role: StaffRole.HR_LEAD,
      // No tokenType: PLATFORM_ACCESS
    };
    await assert.rejects(
      async () => {
        await platformJwtStrategy.validate(recruiterPayload as any);
      },
      (err: any) => err instanceof UnauthorizedException,
    );
    pass("Recruiter JWT rejected by Platform Jwt Strategy");

    // 1.3 Platform JWT cannot access Recruiter protected routes
    const platformPayload = {
      sub: ownerTokenRes.staff.id,
      email: ownerTokenRes.staff.email,
      platformRole: PlatformStaffRole.OWNER,
      tokenType: "PLATFORM_ACCESS",
    };
    await assert.rejects(
      async () => {
        await recruiterJwtStrategy.validate(platformPayload as any);
      },
      (err: any) => err instanceof UnauthorizedException,
    );
    pass("Platform JWT rejected by Recruiter Jwt Strategy");

    // 1.4 Platform Roles: SUPPORT, FINANCE, OWNER hierarchy verification
    const mockReflector = (roles: PlatformStaffRole[]) =>
      ({
        getAllAndOverride: (key: string, targets: any[]) => roles,
      } as unknown as Reflector);

    const financeGuard = new PlatformRolesGuard(mockReflector([PlatformStaffRole.FINANCE]));
    const mockContext = (user: any) =>
      ({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as any);

    // OWNER can access FINANCE routes
    assert.strictEqual(
      financeGuard.canActivate(mockContext({ isPlatformStaff: true, role: PlatformStaffRole.OWNER })),
      true,
    );
    // FINANCE can access FINANCE routes
    assert.strictEqual(
      financeGuard.canActivate(mockContext({ isPlatformStaff: true, role: PlatformStaffRole.FINANCE })),
      true,
    );
    // SUPPORT is rejected on FINANCE routes
    await assert.rejects(
      async () => {
        financeGuard.canActivate(mockContext({ isPlatformStaff: true, role: PlatformStaffRole.SUPPORT }));
      },
      (err: any) => err instanceof ForbiddenException,
    );
    pass("Platform role hierarchy enforced (OWNER & FINANCE allowed; SUPPORT rejected on FINANCE routes)");

    // =========================================================================
    // SECTION 2: Audit Integration & Boundary
    // =========================================================================
    console.log("\n--- SECTION 2: Audit Integration & Boundary ---");

    const authenticatedOwner: AuthenticatedPlatformActor = {
      id: ownerTokenRes.staff.id,
      role: PlatformStaffRole.OWNER,
      platformRole: PlatformStaffRole.OWNER,
      isPlatformStaff: true,
      email: ownerTokenRes.staff.email,
    };

    // 2.1 Audit event creation with correlation ID
    const correlationId = "corr-gate-test-" + Date.now();
    const recordedEvent = await platformAuditService.recordEvent({
      actor: authenticatedOwner,
      action: PlatformAuditAction.PLATFORM_VERIFICATION_TEST,
      subjectType: PlatformAuditSubjectType.SYSTEM,
      subjectId: "system-gate-1",
      reason: "Gate integration verification",
      requestId: correlationId,
      after: {
        timestamp: new Date().toISOString(),
        password: "SecretPasswordShouldBeRedacted",
        apiKey: "pk_live_should_be_redacted",
        ticketRef: "TICKET-SAFE-123",
      },
    });
    assert.ok(recordedEvent.id);
    assert.strictEqual(recordedEvent.requestId, correlationId);
    assert.strictEqual(recordedEvent.actorId, ownerTokenRes.staff.id);
    assert.strictEqual(recordedEvent.actorRole, PlatformStaffRole.OWNER);
    assert.strictEqual((recordedEvent.after as any).password, "[REDACTED]");
    assert.strictEqual((recordedEvent.after as any).apiKey, "[REDACTED]");
    assert.strictEqual((recordedEvent.after as any).ticketRef, "TICKET-SAFE-123");
    pass("Platform audit service records event, preserves correlation ID, and redacts sensitive metadata");

    // 2.2 Database trigger immutability
    const pg = await createPgClient();
    try {
      let updateBlocked = false;
      try {
        await pg.query(
          `UPDATE platform.platform_audit_event SET reason = 'tampered' WHERE id = $1`,
          [recordedEvent.id],
        );
      } catch (err: any) {
        updateBlocked = true;
        assert.ok(err.message.includes("strictly append-only") || err.message.includes("CANNOT_MODIFY"));
      }
      assert.strictEqual(updateBlocked, true);
      pass("Audit event database immutability enforced (UPDATE blocked by append-only trigger)");
    } finally {
      await pg.end();
    }

    // 2.3 Recruiter identity rejected as platform audit actor
    await assert.rejects(
      async () => {
        await platformAuditService.recordEvent({
          actor: { id: "recruiter-1", role: StaffRole.ADMIN, isPlatformStaff: false } as any,
          action: PlatformAuditAction.OVERRIDE_APPLIED,
          subjectType: PlatformAuditSubjectType.OVERRIDE,
          subjectId: "ov-1",
        });
      },
      (err: any) => err instanceof ForbiddenException,
    );
    pass("Recruiter identity rejected as platform audit actor");

    // =========================================================================
    // SECTION 3: Audit + Transaction Coupling
    // =========================================================================
    console.log("\n--- SECTION 3: Audit + Transaction Coupling ---");

    // 3.1 Transaction rollback atomically removes audit event
    let rolledBackId: string | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const ev = await platformAuditService.recordEvent(
          {
            actor: authenticatedOwner,
            action: PlatformAuditAction.OVERRIDE_APPLIED,
            subjectType: PlatformAuditSubjectType.OVERRIDE,
            subjectId: "tx-test-subject",
            reason: "Simulated transactional failure",
          },
          tx,
        );
        rolledBackId = ev.id;
        throw new Error("GATE_SIMULATED_TRANSACTION_ROLLBACK");
      });
    } catch (err: any) {
      assert.strictEqual(err.message, "GATE_SIMULATED_TRANSACTION_ROLLBACK");
    }

    assert.ok(rolledBackId);
    const nonExistent = await prisma.systemAuditEvent.findUnique({
      where: { id: rolledBackId },
    });
    assert.strictEqual(nonExistent, null);
    pass("Transaction rollback atomically rolls back audit event");

    // 3.2 Transaction commit persists audit event
    let committedId: string | null = null;
    await prisma.$transaction(async (tx) => {
      const ev = await platformAuditService.recordEvent(
        {
          actor: authenticatedOwner,
          action: PlatformAuditAction.OVERRIDE_APPLIED,
          subjectType: PlatformAuditSubjectType.OVERRIDE,
          subjectId: "tx-commit-subject",
          reason: "Simulated transactional commit",
        },
        tx,
      );
      committedId = ev.id;
    });

    assert.ok(committedId);
    const persisted = await prisma.systemAuditEvent.findUnique({
      where: { id: committedId },
    });
    assert.ok(persisted);
    assert.strictEqual(persisted.id, committedId);
    pass("Transaction commit reliably persists audit event");

    // =========================================================================
    // SECTION 4: Billing Database Integrity
    // =========================================================================
    console.log("\n--- SECTION 4: Billing Database Integrity ---");

    const organizations = await prisma.organization.findMany({
      include: {
        billingAccount: {
          include: {
            creditPools: {
              include: {
                ledgerEntries: true,
              },
            },
          },
        },
      },
    });

    assert.ok(organizations.length > 0, "Seeded organizations must exist");

    for (const org of organizations) {
      assert.ok(org.billingAccountId, `Org ${org.id} must have a valid billingAccountId`);
      assert.ok(org.billingAccount, `Org ${org.id} must resolve to a valid BillingAccount`);
      assert.strictEqual(org.billingAccount.overdraftLimit, 0, `BillingAccount ${org.billingAccount.id} overdraftLimit must be 0`);
      assert.strictEqual(org.billingAccount.overdraftUsed, 0, `BillingAccount ${org.billingAccount.id} overdraftUsed must be 0`);

      const trialPool = org.billingAccount.creditPools.find((p) => p.source === "TRIAL");
      assert.ok(trialPool, `Org ${org.name} must have a seeded TRIAL credit pool`);
      assert.strictEqual(trialPool.totalCredits, 50, "Seeded trial pool must have totalCredits = 50");
      assert.strictEqual(trialPool.cachedRemaining, 50, "Seeded trial pool must have cachedRemaining = 50");

      const ledgerSum = trialPool.ledgerEntries.reduce((sum, e) => sum + e.amount, 0);
      assert.strictEqual(ledgerSum, trialPool.cachedRemaining, "Cached pool balance must equal sum of ledger entries");

      const grantEntry = trialPool.ledgerEntries.find((e) => e.entryType === "GRANT");
      assert.ok(grantEntry, "TRIAL pool must have an opening GRANT ledger entry");
      assert.strictEqual(grantEntry.amount, 50, "Opening GRANT entry amount must be 50");
    }
    pass("Billing database integrity verified: 100% org-account mapping, zero overdraft, pool balance parity with ledger sum");

    // =========================================================================
    // SECTION 5: Concurrency Primitive Regression (billing.billing_begin)
    // =========================================================================
    console.log("\n--- SECTION 5: Concurrency Primitive Regression (billing.billing_begin) ---");

    const pgDirect = await createPgClient();
    const testOrgId = "org-gate-bb-" + Date.now();
    const testBaId = "ba-gate-bb-" + Date.now();
    const testPoolId = "pool-gate-bb-" + Date.now();
    const testSess1 = "sess-gate-1-" + Date.now();
    const testSess2 = "sess-gate-2-" + Date.now();
    const testSess3 = "sess-gate-3-" + Date.now();

    try {
      // Create test billing account
      await pgDirect.query(`
        INSERT INTO billing.billing_account (
          id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at
        ) VALUES ($1, 'Gate Test Org', 'IN', 'INR', 'ACTIVE', 0, 0, clock_timestamp(), clock_timestamp());
      `, [testBaId]);

      // Create test organization
      await pgDirect.query(`
        INSERT INTO public.organization (
          id, name, slug, billing_account_id, created_at
        ) VALUES ($1, 'Gate Test Org', $2, $3, clock_timestamp());
      `, [testOrgId, "gate-slug-" + Date.now(), testBaId]);

      // Create test pool with 2 credits
      await pgDirect.query(`
        INSERT INTO billing.credit_pool (
          id, billing_account_id, pool_type, name, source, total_credits,
          cached_remaining, status, unit_price_minor, currency, expires_at
        ) VALUES (
          $1, $2, 'TALENT_RESERVE', 'Gate Test Pool', 'PURCHASE', 2,
          2, 'ACTIVE', 6000, 'INR', clock_timestamp() + interval '30 days'
        );
      `, [testPoolId, testBaId]);

      // Get candidate and template for sessions
      const candRes = await pgDirect.query("SELECT id FROM public.candidate LIMIT 1");
      const candId = candRes.rows[0].id;
      const tmplRes = await pgDirect.query("SELECT id FROM public.role_template LIMIT 1");
      const tmplId = tmplRes.rows[0].id;

      for (const sid of [testSess1, testSess2, testSess3]) {
        await pgDirect.query(`
          INSERT INTO public.session (
            id, organization_id, candidate_id, role_template_id, cv_mode, status, kind
          ) VALUES ($1, $2, $3, $4, 'FULL', 'NOT_STARTED', 'LIVE');
        `, [sid, testOrgId, candId, tmplId]);
      }

      // 5.1 First session claims 1 credit (2 -> 1)
      const bb1 = await pgDirect.query("SELECT * FROM billing.billing_begin($1, 'enforce')", [testSess1]);
      assert.strictEqual(bb1.rows[0].outcome, "STARTED");
      assert.strictEqual(bb1.rows[0].balance_remaining, 1);
      pass("billing_begin: Session 1 claims credit atomically (balance 2 -> 1)");

      // 5.2 Idempotent retry returns ALREADY_STARTED
      const bb1Retry = await pgDirect.query("SELECT * FROM billing.billing_begin($1, 'enforce')", [testSess1]);
      assert.strictEqual(bb1Retry.rows[0].outcome, "ALREADY_STARTED");
      pass("billing_begin: Idempotent retry returns ALREADY_STARTED");

      // 5.3 Second session claims last credit (1 -> 0)
      const bb2 = await pgDirect.query("SELECT * FROM billing.billing_begin($1, 'enforce')", [testSess2]);
      assert.strictEqual(bb2.rows[0].outcome, "STARTED");
      assert.strictEqual(bb2.rows[0].balance_remaining, 0);
      pass("billing_begin: Session 2 claims credit atomically (balance 1 -> 0)");

      // 5.4 Third session raises NEEDS_SLOW_PATH
      let slowPathCaught = false;
      try {
        await pgDirect.query("SELECT * FROM billing.billing_begin($1, 'enforce')", [testSess3]);
      } catch (err: any) {
        slowPathCaught = true;
        assert.ok(err.message.includes("NEEDS_SLOW_PATH"));
      }
      assert.strictEqual(slowPathCaught, true);
      pass("billing_begin: Session 3 when exhausted raises NEEDS_SLOW_PATH");

      // 5.5 True Concurrency serialization test
      // Reset pool to 1 credit
      await pgDirect.query("UPDATE billing.credit_pool SET cached_remaining = 1 WHERE id = $1", [testPoolId]);
      const raceSessA = "sess-race-a-" + Date.now();
      const raceSessB = "sess-race-b-" + Date.now();
      for (const sid of [raceSessA, raceSessB]) {
        await pgDirect.query(`
          INSERT INTO public.session (
            id, organization_id, candidate_id, role_template_id, cv_mode, status, kind
          ) VALUES ($1, $2, $3, $4, 'FULL', 'NOT_STARTED', 'LIVE');
        `, [sid, testOrgId, candId, tmplId]);
      }

      const clientA = await createPgClient();
      const clientB = await createPgClient();
      try {
        const [resA, resB] = await Promise.all([
          clientA.query("SELECT * FROM billing.billing_begin($1, 'enforce')", [raceSessA]).catch((e) => ({ error: e.message })),
          clientB.query("SELECT * FROM billing.billing_begin($1, 'enforce')", [raceSessB]).catch((e) => ({ error: e.message })),
        ]);

        const oneSuccess = (resA.rows && resA.rows[0]?.outcome === "STARTED") ||
                           (resB.rows && resB.rows[0]?.outcome === "STARTED");
        const oneSlow = (resA.error && resA.error.includes("NEEDS_SLOW_PATH")) ||
                        (resB.error && resB.error.includes("NEEDS_SLOW_PATH"));

        assert.strictEqual(oneSuccess, true);
        assert.strictEqual(oneSlow, true);

        const poolFinal = await pgDirect.query("SELECT cached_remaining FROM billing.credit_pool WHERE id = $1", [testPoolId]);
        assert.strictEqual(poolFinal.rows[0].cached_remaining, 0);
        pass("billing_begin: Concurrent execution correctly serializes (1 STARTED, 1 NEEDS_SLOW_PATH, 0 remaining)");
      } finally {
        await clientA.end();
        await clientB.end();
      }
    } finally {
      try {
        await pgDirect.query("ALTER TABLE billing.session_billing_evidence DISABLE TRIGGER ALL");
        await pgDirect.query("ALTER TABLE billing.credit_ledger_entry DISABLE TRIGGER ALL");
        await pgDirect.query("ALTER TABLE billing.credit_pool DISABLE TRIGGER ALL");

        await pgDirect.query("DELETE FROM public.event_log WHERE session_id LIKE 'sess-gate-%' OR session_id LIKE 'sess-race-%'");
        await pgDirect.query("DELETE FROM billing.session_billing_evidence WHERE session_id LIKE 'sess-gate-%' OR session_id LIKE 'sess-race-%'");
        await pgDirect.query("DELETE FROM billing.credit_ledger_entry WHERE billing_account_id = $1", [testBaId]);
        await pgDirect.query("DELETE FROM public.session WHERE organization_id = $1", [testOrgId]);
        await pgDirect.query("DELETE FROM billing.credit_pool WHERE billing_account_id = $1", [testBaId]);
        await pgDirect.query("DELETE FROM public.organization WHERE id = $1", [testOrgId]);
        await pgDirect.query("DELETE FROM billing.billing_account WHERE id = $1", [testBaId]);

        await pgDirect.query("ALTER TABLE billing.credit_pool ENABLE TRIGGER ALL");
        await pgDirect.query("ALTER TABLE billing.credit_ledger_entry ENABLE TRIGGER ALL");
        await pgDirect.query("ALTER TABLE billing.session_billing_evidence ENABLE TRIGGER ALL");
      } catch (cleanErr: any) {
        console.warn("Section 5 cleanup notice:", cleanErr.message);
      } finally {
        await pgDirect.end();
      }
    }

    // =========================================================================
    // SECTION 6: Session Billing & State Boundary
    // =========================================================================
    console.log("\n--- SECTION 6: Session Billing & State Boundary ---");

    const pgSession = await createPgClient();
    const sessGuardOrg = "org-guard-" + Date.now();
    const sessGuardBa = "ba-guard-" + Date.now();
    const testGuardSess = "sess-guard-test-" + Date.now();

    try {
      await pgSession.query(`
        INSERT INTO billing.billing_account (
          id, name, billing_country, currency, status, overdraft_limit, overdraft_used, created_at, updated_at
        ) VALUES ($1, 'Guard Org', 'IN', 'INR', 'ACTIVE', 0, 0, clock_timestamp(), clock_timestamp());
      `, [sessGuardBa]);

      await pgSession.query(`
        INSERT INTO public.organization (
          id, name, slug, billing_account_id, created_at
        ) VALUES ($1, 'Guard Org', $2, $3, clock_timestamp());
      `, [sessGuardOrg, "guard-slug-" + Date.now(), sessGuardBa]);

      const candRes = await pgSession.query("SELECT id FROM public.candidate LIMIT 1");
      const candId = candRes.rows[0].id;
      const tmplRes = await pgSession.query("SELECT id FROM public.role_template LIMIT 1");
      const tmplId = tmplRes.rows[0].id;

      await pgSession.query(`
        INSERT INTO public.session (
          id, organization_id, candidate_id, role_template_id, cv_mode, status, kind
        ) VALUES ($1, $2, $3, $4, 'FULL', 'NOT_STARTED', 'LIVE');
      `, [testGuardSess, sessGuardOrg, candId, tmplId]);

      // 6.1 Unauthorized direct status update rejected by database trigger
      let directUpdateBlocked = false;
      try {
        await pgSession.query(`
          UPDATE public.session SET status = 'IN_PROGRESS' WHERE id = $1
        `, [testGuardSess]);
      } catch (err: any) {
        directUpdateBlocked = true;
        assert.ok(err.message.includes("Unauthorized session start") || err.message.includes("P0002"));
      }
      assert.strictEqual(directUpdateBlocked, true);
      pass("Session start trigger blocks direct unauthorized status update to IN_PROGRESS");

      // 6.2 Legitimate SessionService update succeeds
      await pgSession.query(`
        UPDATE public.session
           SET status = 'IN_PROGRESS',
               started_at = clock_timestamp(),
               deadline_at = clock_timestamp() + interval '60 minutes',
               last_heartbeat_at = clock_timestamp(),
               last_activity_at = clock_timestamp()
         WHERE id = $1
      `, [testGuardSess]);
      pass("Legitimate session start payload with started_at and deadline_at transitions successfully");

      // 6.3 Terminal session transition back to IN_PROGRESS rejected
      await pgSession.query(`UPDATE public.session SET status = 'SUBMITTED', submitted_at = clock_timestamp() WHERE id = $1`, [testGuardSess]);
      let terminalBlocked = false;
      try {
        await pgSession.query(`UPDATE public.session SET status = 'IN_PROGRESS' WHERE id = $1`, [testGuardSess]);
      } catch (err: any) {
        terminalBlocked = true;
        assert.ok(err.message.includes("terminal status") || err.message.includes("P0003"));
      }
      assert.strictEqual(terminalBlocked, true);
      pass("Transition from terminal status back to IN_PROGRESS rejected by database trigger");
    } finally {
      await pgSession.query(`DELETE FROM public.session WHERE id = $1`, [testGuardSess]);
      await pgSession.query(`DELETE FROM public.organization WHERE id = $1`, [sessGuardOrg]);
      await pgSession.query(`DELETE FROM billing.billing_account WHERE id = $1`, [sessGuardBa]);
      await pgSession.end();
    }

    // =========================================================================
    // SECTION 7: Data & Security Leakage Isolation
    // =========================================================================
    console.log("\n--- SECTION 7: Data & Security Leakage Isolation ---");

    // 7.1 Verify table counts and domain separation
    const platformStaffCount = await prisma.platformStaff.count();
    const recruiterStaffCount = await prisma.staff.count();
    assert.ok(platformStaffCount > 0);
    assert.ok(recruiterStaffCount > 0);

    // Cross-query check: no platform staff in recruiter staff table
    const platformOwnerEmail = "owner@cdrecruit.local";
    const recruiterWithPlatformEmail = await prisma.staff.findUnique({
      where: { email: platformOwnerEmail },
    });
    assert.strictEqual(recruiterWithPlatformEmail, null);
    pass("Public staff and Platform staff domains are completely decoupled (zero table bleed)");

    // 7.2 Verification endpoint works end-to-end
    const verifyHttpRes = await platformAuditController.verifyAuditBoundary({
      user: authenticatedOwner,
      headers: { "x-request-id": "req-gate-final-check" },
      ip: "127.0.0.1",
    });
    assert.strictEqual(verifyHttpRes.ok, true);
    assert.ok(verifyHttpRes.auditEventId);
    pass("Platform Ops verification endpoint executes end-to-end with authenticated context");

    console.log("================================================================================");
    console.log(`Gate Summary: All ${passedCount}/${totalCount} Integration Gate Checks Passed!`);
    console.log("================================================================================");
  } finally {
    await prisma.$disconnect();
  }
}

runFoundationGateTests().catch((err) => {
  console.error("Integration gate test failed:", err);
  process.exit(1);
});
