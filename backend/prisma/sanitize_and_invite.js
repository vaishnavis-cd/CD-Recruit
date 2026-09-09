const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const existingInv = await prisma.$queryRawUnsafe('SELECT * FROM invite LIMIT 1;');
  let createdById = null;
  if (existingInv && existingInv.length > 0) {
    createdById = existingInv[0].created_by_id;
  }

  const drives = await prisma.$queryRawUnsafe('SELECT * FROM drive LIMIT 1;');
  if (!drives || drives.length === 0) {
    console.log('No drives found');
    return;
  }
  const drive = drives[0];
  if (!createdById) {
    createdById = drive.created_by_id;
  }

  const token = 'inv_' + crypto.randomBytes(16).toString('hex');
  const inviteId = crypto.randomUUID();
  const scheduledTime = new Date('2026-09-03T13:30:00.000Z'); // 7:00 PM IST (19:00:00)
  const expiresAt = new Date('2026-09-04T13:30:00.000Z');

  await prisma.$queryRawUnsafe(
    `INSERT INTO invite (
      id, token, drive_id, role_template_id, candidate_email, candidate_name, 
      scheduled_time, expires_at, status, buffer_minutes, grace_minutes, 
      is_generated, origin_channel, created_by_id, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::"InviteStatus", $10, $11, $12, $13::"OriginChannel", $14, NOW());`,
    inviteId,
    token,
    drive.id,
    drive.role_template_id,
    'karthik.candidate.7pm@example.com',
    'Karthik Srinivasan',
    scheduledTime,
    expiresAt,
    'PENDING',
    15,
    20,
    true,
    'DIRECT',
    createdById
  );

  console.log('\n======================================================');
  console.log('🎉 OPAQUE INVITE TOKEN CREATED IN POSTGRESQL DB:');
  console.log('Token:          ' + token);
  console.log('Candidate Name: Karthik Srinivasan');
  console.log('Candidate Email: karthik.candidate.7pm@example.com');
  console.log('Scheduled Time: 7:00 PM IST (19:00:00)');
  console.log('Drive Name:     ' + drive.name);
  console.log('Invite Link:    http://localhost:5173/invite/' + token);
  console.log('======================================================\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
