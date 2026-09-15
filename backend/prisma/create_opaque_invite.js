const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const drives = await prisma.drive.findMany({ take: 1 });
  if (drives.length === 0) {
    console.log('No drives found');
    return;
  }
  const drive = drives[0];
  let candidate = await prisma.candidate.findFirst({ where: { email: 'karthik.candidate@example.com' } });
  if (!candidate) {
    candidate = await prisma.candidate.create({
      data: {
        email: 'karthik.candidate@example.com',
        name: 'Karthik Srinivasan',
        organizationId: drive.organizationId,
      },
    });
  }

  // Create opaque invite token
  const token = 'inv_' + crypto.randomBytes(16).toString('hex');
  const scheduledTime = new Date('2026-09-03T13:30:00.000Z'); // 7:00 PM IST

  const invite = await prisma.invite.create({
    data: {
      token: token,
      driveId: drive.id,
      candidateId: candidate.id,
      scheduledTime: scheduledTime,
      status: 'PENDING',
      bufferMinutes: 15,
      graceMinutes: 20,
    },
  });

  console.log('--- OPAQUE INVITE CREATED ---');
  console.log('TOKEN:', invite.token);
  console.log('SCHEDULED_TIME_IST: 7:00 PM (19:00:00)');
  console.log('SCHEDULED_TIME_ISO:', invite.scheduledTime.toISOString());
  console.log('DRIVE_ID:', drive.id);
  console.log('URL: http://localhost:5173/invite/' + invite.token);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
