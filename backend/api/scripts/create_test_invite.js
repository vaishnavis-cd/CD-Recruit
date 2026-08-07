const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find our drive "SQL and Coding Automated Test" or latest ACTIVE drive
  let drive = await prisma.drive.findFirst({
    where: { name: { contains: 'SQL and Coding' } },
    include: { roleTemplate: true },
  });

  if (!drive) {
    drive = await prisma.drive.findFirst({
      where: { status: 'ACTIVE' },
      include: { roleTemplate: true },
    });
  }

  if (!drive) {
    console.error('No active drive found');
    return;
  }

  // Ensure drive is ACTIVE and has questions mapped
  await prisma.drive.update({
    where: { id: drive.id },
    data: { status: 'ACTIVE' },
  });

  // Link SQL and CODING questions to drive if not already linked
  const questionsToLink = await prisma.question.findMany({
    where: { moduleType: { in: ['SQL', 'CODING'] }, status: 'PUBLISHED' },
  });

  for (const q of questionsToLink) {
    await prisma.driveQuestion.upsert({
      where: { driveId_questionId: { driveId: drive.id, questionId: q.id } },
      create: { driveId: drive.id, questionId: q.id, moduleType: q.moduleType },
      update: {},
    });
  }

  // Find or create staff for invite creation
  let staff = await prisma.staff.findFirst();

  // Create test candidate & invite
  const candidate = await prisma.candidate.create({
    data: {
      email: `candidate.e2e.${Date.now()}@test.com`,
      name: 'E2E Candidate Tester',
    },
  });

  const token = `inv_e2e_test_${Date.now()}`;
  const invite = await prisma.invite.create({
    data: {
      driveId: drive.id,
      roleTemplateId: drive.roleTemplateId,
      createdById: staff.id,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      token,
      status: 'PENDING',
      isGenerated: true,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  console.log(`✅ TEST_INVITE_CREATED: Token=${invite.token}`);
  console.log(`Candidate Link: http://localhost:3000/start?token=${invite.token}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
