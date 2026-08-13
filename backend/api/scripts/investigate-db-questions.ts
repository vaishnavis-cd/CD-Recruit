import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://cdrecruit:cdrecruit123@localhost:5432/cdrecruit",
    },
  },
});

async function main() {
  console.log("=== DB QUESTION COUNT BY DEPARTMENT / ROLE / TAGS ===");
  const allQuestions = await prisma.question.findMany();
  console.log(`Total Question count in DB: ${allQuestions.length}`);

  const deptCounts: Record<string, any[]> = {};
  for (const q of allQuestions) {
    const content = q.content as any;
    const dept = content?.department || q.role || 'UNSPECIFIED';
    if (!deptCounts[dept]) deptCounts[dept] = [];
    deptCounts[dept].push({
      id: q.id,
      moduleType: q.moduleType,
      role: q.role,
      departmentInContent: content?.department,
      prompt: (content?.prompt || content?.title || 'No prompt').substring(0, 60),
      tags: q.tags,
    });
  }

  for (const [dept, list] of Object.entries(deptCounts)) {
    console.log(`\nDepartment/Role [${dept}]: ${list.length} questions`);
    for (const item of list) {
      console.log(` - ID: ${item.id} | Module: ${item.moduleType} | Role: ${item.role} | ContentDept: ${item.departmentInContent} | Prompt: ${item.prompt}`);
    }
  }

  const sysOpsQuestions = allQuestions.filter((q) => {
    const content = q.content as any;
    return (
      q.role?.toUpperCase() === 'SYSOPS' ||
      content?.department?.toUpperCase() === 'SYSOPS' ||
      q.tags.some((t) => t.toUpperCase().includes('SYSOPS'))
    );
  });

  console.log(`\n=== SYSOPS EXPLICIT COUNT ===`);
  console.log(`SysOps Question Count: ${sysOpsQuestions.length}`);
  console.log(`SysOps Rows:`, JSON.stringify(sysOpsQuestions, null, 2));

  // Check RoleTemplates in DB
  const templates = await prisma.roleTemplate.findMany();

  console.log(`\n=== ROLE TEMPLATES IN DB ===`);
  for (const t of templates) {
    console.log(`Template ID: ${t.id} | RoleName: ${t.roleName} | Dept: ${t.department} | Level: ${t.level} | Version: ${t.version} | Active: ${t.isActive}`);
  }

  // Check RoleTemplateQuestions
  const rtQuestions = await prisma.roleTemplateQuestion.findMany({
    include: {
      roleTemplate: true,
      question: true,
    },
  });
  console.log(`\n=== ROLE TEMPLATE QUESTIONS IN DB ===`);
  console.log(`Total RoleTemplateQuestion links: ${rtQuestions.length}`);
  for (const rtq of rtQuestions) {
    console.log(`Link ID: ${rtq.id} | Template: ${rtq.roleTemplate.department} / ${rtq.roleTemplate.level} | QuestionId: ${rtq.questionId} | Module: ${rtq.moduleType}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
