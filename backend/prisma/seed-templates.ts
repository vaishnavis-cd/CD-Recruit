import { PrismaClient, Department, ExperienceLevel, ModuleType } from "@prisma/client";
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

const LEVELS: ExperienceLevel[] = ["FRESHER", "EXPERIENCED"];

const DEPARTMENT_NAMES: Record<Department, string> = {
  SOFTWARE_ENGINEERING: "Software Engineering",
  DATA_ENGINEERING: "Data Engineering",
  PMO: "Project Management Office",
  QA: "Quality Assurance",
  SYSOPS: "System Operations",
  ITOPS: "IT Operations",
  SECOPS: "Security Operations",
  SRE: "Site Reliability Engineering",
};

async function main() {
  console.log("🌱 Seeding 32 Role Templates (8 Departments x 4 Experience Levels)...");

  // Fetch some existing published questions to attach to Software Engineering / Experienced
  const sampleQuestions = await prisma.question.findMany({
    where: { status: "PUBLISHED" },
    take: 6,
  });

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
      CODING: 0.20,
      DEBUGGING: 0.15,
      AI_PROMPTING: 0.10,
      SIMULATION: 0.15,
      TEST_SCENARIOS: 0.10,
    },
    DATA_ENGINEERING: { MCQ: 0.30, SQL: 0.35, CODING: 0.35 },
    QA: { MCQ: 0.20, SQL: 0.20, CODING: 0.20, DEBUGGING: 0.20, TEST_SCENARIOS: 0.20 },
    SRE: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
    SYSOPS: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
    ITOPS: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
    PMO: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
    SECOPS: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  };

  for (const dept of DEPARTMENTS) {
    const levelsToSeed = [
      { lvl: "FRESHER", expLvl: null, suffix: "Fresher" },
      { lvl: "EXPERIENCED", expLvl: "L1", suffix: "Experienced L1" },
      { lvl: "EXPERIENCED", expLvl: "L2", suffix: "Experienced L2" },
      { lvl: "EXPERIENCED", expLvl: "L3", suffix: "Experienced L3" },
    ];

    for (const { lvl, expLvl, suffix } of levelsToSeed) {
      const roleName = `${ROLE_TITLES[dept]} - ${suffix}`;
      const durationMinutes = 90;
      const isExperienced = lvl === "EXPERIENCED";
      const isSoftwareEng = dept === "SOFTWARE_ENGINEERING";

      // Find or create RoleTemplate by department, level, experiencedLevel
      let template = await prisma.roleTemplate.findFirst({
        where: {
          department: dept,
          level: lvl as any,
          experiencedLevel: expLvl as any,
          version: 1,
        },
      });

      if (template) {
        template = await prisma.roleTemplate.update({
          where: { id: template.id },
          data: {
            roleName,
            isActive: true,
            durationMinutes,
            weightingPreset: DEPT_WEIGHTS[dept] as any,
          },
        });
      } else {
        template = await prisma.roleTemplate.create({
          data: {
            department: dept,
            level: lvl as any,
            experiencedLevel: expLvl as any,
            roleName,
            version: 1,
            isActive: true,
            durationMinutes,
            weightingPreset: DEPT_WEIGHTS[dept] as any,
          },
        });
      }

      console.log(`  ✓ Template: [${dept} / ${lvl}${expLvl ? ` / ${expLvl}` : ""}] → ${roleName} (ID: ${template.id})`);

      // For SOFTWARE_ENGINEERING / EXPERIENCED, attach questions if sample questions exist
      if (isSoftwareEng && isExperienced && sampleQuestions.length > 0) {
        // Clear existing attached questions
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

        console.log(`    ↳ Attached ${sampleQuestions.length} active questions to [SOFTWARE_ENGINEERING / EXPERIENCED / ${expLvl}] template.`);
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
