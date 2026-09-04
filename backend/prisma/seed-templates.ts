import { PrismaClient, Department, ExperienceLevel, CandidateCategory, ModuleType } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const databaseUrl = process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@localhost:5433/cdrecruit";
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

const DEPARTMENTS: Department[] = [
  "SOFTWARE_ENGINEERING",
  "DATA_ENGINEERING",
  "PMO",
  "QA",
  "SYSOPS",
  "ITOPS",
  "SECOPS",
  "SRE",
];

const ROLE_TITLES: Record<string, string> = {
  SOFTWARE_ENGINEERING: "Software Engineer (SDE)",
  DATA_ENGINEERING: "Data Engineer",
  PMO: "Project Management Officer (PMO)",
  QA: "QA Engineer",
  SYSOPS: "SysOps Engineer",
  ITOPS: "ITOps Specialist",
  SECOPS: "SecOps Specialist",
  SRE: "Site Reliability Engineer (SRE)",
};

const DEPT_WEIGHTS: Record<string, Record<string, number>> = {
  SOFTWARE_ENGINEERING: {
    MCQ: 0.15,
    SQL: 0.15,
    CODING: 0.30,
    DEBUGGING: 0.10,
    TEST_SCENARIOS: 0.15,
    AI_PROMPTING: 0.05,
    SIMULATION: 0.10,
  },
  DATA_ENGINEERING: { MCQ: 0.20, SQL: 0.30, CODING: 0.20, TEST_SCENARIOS: 0.20, AI_PROMPTING: 0.10 },
  QA: { MCQ: 0.20, CODING: 0.15, DEBUGGING: 0.20, TEST_SCENARIOS: 0.35, AI_PROMPTING: 0.10 },
  SRE: { MCQ: 0.25, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.30 },
  SYSOPS: { MCQ: 0.30, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.25 },
  ITOPS: { MCQ: 0.30, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.25 },
  PMO: { MCQ: 0.25, TEST_SCENARIOS: 0.50, AI_PROMPTING: 0.25 },
  SECOPS: { MCQ: 0.25, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.30 },
};

const TIERS = [
  { category: "FRESHER" as CandidateCategory, level: "FRESHER" as ExperienceLevel, experienceTier: "0-1", suffix: "Fresher (0-1 yrs)" },
  { category: "EXPERIENCED" as CandidateCategory, level: "EXPERIENCED" as ExperienceLevel, experienceTier: "2-5", suffix: "Level 1 (2-5 yrs)" },
  { category: "EXPERIENCED" as CandidateCategory, level: "EXPERIENCED" as ExperienceLevel, experienceTier: "6-10", suffix: "Level 2 (6-10 yrs)" },
  { category: "EXPERIENCED" as CandidateCategory, level: "EXPERIENCED" as ExperienceLevel, experienceTier: "11-15", suffix: "Level 3 (11-15 yrs)" },
];

async function main() {
  console.log("🌱 Seeding 32 Role Templates (8 Departments x 4 Experience Levels)...");

  // Fetch some existing published questions to attach to Software Engineering / Experienced
  const sampleQuestions = await prisma.question.findMany({
    where: { status: "PUBLISHED" },
    take: 6,
  });

  for (const dept of DEPARTMENTS) {
    for (const t of TIERS) {
      const roleName = `${ROLE_TITLES[dept]} - ${t.suffix}`;
      const durationMinutes = 90;
      const isExperienced = t.category === "EXPERIENCED";
      const isSoftwareEng = dept === "SOFTWARE_ENGINEERING";

      const template = await prisma.roleTemplate.upsert({
        where: {
          department_category_experienceTier_version: {
            department: dept,
            category: t.category,
            experienceTier: t.experienceTier,
            version: 1,
          },
        },
        update: {
          roleName,
          level: t.level,
          isActive: true,
          durationMinutes,
          weightingPreset: DEPT_WEIGHTS[dept] as any,
        },
        create: {
          department: dept,
          category: t.category,
          level: t.level,
          experienceTier: t.experienceTier,
          roleName,
          version: 1,
          isActive: true,
          durationMinutes,
          weightingPreset: DEPT_WEIGHTS[dept] as any,
        },
      });

      // Seed global ModuleSetting records for this department and module types
      for (const moduleType of Object.values(ModuleType)) {
        const isEnabled = DEPT_WEIGHTS[dept] && DEPT_WEIGHTS[dept][moduleType] !== undefined && DEPT_WEIGHTS[dept][moduleType] > 0;
        await prisma.moduleSetting.upsert({
          where: {
            department_moduleType: {
              department: dept,
              moduleType,
            },
          },
          update: {
            isEnabled,
          },
          create: {
            department: dept,
            moduleType,
            isEnabled,
          },
        });
      }

      console.log(`  ✓ Template: [${dept} / ${t.experienceTier}] → ${roleName} (ID: ${template.id})`);

      // For SOFTWARE_ENGINEERING / EXPERIENCED, attach questions if sample questions exist
      if (isSoftwareEng && isExperienced && sampleQuestions.length > 0) {
        await prisma.roleTemplateQuestion.deleteMany({
          where: { roleTemplateId: template.id },
        });

        const templateQuestionsData = sampleQuestions.map((q, idx) => ({
          roleTemplateId: template.id,
          questionId: q.id,
          moduleType: q.moduleType,
          orderIndex: idx + 1,
          questionVersionSnapshot: q.version ?? 1,
          pointShare: 20,
        }));

        await prisma.roleTemplateQuestion.createMany({
          data: templateQuestionsData,
        });

        console.log(`    ↳ Attached ${sampleQuestions.length} active questions to [SOFTWARE_ENGINEERING / ${t.experienceTier}] template.`);
      }
    }
  }

  console.log("✅ Role Templates seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding role templates:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
