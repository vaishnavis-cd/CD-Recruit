const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking Questions by Module ---');
  const counts = await prisma.question.groupBy({
    by: ['moduleType'],
    _count: { id: true },
  });
  console.log(counts);

  console.log('\n--- Checking Drives ---');
  const drives = await prisma.drive.findMany({
    include: {
      roleTemplate: true,
      questions: {
        include: { question: true },
      },
    },
  });
  for (const d of drives) {
    console.log(`Drive ID: ${d.id}`);
    console.log(`Name: ${d.name}`);
    console.log(`Status: ${d.status}`);
    console.log(`ScheduleStart: ${d.scheduleStart}`);
    console.log(`ScheduleEnd: ${d.scheduleEnd}`);
    console.log(`RoleTemplate: ${d.roleTemplate?.roleName}`);
    console.log(`Total Questions Linked: ${d.questions.length}`);
    const modsInDrive = new Set(d.questions.map(q => q.moduleType || q.question.moduleType));
    console.log(`Modules present in Drive questions:`, Array.from(modsInDrive));
    console.log(`moduleConfig:`, JSON.stringify(d.moduleConfig, null, 2));
    console.log('--------------------------------------------------');
  }

  console.log('\n--- Checking Staff ---');
  const staff = await prisma.staff.findMany();
  console.log('Staff count:', staff.length, staff.map(s => ({ id: s.id, email: s.email, role: s.role })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
