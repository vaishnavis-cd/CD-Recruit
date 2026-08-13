import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.question.count();
  console.log(`Current DB Question Count: ${count}`);

  const distribution = await prisma.question.groupBy({
    by: ['role', 'moduleType'],
    _count: { id: true },
  });

  console.log('Current DB Distribution by Role & ModuleType:');
  console.table(distribution.map(d => ({ role: d.role, moduleType: d.moduleType, count: d._count.id })));

  const sampleQuestion = await prisma.question.findFirst();
  console.log('Sample DB Question:', JSON.stringify(sampleQuestion, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
