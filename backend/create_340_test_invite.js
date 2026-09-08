const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('Generating test invite for 3:40 PM...');

  // 1. Staff
  let staff = await prisma.staff.findFirst();
  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        email: 'admin@protora.com',
        name: 'Assessment Admin',
        role: 'RECRUITER',
        keycloakUserId: 'keycloak-admin-340',
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

  // 3. Drive
  // Calculate 3:40 PM today local time
  const scheduledTime = new Date();
  scheduledTime.setHours(15, 40, 0, 0);

  const scheduleEnd = new Date(scheduledTime.getTime() + 6 * 60 * 60 * 1000); // 6 hours window

  // Find questions to attach
  const questions = await prisma.question.findMany({ take: 20 });

  const drive = await prisma.drive.create({
    data: {
      name: 'Assessment Drive - 3:40 PM Session',
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
      bufferMinutes: 15,
      graceMinutes: 60,
    },
  });

  // Attach questions to drive if available
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

  // 4. Create Invite
  const suffix = crypto.randomBytes(6).toString('hex');
  const token = `inv_test_340_${suffix}`;

  const invite = await prisma.invite.create({
    data: {
      token: token,
      driveId: drive.id,
      roleTemplateId: roleTemplate.id,
      createdById: staff.id,
      candidateEmail: `candidate.${suffix}@protora.com`,
      candidateName: 'Test Candidate',
      scheduledTime: scheduledTime,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'PENDING',
      bufferMinutes: 15,
      graceMinutes: 60,
    },
  });

  console.log('\n================================================================');
  console.log('✅ INVITE LINK GENERATED FOR 3:40 PM TEST');
  console.log('================================================================');
  console.log(`Invite Token:    ${invite.token}`);
  console.log(`Candidate Name:  ${invite.candidateName}`);
  console.log(`Candidate Email: ${invite.candidateEmail}`);
  console.log(`Scheduled Time:  ${scheduledTime.toLocaleTimeString()} (${scheduledTime.toISOString()})`);
  console.log(`Drive Name:      ${drive.name}`);
  console.log(`Buffer Minutes:  ${invite.bufferMinutes}m prior`);
  console.log(`Grace Minutes:   ${invite.graceMinutes}m`);
  console.log('----------------------------------------------------------------');
  console.log(`Candidate URL (Port 3000): http://localhost:3000/invite/${invite.token}`);
  console.log(`Candidate URL (Port 5173): http://localhost:5173/invite/${invite.token}`);
  console.log('================================================================\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
