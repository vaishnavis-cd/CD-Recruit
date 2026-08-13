import { PrismaClient, Department, ExperienceLevel, ModuleType } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

interface RoleTemplateDef {
  roleName: string;
  department: Department;
  level: ExperienceLevel;
  durationMinutes: number;
  weightingPreset: Record<string, number>;
}

const TEMPLATE_CONFIGS: RoleTemplateDef[] = [
  // SDE
  {
    roleName: 'Software Engineer (SDE) - Fresher',
    department: Department.SOFTWARE_ENGINEERING,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: {
      MCQ: 0.15,
      SQL: 0.15,
      CODING: 0.20,
      DEBUGGING: 0.15,
      AI_PROMPTING: 0.10,
      SIMULATION: 0.15,
      TEST_SCENARIOS: 0.10,
    },
  },
  {
    roleName: 'Senior Software Engineer (SDE) - Experienced',
    department: Department.SOFTWARE_ENGINEERING,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: {
      MCQ: 0.15,
      SQL: 0.15,
      CODING: 0.20,
      DEBUGGING: 0.15,
      AI_PROMPTING: 0.10,
      SIMULATION: 0.15,
      TEST_SCENARIOS: 0.10,
    },
  },

  // DATA ENGINEERING
  {
    roleName: 'Data Engineer - Fresher',
    department: Department.DATA_ENGINEERING,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.30, SQL: 0.35, CODING: 0.35 },
  },
  {
    roleName: 'Data Engineer - Experienced',
    department: Department.DATA_ENGINEERING,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.30, SQL: 0.35, CODING: 0.35 },
  },

  // QA
  {
    roleName: 'QA Engineer - Fresher',
    department: Department.QA,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.20, SQL: 0.20, CODING: 0.20, DEBUGGING: 0.20, TEST_SCENARIOS: 0.20 },
  },
  {
    roleName: 'QA Engineer - Experienced',
    department: Department.QA,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.20, SQL: 0.20, CODING: 0.20, DEBUGGING: 0.20, TEST_SCENARIOS: 0.20 },
  },

  // SRE
  {
    roleName: 'Site Reliability Engineer (SRE) - Fresher',
    department: Department.SRE,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },
  {
    roleName: 'Site Reliability Engineer (SRE) - Experienced',
    department: Department.SRE,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },

  // SYSOPS
  {
    roleName: 'SysOps Engineer - Fresher',
    department: Department.SYSOPS,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },
  {
    roleName: 'SysOps Engineer - Experienced',
    department: Department.SYSOPS,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },

  // ITOPS
  {
    roleName: 'ITOps Specialist - Fresher',
    department: Department.ITOPS,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },
  {
    roleName: 'ITOps Specialist - Experienced',
    department: Department.ITOPS,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },

  // PMO
  {
    roleName: 'Project Management Officer (PMO) - Fresher',
    department: Department.PMO,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },
  {
    roleName: 'Project Management Officer (PMO) - Experienced',
    department: Department.PMO,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },

  // SECOPS
  {
    roleName: 'SecOps Specialist - Fresher',
    department: Department.SECOPS,
    level: ExperienceLevel.FRESHER,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },
  {
    roleName: 'SecOps Specialist - Experienced',
    department: Department.SECOPS,
    level: ExperienceLevel.EXPERIENCED,
    durationMinutes: 90,
    weightingPreset: { MCQ: 0.50, TEST_SCENARIOS: 0.50 },
  },
];

async function seedAndVerifyRoleTemplates() {
  console.log('============================================================');
  console.log('SEEDING AND UPDATING ROLETEMPLATES IN POSTGRESQL');
  console.log('============================================================\n');

  let createdCount = 0;
  let updatedCount = 0;

  for (const conf of TEMPLATE_CONFIGS) {
    const existing = await prisma.roleTemplate.findFirst({
      where: {
        department: conf.department,
        level: conf.level,
        isActive: true,
      },
    });

    if (existing) {
      await prisma.roleTemplate.update({
        where: { id: existing.id },
        data: {
          roleName: conf.roleName,
          durationMinutes: conf.durationMinutes,
          weightingPreset: conf.weightingPreset as any,
        },
      });
      console.log(`  🔄 Updated Active RoleTemplate: [${conf.department} / ${conf.level}] -> ${conf.roleName}`);
      updatedCount++;
    } else {
      await prisma.roleTemplate.create({
        data: {
          roleName: conf.roleName,
          department: conf.department,
          level: conf.level,
          durationMinutes: conf.durationMinutes,
          version: 1,
          isActive: true,
          weightingPreset: conf.weightingPreset as any,
        },
      });
      console.log(`  ✨ Created Active RoleTemplate: [${conf.department} / ${conf.level}] -> ${conf.roleName}`);
      createdCount++;
    }
  }

  console.log(`\nSeed Complete: ${createdCount} created, ${updatedCount} updated.\n`);

  console.log('============================================================');
  console.log('VERIFYING ROLETEMPLATES FOR ALL 16 DEPARTMENT/LEVEL PAIRS');
  console.log('============================================================\n');

  const matrix: any[] = [];
  let allActiveFound = true;

  for (const conf of TEMPLATE_CONFIGS) {
    const active = await prisma.roleTemplate.findFirst({
      where: {
        department: conf.department,
        level: conf.level,
        isActive: true,
      },
    });

    if (!active) allActiveFound = false;

    matrix.push({
      Department: conf.department,
      Level: conf.level,
      RoleName: active ? active.roleName : 'MISSING',
      Active: active ? active.isActive : false,
      Version: active ? active.version : 0,
      Duration: active ? active.durationMinutes : 0,
      EnabledModules: active ? Object.keys(active.weightingPreset as any).join(', ') : 'NONE',
    });
  }

  console.table(matrix);

  if (allActiveFound) {
    console.log('✅ ALL 16 Department/Level pairs have active, valid RoleTemplates!\n');
  } else {
    console.error('❌ DISCREPANCY: Some department/level pairs are still missing active RoleTemplates!\n');
  }

  await prisma.$disconnect();
}

seedAndVerifyRoleTemplates().catch((err) => {
  console.error(err);
  process.exit(1);
});
