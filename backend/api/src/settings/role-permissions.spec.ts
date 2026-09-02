import assert from "assert";
import { SettingsService, DEFAULT_ROLE_PERMISSIONS } from "./settings.service";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import * as fs from "fs";
import * as path from "path";

async function runRolePermissionsTests() {
  console.log("Running Role Permissions Dynamic Engine tests...");

  // Mock Prisma
  const mockAuditLogs: any[] = [];
  const mockPrisma: any = {
    auditLog: {
      create: async (args: any) => {
        mockAuditLogs.push(args.data);
        return { id: "log-1", ...args.data };
      },
    },
    staff: {
      findUnique: async () => ({ id: "staff-admin-id" }),
      findFirst: async () => ({ id: "staff-admin-id" }),
    },
  };

  const service = new SettingsService(mockPrisma);

  // Test 1: getRolePermissions returns valid matrix and descriptors
  const permData = await service.getRolePermissions();
  assert.ok(permData.matrix, "Matrix should exist");
  assert.ok(permData.descriptors.length >= 12, "Descriptors should include all capabilities");
  assert.ok(permData.roles.includes(StaffRole.ADMIN));
  assert.ok(permData.roles.includes(StaffRole.HR_LEAD));
  assert.ok(permData.roles.includes(StaffRole.HR_ASSOCIATE));
  assert.ok(permData.roles.includes(StaffRole.REVIEWER));
  console.log("  ✔ getRolePermissions returns valid roles, descriptors, and matrix");

  // Test 2: ADMIN has full permissions unconditionally
  assert.strictEqual(service.hasPermission(StaffRole.ADMIN, Permission.DRIVE_CREATE), true);
  assert.strictEqual(service.hasPermission(StaffRole.ADMIN, Permission.DECISION_SUBMIT), true);
  assert.strictEqual(service.hasPermission(StaffRole.ADMIN, Permission.SETTINGS_MANAGE), true);
  console.log("  ✔ ADMIN has unconditional access to all permissions");

  // Test 3: Default permissions for HR_LEAD
  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DECISION_SUBMIT), true);
  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.IDENTITY_VERIFICATION_APPROVE), true);
  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DRIVE_CREATE), false);
  console.log("  ✔ HR_LEAD defaults: decision=true, drive_create=false");

  // Test 4: Default permissions for HR_ASSOCIATE
  assert.strictEqual(service.hasPermission(StaffRole.HR_ASSOCIATE, Permission.DRIVE_CREATE), true);
  assert.strictEqual(service.hasPermission(StaffRole.HR_ASSOCIATE, Permission.CANDIDATE_INGEST_CSV), true);
  assert.strictEqual(service.hasPermission(StaffRole.HR_ASSOCIATE, Permission.DECISION_SUBMIT), false);
  console.log("  ✔ HR_ASSOCIATE defaults: drive_create=true, decision=false");

  // Test 5: Default permissions for REVIEWER
  assert.strictEqual(service.hasPermission(StaffRole.REVIEWER, Permission.CANDIDATE_VIEW), true);
  assert.strictEqual(service.hasPermission(StaffRole.REVIEWER, Permission.MANUAL_SCORING_REVIEW), true);
  assert.strictEqual(service.hasPermission(StaffRole.REVIEWER, Permission.DRIVE_CREATE), false);
  console.log("  ✔ REVIEWER defaults: view=true, manual_score=true, drive_create=false");

  // Test 6: Admin dynamically grants DRIVE_CREATE to HR_LEAD
  await service.updateRolePermission(
    {
      role: StaffRole.HR_LEAD,
      permission: Permission.DRIVE_CREATE,
      isEnabled: true,
    },
    { id: "admin-1" },
  );

  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DRIVE_CREATE), true);
  console.log("  ✔ Dynamically toggling permission ON updates capability check immediately");

  // Test 7: Admin dynamically revokes DRIVE_CREATE from HR_LEAD
  await service.updateRolePermission(
    {
      role: StaffRole.HR_LEAD,
      permission: Permission.DRIVE_CREATE,
      isEnabled: false,
    },
    { id: "admin-1" },
  );

  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DRIVE_CREATE), false);
  console.log("  ✔ Dynamically toggling permission OFF revokes capability check immediately");

  // Test 8: Reset to defaults restores default matrix
  await service.resetRolePermissions({ id: "admin-1" });
  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DECISION_SUBMIT), true);
  assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DRIVE_CREATE), false);
  console.log("  ✔ Reset to defaults restores initial role matrix");

  console.log("✅ All Role Permissions Dynamic Engine tests passed successfully!");
}

runRolePermissionsTests().catch((err) => {
  console.error("❌ Role Permissions tests failed:", err);
  process.exit(1);
});
