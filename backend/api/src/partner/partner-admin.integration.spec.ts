import { PrismaClient } from "@prisma/client";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { PartnerAdminService } from "./partner-admin.service";
import * as assert from "node:assert";

const prisma = new PrismaClient();

async function runIntegrationVerification() {
  console.log("=== Running Partner API & Hit Tracking Integration Tests ===");

  // Find or create dummy staff for auditLog
  let staff = await prisma.staff.findFirst();
  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        email: "admin-test@test.local",
        passwordHash: "mockhash",
        name: "Admin Test",
        role: "ADMIN",
      },
    });
  }

  const partnerAdminService = new PartnerAdminService(prisma as any);
  const guard = new PartnerApiKeyGuard(prisma as any);

  // 1. Create a test partner
  console.log("1. Creating test partner...");
  const created = await partnerAdminService.create(
    {
      name: "Integration Test ATS Partner",
      callbackUrl: "https://ats.example.com/webhook",
      rateLimit: 120,
    },
    staff.id
  );

  console.log("   Partner created with ID:", created.id);
  assert.strictEqual(created.name, "Integration Test ATS Partner");
  assert.strictEqual(created.apiHitCount, 0);
  assert.ok(created.apiKey.startsWith("pk_live_"));

  // 2. Verify list() returns apiHitCount
  console.log("2. Checking partner list...");
  const list = await partnerAdminService.list();
  const listedPartner = list.find((p) => p.id === created.id);
  assert.ok(listedPartner, "Partner should exist in list");
  assert.strictEqual(listedPartner.apiHitCount, 0, "Initial hit count should be 0");

  // 3. Simulate guard execution with valid key and confirm hit count increments
  console.log("3. Simulating 2 API requests via PartnerApiKeyGuard...");
  const mockReq1: any = { headers: { "x-api-key": created.apiKey } };
  const mockCtx1: any = {
    switchToHttp: () => ({ getRequest: () => mockReq1 }),
  };

  const allowed1 = await guard.canActivate(mockCtx1);
  assert.strictEqual(allowed1, true);

  // Wait a moment for async increment
  await new Promise((r) => setTimeout(r, 400));

  const mockReq2: any = { headers: { "x-api-key": created.apiKey } };
  const mockCtx2: any = {
    switchToHttp: () => ({ getRequest: () => mockReq2 }),
  };
  const allowed2 = await guard.canActivate(mockCtx2);
  assert.strictEqual(allowed2, true);

  await new Promise((r) => setTimeout(r, 400));

  const pAfterHits = await prisma.partner.findUnique({
    where: { id: created.id },
  });
  console.log("   Hits recorded in DB:", pAfterHits?.apiHitCount);
  assert.strictEqual(pAfterHits?.apiHitCount, 2, "Hit count should be 2");

  // 4. Test Revoke
  console.log("4. Testing partner revocation...");
  const revoked = await partnerAdminService.revoke(created.id, staff.id);
  assert.strictEqual(revoked.isRevoked, true);

  // Guard should now reject requests with 401
  let guardRejected = false;
  try {
    await guard.canActivate(mockCtx1);
  } catch (err: any) {
    guardRejected = true;
    assert.strictEqual(err.message, "Invalid or revoked X-API-Key");
  }
  assert.strictEqual(guardRejected, true, "Revoked key must be rejected by guard");
  console.log("   Revoked partner correctly rejected by guard with 401");

  // Verify PARTNER_REVOKED audit log
  const auditRevoke = await prisma.auditLog.findFirst({
    where: { entityId: created.id, action: "PARTNER_REVOKED" },
  });
  assert.ok(auditRevoke, "Audit log PARTNER_REVOKED must exist");

  // 5. Test Delete
  console.log("5. Testing permanent deletion...");
  const deletedResult = await partnerAdminService.delete(created.id, staff.id);
  assert.strictEqual(deletedResult.success, true);

  const pAfterDelete = await prisma.partner.findUnique({
    where: { id: created.id },
  });
  assert.strictEqual(pAfterDelete, null, "Partner record must be deleted");

  // Verify PARTNER_DELETED audit log
  const auditDelete = await prisma.auditLog.findFirst({
    where: { entityId: created.id, action: "PARTNER_DELETED" },
  });
  assert.ok(auditDelete, "Audit log PARTNER_DELETED must exist");
  console.log("   Partner deleted permanently and PARTNER_DELETED audit log verified");

  console.log("\n🎉 ALL PARTNER INTEGRATION & HIT TRACKING TESTS PASSED!");
}

runIntegrationVerification()
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
