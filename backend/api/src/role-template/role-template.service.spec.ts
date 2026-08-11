import { RoleTemplateService } from "./role-template.service";
import { Department, ExperienceLevel, ModuleType } from "@prisma/client";
import assert from "node:assert";

async function runRoleTemplateServiceTests() {
  console.log("Running characterization tests for RoleTemplateService...");

  let findFirstResult: any = null;
  let findUniqueResult: any = null;
  let findFirstMaxVersion: any = null;
  let createdData: any = null;
  let updatedManyData: any = null;

  const mockPrisma: any = {
    roleTemplate: {
      findFirst: async (args: any) => {
        if (args?.where?.isActive === true) {
          return findFirstResult;
        }
        if (args?.orderBy?.version === "desc") {
          return findFirstMaxVersion;
        }
        return findFirstResult;
      },
      findUnique: async ({ where }: any) => {
        if (where.id === "template-v1") {
          return findUniqueResult;
        }
        if (where.id === "new-template-id") {
          return createdData;
        }
        return null;
      },
      findMany: async () => [findFirstResult],
      create: async ({ data }: any) => {
        createdData = { id: "new-template-id", ...data, questions: [] };
        return createdData;
      },
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      updateMany: async (args: any) => {
        updatedManyData = args;
        return { count: 1 };
      },
      delete: async ({ where }: any) => ({ id: where.id }),
    },
    roleTemplateQuestion: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 1 }),
    },
    $transaction: async (cb: any) => cb(mockPrisma),
  };

  const service = new RoleTemplateService(mockPrisma);

  // Test 1: findActiveTemplate returns template when active row exists
  findFirstResult = {
    id: "active-1",
    roleName: "Backend Engineer",
    department: Department.SOFTWARE_ENGINEERING,
    level: ExperienceLevel.FRESHER,
    version: 1,
    isActive: true,
    questions: [],
  };

  const active = await service.findActiveTemplate(
    Department.SOFTWARE_ENGINEERING,
    ExperienceLevel.FRESHER,
  );
  assert.strictEqual(active.id, "active-1");
  assert.strictEqual(active.department, Department.SOFTWARE_ENGINEERING);
  console.log("  ✔ findActiveTemplate returns active template");

  // Test 2: findActiveTemplate throws NotFoundException and NEVER auto-creates when missing
  findFirstResult = null;
  let threwNotFound = false;
  try {
    await service.findActiveTemplate(
      Department.SOFTWARE_ENGINEERING,
      ExperienceLevel.FRESHER,
    );
  } catch (err: any) {
    threwNotFound = true;
    assert.strictEqual(
      err.message,
      "Active RoleTemplate not found for department 'SOFTWARE_ENGINEERING' and level 'FRESHER'",
    );
  }
  assert.strictEqual(threwNotFound, true, "Should have thrown NotFoundException");
  console.log("  ✔ findActiveTemplate throws NotFoundException when no active row exists");

  // Test 3: publishNewVersion clones row & questions, sets new row active, flips old row inactive
  findUniqueResult = {
    id: "template-v1",
    roleName: "QA Engineer",
    weightingPreset: { MCQ: 1.0 },
    durationMinutes: 45,
    department: Department.QA,
    level: ExperienceLevel.FRESHER,
    version: 1,
    isActive: true,
    questions: [
      {
        id: "rtq-1",
        questionId: "q-1",
        moduleType: ModuleType.MCQ,
        orderIndex: 0,
        questionVersionSnapshot: 1,
        pointShare: 1.0,
      },
    ],
  };
  findFirstMaxVersion = { version: 1 };

  const published = await service.publishNewVersion("template-v1");
  assert.strictEqual(updatedManyData.data.isActive, false);
  assert.strictEqual(updatedManyData.where.department, Department.QA);
  assert.strictEqual(updatedManyData.where.level, ExperienceLevel.FRESHER);
  assert.strictEqual(createdData.version, 2);
  assert.strictEqual(createdData.isActive, true);
  console.log("  ✔ publishNewVersion clones active template, increments version, and deactivates old row");

  console.log("✅ All RoleTemplateService unit tests passed successfully!");
}

runRoleTemplateServiceTests().catch((err) => {
  console.error("❌ RoleTemplateService tests failed:", err);
  process.exit(1);
});
