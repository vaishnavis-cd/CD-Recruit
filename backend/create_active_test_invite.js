const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('Generating active test invite link...');

  // 1. Staff
  let staff = await prisma.staff.findFirst();
  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        email: 'admin@protora.com',
        name: 'Assessment Admin',
        role: 'RECRUITER',
        keycloakUserId: 'keycloak-admin-test',
      },
    });
  }

  // 2. Role Template
  let roleTemplate = await prisma.roleTemplate.findFirst({
    where: { isActive: true },
  });
  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.findFirst();
  }
  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: 'Full Stack Engineer',
        durationMinutes: 90,
        weightingPreset: {},
        version: 1,
        isActive: true,
      },
    });
  }

  // 3. Drive (scheduled starting 10 minutes ago, window open for 6 hours)
  const scheduledTime = new Date(Date.now() - 10 * 60 * 1000);
  const scheduleEnd = new Date(Date.now() + 6 * 60 * 60 * 1000);

  const questions = await prisma.question.findMany({ take: 20 });

  const drive = await prisma.drive.create({
    data: {
      name: 'Live Assessment Session',
      status: 'ACTIVE',
      roleTemplateId: roleTemplate.id,
      createdById: staff.id,
      moduleConfig: {
        MCQ: { enabled: true, count: 5, weight: 15 },
        CODING: { enabled: true, count: 2, weight: 35 },
        SQL: { enabled: true, count: 2, weight: 20 },
        DEBUGGING: { enabled: true, count: 1, weight: 15 },
        SIMULATION: { enabled: true, count: 1, weight: 15 },
      },
      scheduleStart: scheduledTime,
      scheduleEnd: scheduleEnd,
      bufferMinutes: 30,
      graceMinutes: 180,
    },
  });

  for (const q of questions) {
    await prisma.driveQuestion.create({
      data: {
        driveId: drive.id,
        questionId: q.id,
        moduleType: q.moduleType,
        questionVersionSnapshot: q.version || 1,
      },
    }).catch(() => {});
  }

  // 4. Create Active Invite
  const suffix = crypto.randomBytes(6).toString('hex');
  const token = `inv_candidate_${suffix}`;

  const invite = await prisma.invite.create({
    data: {
      token: token,
      driveId: drive.id,
      roleTemplateId: roleTemplate.id,
      createdById: staff.id,
      candidateEmail: `candidate.${suffix}@protora.com`,
      candidateName: 'Candidate User',
      scheduledTime: scheduledTime,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'PENDING',
      bufferMinutes: 30,
      graceMinutes: 180,
    },
  });

  console.log('\n================================================================');
  console.log('✅ CANDIDATE TEST INVITE LINK (READY TO START NOW)');
  console.log('================================================================');
  console.log(`Invite Token:    ${invite.token}`);
  console.log(`Candidate Name:  ${invite.candidateName}`);
  console.log(`Candidate Email: ${invite.candidateEmail}`);
  console.log(`Window Status:   ACTIVE (Ready to start immediately)`);
  console.log('----------------------------------------------------------------');
  console.log(`Candidate Link:  http://localhost:3000/invite/${invite.token}`);
  console.log('================================================================\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
