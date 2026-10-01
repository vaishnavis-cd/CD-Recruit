import assert from "node:assert";
import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole, StaffRole } from "@cd-recruit/shared-types";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformAuditExplorerService } from "./platform-audit-explorer.service";
import { PlatformAuditController } from "./platform-audit.controller";
import {
  PlatformAuditAction,
  PlatformAuditSubjectType,
  AuthenticatedPlatformActor,
} from "./platform-audit.types";
import { sanitizeAuditData } from "./platform-audit.util";

async function runPlatformAuditTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Security Tests for Platform Audit Boundary (Step 1.6)");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS [${testTotal}]: ${msg}`);
  }

  const livePrisma = new PrismaService();
  const platformAuditService = new PlatformAuditService(livePrisma as any);
  const platformAuditExplorerService = new PlatformAuditExplorerService(livePrisma as any, platformAuditService);
  const platformAuditController = new PlatformAuditController(platformAuditService, platformAuditExplorerService);

  try {
    // Lookup or seed the OWNER account in test database
    let seededOwner = await livePrisma.platformStaff.findUnique({
      where: { email: "owner@cdrecruit.local" },
    });
    if (!seededOwner) {
      seededOwner = await livePrisma.platformStaff.create({
        data: {
          email: "owner@cdrecruit.local",
          name: "Platform Owner",
          role: "OWNER",
          isActive: true,
          mfaEnabled: true,
        },
      });
    }
    assert.ok(seededOwner, "Platform OWNER account must exist in database");

    const authenticatedOwner: AuthenticatedPlatformActor = {
      id: seededOwner.id,
      role: PlatformStaffRole.OWNER,
      platformRole: PlatformStaffRole.OWNER,
      isPlatformStaff: true,
      email: seededOwner.email,
      name: seededOwner.name,
    };

    const authenticatedFinance: AuthenticatedPlatformActor = {
      id: "finance-actor-uuid-1",
      role: PlatformStaffRole.FINANCE,
      platformRole: PlatformStaffRole.FINANCE,
      isPlatformStaff: true,
      email: "finance@cdrecruit.local",
    };

    const authenticatedSupport: AuthenticatedPlatformActor = {
      id: "support-actor-uuid-2",
      role: PlatformStaffRole.SUPPORT,
      platformRole: PlatformStaffRole.SUPPORT,
      isPlatformStaff: true,
      email: "support@cdrecruit.local",
    };

    // -------------------------------------------------------------------------
    // TEST 1: Authenticated PlatformStaff can produce an audit event
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1] Testing authenticated PlatformStaff audit production...");
    const event1 = await platformAuditService.recordEvent({
      actor: authenticatedOwner,
      action: PlatformAuditAction.STAFF_LOGIN,
      subjectType: PlatformAuditSubjectType.STAFF,
      subjectId: seededOwner.id,
      reason: "Initial super admin console login",
      executionResult: "SUCCESS",
    });
    assert.ok(event1.id, "Audit record must have generated UUID");
    assert.strictEqual(event1.action, PlatformAuditAction.STAFF_LOGIN);
    pass("Authenticated PlatformStaff can produce an audit event through PlatformAuditService");

    // -------------------------------------------------------------------------
    // TEST 2: Actor ID comes from authenticated platform identity
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2] Verifying actor ID provenance...");
    assert.strictEqual(event1.actorId, seededOwner.id, "actorId must match authenticated platform staff ID");
    pass("Actor ID originates authoritatively from authenticated platform identity");

    // -------------------------------------------------------------------------
    // TEST 3: Actor role is correct
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3] Verifying actor role...");
    assert.strictEqual(event1.actorRole, PlatformStaffRole.OWNER);
    pass("Actor role is recorded correctly as OWNER");

    // -------------------------------------------------------------------------
    // TEST 4: Audit action and resource fields are recorded correctly
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4] Verifying action, subjectType, and subjectId...");
    assert.strictEqual(event1.subjectType, PlatformAuditSubjectType.STAFF);
    assert.strictEqual(event1.subjectId, seededOwner.id);
    assert.strictEqual(event1.executionResult, "SUCCESS");
    pass("Audit action, subjectType, and subjectId are preserved accurately");

    // -------------------------------------------------------------------------
    // TEST 5: Request/correlation ID is preserved when available
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5] Testing request/correlation ID preservation...");
    const testCorrelationId = "corr-req-8899-xyz";
    const eventWithCorr = await platformAuditService.recordEvent({
      actor: authenticatedOwner,
      action: PlatformAuditAction.RETENTION_OVERRIDDEN,
      subjectType: PlatformAuditSubjectType.TENANT,
      subjectId: "tenant-org-uuid-99",
      reason: "Compliance legal hold override",
      ticketRef: "TICKET-7712",
      requestId: testCorrelationId,
    });
    assert.strictEqual(eventWithCorr.requestId, testCorrelationId);
    assert.strictEqual(eventWithCorr.ticketRef, "TICKET-7712");
    pass("Request/correlation ID and ticket reference are preserved in audit record");

    // -------------------------------------------------------------------------
    // TEST 6: Empty/unauthenticated platform request cannot create audit event
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6] Testing rejection of unauthenticated actor...");
    await assert.rejects(
      async () => {
        await platformAuditService.recordEvent({
          actor: null as any,
          action: PlatformAuditAction.SECURITY_CHALLENGE,
          subjectType: PlatformAuditSubjectType.SYSTEM,
          subjectId: "sys-1",
        });
      },
      (err: any) => err instanceof BadRequestException && err.message.includes("AUDIT_ACTOR_REQUIRED"),
    );
    pass("Unauthenticated/empty actor is rejected with BadRequestException");

    // -------------------------------------------------------------------------
    // TEST 7: Recruiter identity cannot be used as platform audit actor
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing rejection of recruiter identity as platform actor...");
    const recruiterActor = {
      id: "recruiter-staff-1",
      role: StaffRole.HR_LEAD,
      isPlatformStaff: false, // Tenant recruiter!
    };
    await assert.rejects(
      async () => {
        await platformAuditService.recordEvent({
          actor: recruiterActor as any,
          action: PlatformAuditAction.OVERRIDE_APPLIED,
          subjectType: PlatformAuditSubjectType.OVERRIDE,
          subjectId: "override-1",
        });
      },
      (err: any) =>
        err instanceof ForbiddenException &&
        err.message.includes("RECRUITER_IDENTITY_CANNOT_BE_PLATFORM_ACTOR"),
    );

    // Arbitrary string actor that is not 'system' rejected
    await assert.rejects(
      async () => {
        await platformAuditService.recordEvent({
          actor: "arbitrary-attacker-id" as any,
          action: PlatformAuditAction.OVERRIDE_APPLIED,
          subjectType: PlatformAuditSubjectType.OVERRIDE,
          subjectId: "override-1",
        });
      },
      (err: any) => err instanceof BadRequestException,
    );
    pass("Recruiter identity and arbitrary spoofed strings rejected from platform audit");

    // -------------------------------------------------------------------------
    // TEST 8: Audit event INSERT succeeds
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8] Verifying audit event INSERT persists to database...");
    const readBack = await livePrisma.systemAuditEvent.findUnique({
      where: { id: event1.id },
    });
    assert.ok(readBack, "Inserted audit record must be retrievable from platform.platform_audit_event");
    assert.strictEqual(readBack.id, event1.id);
    pass("Audit event INSERT successfully persisted to platform.platform_audit_event");

    // -------------------------------------------------------------------------
    // TEST 9: Database trigger immutability — UPDATE rejected
    // -------------------------------------------------------------------------
    console.log("\n[TEST 9] Verifying UPDATE is rejected by database trigger...");
    await assert.rejects(
      async () => {
        await livePrisma.$executeRawUnsafe(
          `UPDATE "platform"."platform_audit_event" SET reason = 'tampered' WHERE id = '${event1.id}'`,
        );
      },
      (err: any) => {
        const msg = String(err.message || err);
        return (
          msg.includes("strictly append-only") ||
          msg.includes("CANNOT_MODIFY_IMMUTABLE_TABLE")
        );
      },
    );
    pass("UPDATE on platform.platform_audit_event is blocked by database trigger");

    // -------------------------------------------------------------------------
    // TEST 10: Database trigger immutability — DELETE rejected
    // -------------------------------------------------------------------------
    console.log("\n[TEST 10] Verifying DELETE is rejected by database trigger...");
    await assert.rejects(
      async () => {
        await livePrisma.$executeRawUnsafe(
          `DELETE FROM "platform"."platform_audit_event" WHERE id = '${event1.id}'`,
        );
      },
      (err: any) => {
        const msg = String(err.message || err);
        return (
          msg.includes("strictly append-only") ||
          msg.includes("CANNOT_MODIFY_IMMUTABLE_TABLE")
        );
      },
    );
    pass("DELETE on platform.platform_audit_event is blocked by database trigger");

    // -------------------------------------------------------------------------
    // TEST 11: Database trigger immutability — TRUNCATE rejected
    // -------------------------------------------------------------------------
    console.log("\n[TEST 11] Verifying TRUNCATE is rejected by database trigger...");
    await assert.rejects(
      async () => {
        await livePrisma.$executeRawUnsafe(
          `TRUNCATE TABLE "platform"."platform_audit_event"`,
        );
      },
      (err: any) => {
        const msg = String(err.message || err);
        return (
          msg.includes("strictly append-only") ||
          msg.includes("CANNOT_TRUNCATE_IMMUTABLE_TABLE")
        );
      },
    );
    pass("TRUNCATE on platform.platform_audit_event is blocked by database trigger");

    // -------------------------------------------------------------------------
    // TEST 12: Sensitive authentication values stripped from audit metadata
    // -------------------------------------------------------------------------
    console.log("\n[TEST 12] Testing sanitization of sensitive authentication fields...");
    const rawPayload = {
      staffEmail: "admin@example.com",
      password: "PlainTextPassword123!",
      passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz",
      totpSecret: "JBSWY3DPEHPK3PXP",
      jwtSecret: "super-secret-key",
      accessToken: "eyJhbGciOiJIUzI1NiIsIn...",
      refreshToken: "d9e8f7a6b5c4",
      mfaChallengeToken: "mfa-challenge-token-xyz",
      apiKey: "live_pk_1234567890",
      ticketRef: "SAFE-TICKET-123", // exempt
      nested: {
        password: "nested_secret_pwd",
        clientIp: "192.168.1.1",
      },
    };

    const sanitized = sanitizeAuditData(rawPayload);
    assert.strictEqual(sanitized.password, "[REDACTED]");
    assert.strictEqual(sanitized.passwordHash, "[REDACTED]");
    assert.strictEqual(sanitized.totpSecret, "[REDACTED]");
    assert.strictEqual(sanitized.jwtSecret, "[REDACTED]");
    assert.strictEqual(sanitized.accessToken, "[REDACTED]");
    assert.strictEqual(sanitized.refreshToken, "[REDACTED]");
    assert.strictEqual(sanitized.mfaChallengeToken, "[REDACTED]");
    assert.strictEqual(sanitized.apiKey, "[REDACTED]");
    assert.strictEqual(sanitized.nested.password, "[REDACTED]");
    assert.strictEqual(sanitized.ticketRef, "SAFE-TICKET-123", "Exempt safe keys preserved");
    assert.strictEqual(sanitized.nested.clientIp, "192.168.1.1", "Safe keys preserved");

    // Persist event with sensitive before/after and verify stored state is redacted
    const eventSanitized = await platformAuditService.recordEvent({
      actor: authenticatedOwner,
      action: PlatformAuditAction.STAFF_UPDATED,
      subjectType: PlatformAuditSubjectType.STAFF,
      subjectId: seededOwner.id,
      before: rawPayload,
      after: { password: "NewPassword456!", status: "ACTIVE" },
    });
    assert.strictEqual((eventSanitized.before as any).password, "[REDACTED]");
    assert.strictEqual((eventSanitized.after as any).password, "[REDACTED]");
    pass("Sensitive authentication credentials, secrets, and hashes redacted from audit metadata");

    // -------------------------------------------------------------------------
    // TEST 13: SUPPORT actor recorded correctly
    // -------------------------------------------------------------------------
    console.log("\n[TEST 13] Testing SUPPORT actor recording...");
    const supportEvent = await platformAuditService.recordEvent({
      actor: authenticatedSupport,
      action: PlatformAuditAction.OVERRIDE_APPLIED,
      subjectType: PlatformAuditSubjectType.OVERRIDE,
      subjectId: "override-support-1",
      reason: "Triage customer ticket",
    });
    assert.strictEqual(supportEvent.actorRole, PlatformStaffRole.SUPPORT);
    assert.strictEqual(supportEvent.actorId, "support-actor-uuid-2");
    pass("SUPPORT actor recorded correctly with role and ID");

    // -------------------------------------------------------------------------
    // TEST 14: FINANCE actor recorded correctly
    // -------------------------------------------------------------------------
    console.log("\n[TEST 14] Testing FINANCE actor recording...");
    const financeEvent = await platformAuditService.recordEvent({
      actor: authenticatedFinance,
      action: PlatformAuditAction.INCIDENT_DECLARED,
      subjectType: PlatformAuditSubjectType.INCIDENT,
      subjectId: "incident-fin-1",
      reason: "Payment gateway outage reconciliation window",
    });
    assert.strictEqual(financeEvent.actorRole, PlatformStaffRole.FINANCE);
    assert.strictEqual(financeEvent.actorId, "finance-actor-uuid-1");
    pass("FINANCE actor recorded correctly with role and ID");

    // -------------------------------------------------------------------------
    // TEST 15: OWNER actor recorded correctly
    // -------------------------------------------------------------------------
    console.log("\n[TEST 15] Testing OWNER actor recording...");
    const ownerEvent = await platformAuditService.recordEvent({
      actor: authenticatedOwner,
      action: PlatformAuditAction.STAFF_CREATED,
      subjectType: PlatformAuditSubjectType.STAFF,
      subjectId: "new-staff-uuid",
      reason: "Onboarding new support analyst",
    });
    assert.strictEqual(ownerEvent.actorRole, PlatformStaffRole.OWNER);
    assert.strictEqual(ownerEvent.actorId, seededOwner.id);
    pass("OWNER actor recorded correctly with role and ID");

    // -------------------------------------------------------------------------
    // TEST 16: Verification endpoint generates expected server-side audit event
    // -------------------------------------------------------------------------
    console.log("\n[TEST 16] Testing verification controller endpoint...");
    const mockRequest = {
      user: authenticatedOwner,
      headers: {
        "x-request-id": "req-verify-http-9999",
      },
      ip: "10.0.0.1",
    };
    const verifyRes = await platformAuditController.verifyAuditBoundary(mockRequest);
    assert.strictEqual(verifyRes.ok, true);
    assert.ok(verifyRes.auditEventId);
    assert.strictEqual(verifyRes.action, PlatformAuditAction.PLATFORM_VERIFICATION_TEST);
    assert.strictEqual(verifyRes.actorId, seededOwner.id);
    assert.strictEqual(verifyRes.actorRole, PlatformStaffRole.OWNER);

    // Read back and verify correlation ID from header was recorded
    const readVerify = await livePrisma.systemAuditEvent.findUnique({
      where: { id: verifyRes.auditEventId },
    });
    assert.ok(readVerify);
    assert.strictEqual(readVerify.requestId, "req-verify-http-9999");
    assert.strictEqual(readVerify.action, PlatformAuditAction.PLATFORM_VERIFICATION_TEST);
    pass("Verification endpoint generates exact expected audit event from authenticated identity");

    // -------------------------------------------------------------------------
    // TEST 17: Transaction rollback rolls back audit event atomically
    // -------------------------------------------------------------------------
    console.log("\n[TEST 17] Testing transactional coupling & rollback...");
    let uncommittedEventId: string | null = null;
    try {
      await livePrisma.$transaction(async (tx) => {
        const txEvent = await platformAuditService.recordEvent(
          {
            actor: authenticatedOwner,
            action: PlatformAuditAction.OVERRIDE_APPLIED,
            subjectType: PlatformAuditSubjectType.OVERRIDE,
            subjectId: "tx-override-id",
            reason: "Should be rolled back",
          },
          tx,
        );
        uncommittedEventId = txEvent.id;
        // Intentionally simulate downstream business operation failure
        throw new Error("SIMULATED_BUSINESS_OPERATION_FAILURE");
      });
    } catch (err: any) {
      assert.strictEqual(err.message, "SIMULATED_BUSINESS_OPERATION_FAILURE");
    }

    assert.ok(uncommittedEventId, "Audit event ID should have been generated in tx");
    const rolledBackRecord = await livePrisma.systemAuditEvent.findUnique({
      where: { id: uncommittedEventId },
    });
    assert.strictEqual(
      rolledBackRecord,
      null,
      "Audit event in failed transaction must be rolled back atomically",
    );
    pass("Transaction failure atomically rolls back audit event when coupled with business mutation");

    console.log("================================================================================");
    console.log(`Summary: All ${testPassed}/${testTotal} Platform Audit Boundary Tests Passed!`);
    console.log("================================================================================");
  } finally {
    await livePrisma.$disconnect();
  }
}

describe('Platform Audit Boundary Tests', () => {
  it('runs all platform audit boundary tests', async () => {
    await runPlatformAuditTests();
  }, 60000);
});
