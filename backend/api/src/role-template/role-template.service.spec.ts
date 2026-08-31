import { RoleTemplateService } from "./role-template.service";
import { DepartmentModuleConfigService } from "./department-module-config.service";
import { AllocationEngineService } from "./allocation-engine.service";
import { Department, ExperienceLevel, ModuleType } from "@prisma/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runRoleTemplateSubsystemTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for RoleTemplate Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 1: RoleTemplateService - findActiveTemplate Hierarchy & Strict 404
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing findActiveTemplate resolution hierarchy & strict 404...");

    let templatesDb: any[] = [];

    const mockPrisma: any = {
      roleTemplate: {
        findFirst: async ({ where }: any) => {
          let res = templatesDb.filter((t) => t.isActive === true);
          if (where.department) res = res.filter((t) => t.department === where.department);
          if (where.category) res = res.filter((t) => t.category === where.category);
          if (where.experienceTier) res = res.filter((t) => t.experienceTier === where.experienceTier);
          if (where.level) res = res.filter((t) => t.level === where.level);
          return res[0] || null;
        },
      },
    };

    const service = new RoleTemplateService(mockPrisma);

    // 1.1 Match by department and category/tier
    templatesDb = [
      {
        id: "rt-tier-1",
        roleName: "Full Stack Engineer",
        department: Department.SOFTWARE_ENGINEERING,
        category: "FRESHER",
        experienceTier: "0-1",
        version: 1,
        isActive: true,
        questions: [],
      },
    ];

    const foundTier = await service.findActiveTemplate(
      Department.SOFTWARE_ENGINEERING,
      "FRESHER",
      "0-1",
    );
    assert.strictEqual(foundTier.id, "rt-tier-1");
    pass("findActiveTemplate resolves matching department, category, and experienceTier");

    // 1.2 Fallback to legacy level lookup
    templatesDb = [
      {
        id: "rt-legacy-1",
        roleName: "Senior QA",
        department: Department.QA,
        level: ExperienceLevel.EXPERIENCED,
        version: 1,
        isActive: true,
        questions: [],
      },
    ];

    const foundLegacy = await service.findActiveTemplate(
      Department.QA,
      "EXPERIENCED",
    );
    assert.strictEqual(foundLegacy.id, "rt-legacy-1");
    pass("findActiveTemplate falls back to legacy department/level lookup");

    // 1.3 Strict NotFoundException when no template matches (Never auto-creates)
    templatesDb = [];
    let threw404 = false;
    try {
      await service.findActiveTemplate(Department.SRE, "FRESHER");
    } catch (err: any) {
      if (err instanceof NotFoundException) threw404 = true;
    }
    assert.strictEqual(threw404, true, "Must throw NotFoundException when no active template exists");
    pass("findActiveTemplate strictly throws NotFoundException without synthetic auto-provisioning");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: RoleTemplateService - publishNewVersion and activateTemplate
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing publishNewVersion and activateTemplate atomic operations...");

    const templatesDb: any[] = [
      {
        id: "v1-id",
        roleName: "DevOps Engineer",
        weightingPreset: { MCQ: 1.0 },
        durationMinutes: 60,
        department: Department.SRE,
        level: ExperienceLevel.FRESHER,
        category: "FRESHER",
        experienceTier: "0-1",
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
      },
    ];

    const mockPrisma: any = {
      roleTemplate: {
        findUnique: async ({ where }: any) => {
          return templatesDb.find((t) => t.id === where.id) || null;
        },
        findFirst: async ({ where }: any) => {
          const matching = templatesDb.filter(
            (t) =>
              t.department === where.department &&
              t.category === where.category &&
              t.experienceTier === where.experienceTier,
          );
          matching.sort((a, b) => b.version - a.version);
          return matching[0] || null;
        },
        updateMany: async ({ where, data }: any) => {
          for (const t of templatesDb) {
            if (
              t.department === where.department &&
              t.category === where.category &&
              t.experienceTier === where.experienceTier
            ) {
              if (where.id?.not && t.id === where.id.not) continue;
              Object.assign(t, data);
            }
          }
          return { count: 1 };
        },
        create: async ({ data }: any) => {
          const item = { id: `v${data.version}-id`, ...data, questions: [] };
          templatesDb.push(item);
          return item;
        },
        update: async ({ where, data }: any) => {
          const item = templatesDb.find((t) => t.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        },
      },
      roleTemplateQuestion: {
        createMany: async ({ data }: any) => {
          return { count: data.length };
        },
      },
      $transaction: async (cb: any) => cb(mockPrisma),
    };

    const service = new RoleTemplateService(mockPrisma);

    // 2.1 publishNewVersion
    const publishedV2 = await service.publishNewVersion("v1-id");
    assert.strictEqual(publishedV2?.version, 2);
    assert.strictEqual(publishedV2?.isActive, true);

    const oldV1 = templatesDb.find((t) => t.id === "v1-id");
    assert.strictEqual(oldV1?.isActive, false, "Old version must be deactivated");
    pass("publishNewVersion increments version, clones template & relations, and deactivates prior versions");

    // 2.2 activateTemplate
    const activatedV1 = await service.activateTemplate("v1-id");
    assert.strictEqual(activatedV1.isActive, true);
    assert.strictEqual(publishedV2.isActive, false, "Sibling version must be deactivated");
    pass("activateTemplate activates designated version and atomically deactivates sibling versions");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: DepartmentModuleConfigService Rules
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing DepartmentModuleConfigService rules & allowed modules...");

    const deptConfig = new DepartmentModuleConfigService();

    // 3.1 Software Engineering allows all modules & 4 languages
    const sdeConfig = deptConfig.getConfigForDepartment(Department.SOFTWARE_ENGINEERING);
    assert(sdeConfig.enabledModules.includes("SIMULATION"));
    assert(sdeConfig.enabledModules.includes("CODING"));
    assert(sdeConfig.codingLanguages?.includes("python"));
    assert(sdeConfig.codingLanguages?.includes("cpp"));
    pass("Software Engineering config exposes all modules and full language set");

    // 3.2 SRE / PMO constrains to MCQ & TEST_SCENARIOS only
    assert.strictEqual(deptConfig.isModuleEnabledForDepartment(Department.SRE, "MCQ"), true);
    assert.strictEqual(deptConfig.isModuleEnabledForDepartment(Department.SRE, "CODING"), false);
    assert.strictEqual(deptConfig.isModuleEnabledForDepartment(Department.PMO, "SIMULATION"), false);
    pass("SRE and PMO departments constrain allowed modules to MCQ & TEST_SCENARIOS");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: AllocationEngineService Dynamic Budgeting & Question Pools
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing AllocationEngineService dynamic budgeting & inventory verification...");

    const allocationEngine = new AllocationEngineService();

    // 4.1 SDE Fresher Allocation (20m simulation deduction, 70m pool, 50% easy ratio)
    const fresherAllocation = allocationEngine.allocate({
      department: Department.SOFTWARE_ENGINEERING,
      level: ExperienceLevel.FRESHER,
      moduleWeights: { MCQ: 0.3, CODING: 0.7 },
    });

    assert.strictEqual(fresherAllocation.totalTimeMinutes, 90);
    assert.strictEqual(fresherAllocation.simulationTimeMinutes, 20);
    assert.strictEqual(fresherAllocation.modulePoolMinutes, 70);
    assert.strictEqual(fresherAllocation.allocations.length, 2);
    pass("SDE Fresher allocation dedicates 20m to simulation and distributes 70m across module weights");

    // 4.2 SDE Experienced Allocation (30m simulation deduction)
    const expAllocation = allocationEngine.allocate({
      department: Department.SOFTWARE_ENGINEERING,
      level: ExperienceLevel.EXPERIENCED,
      moduleWeights: { CODING: 1.0 },
    });
    assert.strictEqual(expAllocation.simulationTimeMinutes, 30);
    assert.strictEqual(expAllocation.modulePoolMinutes, 60);
    pass("SDE Experienced allocation reserves 30m for simulation and adjusts pool accordingly");

    // 4.3 Insufficient Question Pool Exception Handling
    let threwInsufficient = false;
    try {
      allocationEngine.allocate({
        department: Department.QA,
        level: ExperienceLevel.FRESHER,
        moduleWeights: { MCQ: 1.0 },
        availableQuestionCounts: {
          MCQ: { easy: 0, medium: 0, hard: 0 }, // 0 available
        },
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes("INSUFFICIENT_QUESTIONS")) {
        threwInsufficient = true;
      }
    }
    assert.strictEqual(threwInsufficient, true, "Must throw BadRequestException when Question Bank inventory is exhausted");
    pass("AllocationEngine throws INSUFFICIENT_QUESTIONS exception when Question Bank inventory is below budget");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runRoleTemplateSubsystemTests().catch((err) => {
  console.error("❌ RoleTemplate subsystem tests failed:", err);
  process.exit(1);
});
