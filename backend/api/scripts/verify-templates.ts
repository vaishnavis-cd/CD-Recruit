import { PrismaClient, Department } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== 1. VERIFYING ROLE TEMPLATES AND ATTACHED QUESTIONS ===');
  const departments = Object.values(Department);
  let allGood = true;

  for (const dept of departments) {
    const templates = await prisma.roleTemplate.findMany({
      where: { department: dept, isActive: true },
      include: {
        _count: { select: { questions: true } },
        questions: { select: { id: true, moduleType: true } },
      },
      orderBy: { experienceTier: 'asc' },
    });

    console.log(`\nDepartment: ${dept} (${templates.length} templates)`);
    for (const t of templates) {
      console.log(`  - [${t.category}] Tier ${t.experienceTier}: "${t.roleName}" -> ${t._count.questions} questions attached`);
      if (t._count.questions === 0) {
        allGood = false;
      }
    }
  }

  console.log('\n=== 2. VERIFYING PARTNER TEMPLATE ASSIGNMENT ===');
  const activeTemplates = await prisma.roleTemplate.findMany({
    where: { department: Department.SOFTWARE_ENGINEERING, isActive: true },
    include: { _count: { select: { questions: true } } },
  });

  const tiers = ['0-1', '2-5', '6-10', '11-15'];
  for (const tier of tiers) {
    const matched = activeTemplates.find((t) => t.experienceTier === tier);
    console.log(`Tier '${tier}' Candidate -> Assigned Template: "${matched?.roleName}" (ID: ${matched?.id}, Questions: ${matched?._count.questions})`);
    if (!matched || matched._count.questions === 0) {
      allGood = false;
    }
  }

  console.log('\n========================================');
  console.log(allGood ? 'ALL VERIFICATIONS PASSED SUCCESSFULLY ✅' : 'FAILURES DETECTED ❌');
  console.log('========================================');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
