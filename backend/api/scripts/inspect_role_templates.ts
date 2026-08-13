import { PrismaClient, Department, ExperienceLevel } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const ALL_DEPARTMENTS: Department[] = [
  Department.SOFTWARE_ENGINEERING,
  Department.DATA_ENGINEERING,
  Department.QA,
  Department.SRE,
  Department.SYSOPS,
  Department.ITOPS,
  Department.PMO,
  Department.SECOPS,
];

const ALL_LEVELS: ExperienceLevel[] = [
  ExperienceLevel.FRESHER,
  ExperienceLevel.EXPERIENCED,
];

async function inspectRoleTemplates() {
  console.log('============================================================');
  console.log('ROLETEMPLATE DATABASE INSPECTION REPORT');
  console.log('============================================================\n');

  const allTemplates = await prisma.roleTemplate.findMany({
    include: {
      _count: {
        select: { questions: true },
      },
    },
    orderBy: [{ department: 'asc' }, { level: 'asc' }, { version: 'desc' }],
  });

  console.log(`Total RoleTemplates in Database: ${allTemplates.length}\n`);

  console.log('Existing RoleTemplates List:');
  console.table(
    allTemplates.map((t) => ({
      ID: t.id.slice(0, 8) + '...',
      RoleName: t.roleName,
      Department: t.department || 'NULL',
      Level: t.level || 'NULL',
      Active: t.isActive,
      Version: t.version,
      DurationMinutes: t.durationMinutes,
      LinkedQuestions: t._count.questions,
      WeightingPreset: JSON.stringify(t.weightingPreset),
    }))
  );

  console.log('\n------------------------------------------------------------');
  console.log('DEPARTMENT / LEVEL COMBINATION COVERAGE CHECK');
  console.log('------------------------------------------------------------');

  const matrixResult: any[] = [];

  for (const dept of ALL_DEPARTMENTS) {
    for (const lvl of ALL_LEVELS) {
      const active = allTemplates.find((t) => t.department === dept && t.level === lvl && t.isActive);
      const anyVersion = allTemplates.find((t) => t.department === dept && t.level === lvl);

      matrixResult.push({
        Department: dept,
        Level: lvl,
        ActiveTemplateFound: !!active,
        ActiveTemplateID: active ? active.id.slice(0, 8) + '...' : 'NONE',
        Version: active ? active.version : anyVersion ? anyVersion.version : 'NONE',
        LinkedQuestionsCount: active ? active._count.questions : 0,
        WeightingPreset: active ? JSON.stringify(active.weightingPreset) : 'NONE',
      });
    }
  }

  console.table(matrixResult);

  // Check specific query for SOFTWARE_ENGINEERING / FRESHER
  const seFresherActive = await prisma.roleTemplate.findFirst({
    where: {
      department: Department.SOFTWARE_ENGINEERING,
      level: ExperienceLevel.FRESHER,
      isActive: true,
    },
  });

  console.log('\n------------------------------------------------------------');
  console.log('SPECIFIC CHECK FOR SOFTWARE_ENGINEERING / FRESHER:');
  console.log('------------------------------------------------------------');
  console.log('Query: prisma.roleTemplate.findFirst({ where: { department: "SOFTWARE_ENGINEERING", level: "FRESHER", isActive: true } })');
  console.log('Result:', seFresherActive ? JSON.stringify(seFresherActive, null, 2) : 'NULL (NOT FOUND)');

  await prisma.$disconnect();
}

inspectRoleTemplates().catch((err) => {
  console.error(err);
  process.exit(1);
});
