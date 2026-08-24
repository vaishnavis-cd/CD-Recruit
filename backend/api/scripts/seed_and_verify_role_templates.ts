import { PrismaClient, Department, ExperienceLevel, ExperiencedLevel, ModuleType } from '@prisma/client';
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
  experiencedLevel: ExperiencedLevel | null;
  durationMinutes: number;
  weightingPreset: Record<string, number>;
}

const ROLE_TITLES: Record<Department, string> = {
  SOFTWARE_ENGINEERING: "Software Engineer (SDE)",
  DATA_ENGINEERING: "Data Engineer",
  PMO: "Project Management Officer (PMO)",
  QA: "QA Engineer",
  SYSOPS: "SysOps Engineer",
  ITOPS: "ITOps Specialist",
  SECOPS: "SecOps Specialist",
  SRE: "Site Reliability Engineer (SRE)",
};

const DEPT_WEIGHTS: Record<Department, Record<string, number>> = {
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

const TEMPLATE_CONFIGS: RoleTemplateDef[] = [];
const DEPARTMENTS = Object.keys(ROLE_TITLES) as Department[];

for (const dept of DEPARTMENTS) {
  const levels = [
    { lvl: ExperienceLevel.FRESHER, expLvl: null, suffix: "Fresher" },
    { lvl: ExperienceLevel.EXPERIENCED, expLvl: ExperiencedLevel.L1, suffix: "Experienced L1" },
    { lvl: ExperienceLevel.EXPERIENCED, expLvl: ExperiencedLevel.L2, suffix: "Experienced L2" },
    { lvl: ExperienceLevel.EXPERIENCED, expLvl: ExperiencedLevel.L3, suffix: "Experienced L3" },
  ];

  for (const { lvl, expLvl, suffix } of levels) {
    TEMPLATE_CONFIGS.push({
      roleName: `${ROLE_TITLES[dept]} - ${suffix}`,
      department: dept,
      level: lvl,
      experiencedLevel: expLvl,
      durationMinutes: 90,
      weightingPreset: DEPT_WEIGHTS[dept],
    });
  }
}

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
        experiencedLevel: conf.experiencedLevel,
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
      console.log(`  🔄 Updated Active RoleTemplate: [${conf.department} / ${conf.level}${conf.experiencedLevel ? ` / ${conf.experiencedLevel}` : ''}] -> ${conf.roleName}`);
      updatedCount++;
    } else {
      await prisma.roleTemplate.create({
        data: {
          roleName: conf.roleName,
          department: conf.department,
          level: conf.level,
          experiencedLevel: conf.experiencedLevel,
          durationMinutes: conf.durationMinutes,
          version: 1,
          isActive: true,
          weightingPreset: conf.weightingPreset as any,
        },
      });
      console.log(`  ✨ Created Active RoleTemplate: [${conf.department} / ${conf.level}${conf.experiencedLevel ? ` / ${conf.experiencedLevel}` : ''}] -> ${conf.roleName}`);
      createdCount++;
    }
  }

  console.log(`\nSeed Complete: ${createdCount} created, ${updatedCount} updated.\n`);

  // Cleanup obsolete Role Templates
  const keepNames = [
    "Software Developer",
    ...TEMPLATE_CONFIGS.map(t => t.roleName)
  ];

  const templatesToDelete = await prisma.roleTemplate.findMany({
    where: {
      roleName: { notIn: keepNames }
    },
    select: { id: true, roleName: true }
  });

  if (templatesToDelete.length > 0) {
    console.log('🧹 Cleaning up obsolete RoleTemplates...');
    const ids = templatesToDelete.map(t => t.id);
    
    await prisma.roleTemplateQuestion.deleteMany({
      where: { roleTemplateId: { in: ids } }
    });

    for (const t of templatesToDelete) {
      const isReferencedInDrive = await prisma.drive.findFirst({ where: { roleTemplateId: t.id } });
      const isReferencedInInvite = await prisma.invite.findFirst({ where: { roleTemplateId: t.id } });
      const isReferencedInSession = await prisma.session.findFirst({ where: { roleTemplateId: t.id } });

      if (isReferencedInDrive || isReferencedInInvite || isReferencedInSession) {
        await prisma.roleTemplate.update({
          where: { id: t.id },
          data: { isActive: false }
        });
        console.log(`  💤 Deactivated referenced obsolete RoleTemplate: ${t.roleName}`);
      } else {
        await prisma.roleTemplate.delete({
          where: { id: t.id }
        });
        console.log(`  🗑 Deleted obsolete RoleTemplate: ${t.roleName}`);
      }
    }
  }

  console.log('============================================================');
  console.log('VERIFYING ROLETEMPLATES FOR ALL 32 DEPARTMENT/LEVEL/EXPERIENCED_LEVEL COMBINATIONS');
  console.log('============================================================\n');

  const matrix: any[] = [];
  let allActiveFound = true;

  for (const conf of TEMPLATE_CONFIGS) {
    const active = await prisma.roleTemplate.findFirst({
      where: {
        department: conf.department,
        level: conf.level,
        experiencedLevel: conf.experiencedLevel,
        isActive: true,
      },
    });

    if (!active) allActiveFound = false;

    matrix.push({
      Department: conf.department,
      Level: conf.level,
      ExpLevel: conf.experiencedLevel || 'N/A',
      RoleName: active ? active.roleName : 'MISSING',
      Active: active ? active.isActive : false,
      Version: active ? active.version : 0,
      Duration: active ? active.durationMinutes : 0,
      EnabledModules: active ? Object.keys(active.weightingPreset as any).join(', ') : 'NONE',
    });
  }

  console.table(matrix);

  if (allActiveFound) {
    console.log('✅ ALL 32 Department/Level/ExpLevel combinations have active, valid RoleTemplates!\n');
  } else {
    console.error('❌ DISCREPANCY: Some combinations are still missing active RoleTemplates!\n');
  }

  await prisma.$disconnect();
}

seedAndVerifyRoleTemplates().catch((err) => {
  console.error(err);
  process.exit(1);
});
