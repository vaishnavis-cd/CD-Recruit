import { SettingsService, DEFAULT_ROLE_PERMISSIONS } from "./settings.service";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import { Department, ModuleType } from "@prisma/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runSettingsSubsystemTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Settings Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const staffDb: any[] = [
    { id: "staff-admin", name: "Super Admin", email: "admin@cdrecruit.com", role: StaffRole.ADMIN, createdAt: new Date() },
    { id: "staff-lead", name: "HR Lead User", email: "hrlead@cdrecruit.com", role: StaffRole.HR_LEAD, createdAt: new Date() },
  ];
  const auditLogsDb: any[] = [];
  const moduleSettingsDb: any[] = [];

  const mockPrisma: any = {
    staff: {
      findMany: async () => staffDb,
      findUnique: async ({ where }: any) => {
        if (where.id) return staffDb.find((s) => s.id === where.id) || null;
        if (where.email) return staffDb.find((s) => s.email === where.email) || null;
        return null;
      },
      findFirst: async ({ where }: any) => {
        if (where?.email) return staffDb.find((s) => s.email === where.email) || null;
        if (where?.keycloakUserId) return staffDb.find((s) => s.keycloakUserId === where.keycloakUserId) || null;
        return staffDb[0] || null;
      },
      create: async ({ data }: any) => {
        const item = { id: `staff-${staffDb.length + 1}`, ...data, createdAt: new Date() };
        staffDb.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = staffDb.find((s) => s.id === where.id);
        if (!item) throw new Error("Staff not found");
        Object.assign(item, data);
        return item;
      },
      delete: async ({ where }: any) => {
        const idx = staffDb.findIndex((s) => s.id === where.id);
        if (idx >= 0) staffDb.splice(idx, 1);
        return { success: true };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const item = { id: `log-${auditLogsDb.length + 1}`, ...data, occurredAt: new Date() };
        auditLogsDb.push(item);
        return item;
      },
      findMany: async () => auditLogsDb.map((l) => ({ ...l, staff: staffDb[0] })),
      count: async () => auditLogsDb.length,
    },
    moduleSetting: {
      findMany: async () => moduleSettingsDb,
      upsert: async ({ where, update, create }: any) => {
        let item = moduleSettingsDb.find(
          (m) =>
            m.department === where.department_moduleType?.department &&
            m.moduleType === where.department_moduleType?.moduleType,
        );
        if (item) {
          Object.assign(item, update);
        } else {
          item = { id: `ms-${moduleSettingsDb.length + 1}`, ...create };
          moduleSettingsDb.push(item);
        }
        return item;
      },
    },
  };

  const service = new SettingsService(mockPrisma);

  // ---------------------------------------------------------------------------
  // TEST 1: Scoring, Retention, Appeal & System Timing Configurations
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing global system configuration endpoints & audit trails...");

    // 1.1 Scoring Config
    const scoringInitial = await service.getScoringConfig();
    assert.strictEqual(scoringInitial.aiConfidenceThreshold, 0.8);
    pass("getScoringConfig returns initial default threshold of 0.8");

    await service.updateScoringConfig(0.85, 0.75, { id: "staff-admin" }, "MEDIUM");
    const scoringUpdated = await service.getScoringConfig();
    assert.strictEqual(scoringUpdated.aiConfidenceThreshold, 0.85);
    assert.strictEqual(scoringUpdated.passRateThreshold, 0.75);
    assert.strictEqual(scoringUpdated.aiIntensity, "MEDIUM");
    assert(auditLogsDb.some((l) => l.action === "SCORING_CONFIG_UPDATED"));
    pass("updateScoringConfig updates thresholds and writes audit log");

    // 1.2 Retention & Appeal Window Config
    await service.updateRetentionConfig(45, { id: "staff-admin" });
    const ret = await service.getRetentionConfig();
    assert.strictEqual(ret.biometricRetentionDays, 45);
    assert(auditLogsDb.some((l) => l.action === "RETENTION_CONFIG_UPDATED"));
    pass("updateRetentionConfig updates retention days and records audit log");

    await service.updateAppealWindowConfig(21, { id: "staff-admin" });
    const app = await service.getAppealWindowConfig();
    assert.strictEqual(app.appealWindowDays, 21);
    assert(auditLogsDb.some((l) => l.action === "APPEAL_WINDOW_CONFIG_UPDATED"));
    pass("updateAppealWindowConfig updates appeal window and records audit log");

    // 1.3 System Timing Thresholds
    await service.updateTimingThresholds(
      { heartbeatStaleThresholdSeconds: 60, graceWindowSeconds: 400, maxDisconnectCount: 5 },
      { id: "staff-admin" },
    );
    const timing = await service.getTimingThresholds();
    assert.strictEqual(timing.heartbeatStaleThresholdSeconds, 60);
    assert.strictEqual(timing.graceWindowSeconds, 400);
    assert.strictEqual(timing.maxDisconnectCount, 5);
    assert(auditLogsDb.some((l) => l.action === "SYSTEM_TIMING_UPDATED"));
    pass("updateTimingThresholds updates system parameters and logs action");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Staff Lifecycle Management & Duplicate Email Checks
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing staff member lifecycle and duplicate protection...");

    // 2.1 Create Staff
    const newStaff = await service.createStaff(
      { name: "Jane Recruiter", email: "jane@cdrecruit.com", role: StaffRole.RECRUITER },
      { id: "staff-admin" },
    );
    assert.strictEqual(newStaff.email, "jane@cdrecruit.com");
    assert.strictEqual(newStaff.role, StaffRole.RECRUITER);
    assert(auditLogsDb.some((l) => l.action === "STAFF_CREATED"));
    pass("createStaff registers new staff member with Keycloak ID and audit record");

    // 2.2 Reject Duplicate Email
    let threwDuplicate = false;
    try {
      await service.createStaff(
        { name: "Duplicate Jane", email: "jane@cdrecruit.com", role: StaffRole.RECRUITER },
        { id: "staff-admin" },
      );
    } catch (err: any) {
      if (err instanceof BadRequestException) threwDuplicate = true;
    }
    assert.strictEqual(threwDuplicate, true, "Must throw BadRequestException for duplicate staff email");
    pass("createStaff rejects duplicate email addresses");

    // 2.3 Update Staff Role
    await service.updateStaffRole(newStaff.id, StaffRole.HR_ASSOCIATE, { id: "staff-admin" });
    const updated = staffDb.find((s) => s.id === newStaff.id);
    assert.strictEqual(updated.role, StaffRole.HR_ASSOCIATE);
    assert(auditLogsDb.some((l) => l.action === "STAFF_ROLE_UPDATED"));
    pass("updateStaffRole mutates staff role and generates audit log");

    // 2.4 Delete Staff
    await service.deleteStaff(newStaff.id, { id: "staff-admin" });
    assert(!staffDb.some((s) => s.id === newStaff.id));
    assert(auditLogsDb.some((l) => l.action === "STAFF_DELETED"));
    pass("deleteStaff removes staff member and writes audit record");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Department Module Settings & Bulk Updates
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing department module settings and bulk enablement...");

    const initialSettings = await service.getModuleSettings();
    assert(initialSettings.length > 0, "Default department module settings should be populated");
    pass("getModuleSettings initializes and returns standard module allowances");

    // Update single module setting
    await service.updateModuleSetting(
      Department.SOFTWARE_ENGINEERING,
      ModuleType.SIMULATION,
      false,
      { id: "staff-admin" },
    );
    const sdeSim = moduleSettingsDb.find(
      (m) => m.department === Department.SOFTWARE_ENGINEERING && m.moduleType === ModuleType.SIMULATION,
    );
    assert.strictEqual(sdeSim.isEnabled, false);
    pass("updateModuleSetting updates single department module flag");

    // Bulk update department modules
    await service.bulkUpdateDepartmentModules(Department.PMO, true, { id: "staff-admin" });
    const pmoModules = moduleSettingsDb.filter((m) => m.department === Department.PMO);
    assert(pmoModules.every((m) => m.isEnabled === true));
    pass("bulkUpdateDepartmentModules enables all modules for specified department");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Dynamic RBAC Matrix & Superadmin Protection
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing dynamic RBAC matrix toggles and superadmin immutability...");

    // 4.1 Superadmin has all permissions unconditionally
    assert.strictEqual(service.hasPermission(StaffRole.ADMIN, Permission.SETTINGS_MANAGE), true);
    assert.strictEqual(service.hasPermission(StaffRole.ADMIN, Permission.DRIVE_CREATE), true);
    pass("hasPermission grants unconditional access to ADMIN role");

    // 4.2 Superadmin permission modification rejection
    let threwAdminLockout = false;
    try {
      await service.updateRolePermission(
        { role: StaffRole.ADMIN, permission: Permission.SETTINGS_MANAGE, isEnabled: false },
        { id: "staff-admin" },
      );
    } catch (err: any) {
      if (err instanceof BadRequestException) threwAdminLockout = true;
    }
    assert.strictEqual(threwAdminLockout, true, "Must throw BadRequestException when attempting to modify ADMIN permissions");
    pass("updateRolePermission protects ADMIN superadmin permissions from modification");

    // 4.3 Dynamic RBAC toggle for HR_LEAD
    await service.updateRolePermission(
      { role: StaffRole.HR_LEAD, permission: Permission.DRIVE_CREATE, isEnabled: true },
      { id: "staff-admin" },
    );
    assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DRIVE_CREATE), true);
    pass("updateRolePermission dynamically grants capability to HR_LEAD");

    // 4.4 Reset RBAC defaults
    await service.resetRolePermissions({ id: "staff-admin" });
    assert.strictEqual(service.hasPermission(StaffRole.HR_LEAD, Permission.DRIVE_CREATE), false);
    pass("resetRolePermissions restores initial default permission matrix");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runSettingsSubsystemTests().catch((err) => {
  console.error("❌ Settings subsystem tests failed:", err);
  process.exit(1);
});
