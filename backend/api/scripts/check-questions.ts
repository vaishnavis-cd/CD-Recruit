import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://cdrecruit:cdrecruit123@localhost:5432/cdrecruit',
    },
  },
});

async function main() {
  const questions = await prisma.question.findMany();
  console.log('--- TOTAL QUESTIONS ---');
  console.log(questions.length);

  const byRole = {};
  for (const q of questions) {
    const r = q.role || 'NO_ROLE';
    byRole[r] = (byRole[r] || 0) + 1;
  }
  console.log('--- QUESTIONS BY ROLE ---');
  console.log(JSON.stringify(byRole, null, 2));

  const sysopsQuestions = await prisma.question.findMany({
    where: {
      OR: [
        { role: 'SYSOPS' },
        { role: { contains: 'SYSOPS', mode: 'insensitive' } },
        { tags: { has: 'SYSOPS' } },
      ],
    },
  });
  console.log('--- SYSOPS QUESTIONS COUNT ---');
  console.log(sysopsQuestions.length);
  console.log('--- SYSOPS QUESTIONS ROWS ---');
  console.log(JSON.stringify(sysopsQuestions, null, 2));

  const roleTemplates = await prisma.roleTemplate.findMany({
    include: { questions: { include: { question: true } } },
  });
  console.log('--- ROLE TEMPLATES ---');
  console.log(JSON.stringify(roleTemplates.map(t => ({
    id: t.id,
    roleName: t.roleName,
    department: t.department,
    level: t.level,
    questionCount: t.questions.length,
    questionRoles: t.questions.map(q => q.question?.role)
  })), null, 2));
}

main().finally(() => prisma.$disconnect());
