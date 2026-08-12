import { PrismaClient, Department, ExperienceLevel, ModuleType } from "@prisma/client";

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
  console.log("🌱 Seeding 16 Role Templates (8 Departments x 2 Experience Levels)...");

  // Fetch some existing published questions to attach to Software Engineering / Experienced
  const sampleQuestions = await prisma.question.findMany({
    where: { status: "PUBLISHED" },
    take: 6,
  });

  for (const dept of DEPARTMENTS) {
    for (const lvl of LEVELS) {
      const isExperienced = lvl === "EXPERIENCED";
      const isSoftwareEng = dept === "SOFTWARE_ENGINEERING";

      const roleName = `${DEPARTMENT_NAMES[dept]} - ${lvl === "FRESHER" ? "Junior / Fresher" : "Senior / Experienced"}`;
      const durationMinutes = isExperienced ? 90 : 60;

      // Upsert RoleTemplate by department and level
      const template = await prisma.roleTemplate.upsert({
        where: {
          department_level_version: {
            department: dept,
            level: lvl,
            version: 1,
          },
        },
        update: {
          roleName,
          isActive: true,
          durationMinutes,
          weightingPreset: {
            MCQ: 20,
            SQL: 20,
            CODING: 30,
            DEBUGGING: 15,
            AI_PROMPTING: 15,
          },
        },
        create: {
          department: dept,
          level: lvl,
          roleName,
          version: 1,
          isActive: true,
          durationMinutes,
          weightingPreset: {
            MCQ: 20,
            SQL: 20,
            CODING: 30,
            DEBUGGING: 15,
            AI_PROMPTING: 15,
          },
        },
      });

      console.log(`  ✓ Template: [${dept} / ${lvl}] → ${roleName} (ID: ${template.id})`);

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

        console.log(`    ↳ Attached ${sampleQuestions.length} active questions to [SOFTWARE_ENGINEERING / EXPERIENCED] template.`);
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
