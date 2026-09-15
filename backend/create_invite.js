const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const now = new Date();
  const suffix = Math.random().toString(36).slice(2, 12);
  const token = 'inv_ui_' + suffix;

  const drive = await db.drive.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!drive) throw new Error('No drive found in DB');

  const invite = await db.invite.create({
    data: {
      token,
      email: 'tester@proctora.com',
      candidateEmail: 'tester@proctora.com',
      candidateName: 'UI Tester',
      scheduledAt: new Date(now.getTime() + 2 * 60 * 1000), // 2 min from now
      expiresAt: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours
      status: 'PENDING',
      driveId: drive.id,
    },
  });

  console.log('');
  console.log('✅ Invite created!');
  console.log('Token :', token);
  console.log('Link  : http://localhost:3000/invite/' + token);
  console.log('Drive :', drive.id, '-', drive.name || '(unnamed)');
  console.log('');
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
