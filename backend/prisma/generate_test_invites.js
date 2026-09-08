const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staff.findFirst();
  if (!staff) {
    console.error('No staff record found in database. Run seed first.');
    return;
  }

  // Find an active role template
  let role = await prisma.roleTemplate.findFirst();
  if (!role) {
    console.error('No role template found.');
    return;
  }

  // Ensure an active drive exists
  let drive = await prisma.drive.findFirst({
    where: { status: 'ACTIVE' },
    include: { roleTemplate: true },
  });

  if (!drive) {
    drive = await prisma.drive.create({
      data: {
        name: 'Full Stack Engineering Assessment 2026',
        status: 'ACTIVE',
        roleTemplateId: role.id,
        createdById: staff.id,
        scheduleStart: new Date(Date.now() - 30 * 60 * 1000),
        scheduleEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        bufferMinutes: 15,
        graceMinutes: 180,
      },
      include: { roleTemplate: true },
    });
  }

  // 1. Scheduled 11:00 AM IST Invite (2026-09-04T11:00:00+05:30 -> 2026-09-04T05:30:00.000Z)
  const scheduledTime11AM = new Date('2026-09-04T05:30:00.000Z');
  const token11AM = 'inv_11am_' + crypto.randomBytes(8).toString('hex');

  const invite11AM = await prisma.invite.create({
    data: {
      token: token11AM,
      driveId: drive.id,
      roleTemplateId: role.id,
      createdById: staff.id,
      candidateEmail: 'karthik.11am@example.com',
      candidateName: 'Karthik Srinivasan',
      scheduledTime: scheduledTime11AM,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'PENDING',
      bufferMinutes: 15,
      graceMinutes: 180,
    },
  });

  // 2. Immediate / Ready-to-Test Invite (Active right now for immediate UI & API contract validation)
  const tokenImmediate = 'inv_now_' + crypto.randomBytes(8).toString('hex');
  const inviteImmediate = await prisma.invite.create({
    data: {
      token: tokenImmediate,
      driveId: drive.id,
      roleTemplateId: role.id,
      createdById: staff.id,
      candidateEmail: 'karthik.now@example.com',
      candidateName: 'Karthik Srinivasan',
      scheduledTime: new Date(Date.now() - 5 * 60 * 1000), // active right now
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'PENDING',
      bufferMinutes: 15,
      graceMinutes: 180,
    },
  });

  console.log('\n========================================================================');
  console.log('🎯 11:00 AM IST SCHEDULED INVITE TOKEN GENERATED');
  console.log('------------------------------------------------------------------------');
  console.log('Token:            ' + invite11AM.token);
  console.log('Scheduled Time:   11:00:00 AM IST (2026-09-04T05:30:00.000Z)');
  console.log('Unlock Time:      10:45:00 AM IST (15m buffer before 11:00 AM)');
  console.log('Candidate Web:    http://localhost:3000/invite/' + invite11AM.token);
  console.log('------------------------------------------------------------------------\n');

  console.log('========================================================================');
  console.log('⚡ IMMEDIATE TEST INVITE TOKEN (Active Now for Immediate Validation)');
  console.log('------------------------------------------------------------------------');
  console.log('Token:            ' + inviteImmediate.token);
  console.log('Status:           Active (System Check -> Consent -> Test Modules ready)');
  console.log('Candidate Web:    http://localhost:3000/invite/' + inviteImmediate.token);
  console.log('========================================================================\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
