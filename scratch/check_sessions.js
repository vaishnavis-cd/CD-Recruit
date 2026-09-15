require('dotenv').config({ path: './.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const sessions = await prisma.session.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, candidateId: true, createdAt: true }
  });
  console.log('Recent sessions:', JSON.stringify(sessions, null, 2));

  const events = await prisma.proctoringEvent.findMany({
    take: 5,
    orderBy: { timestamp: 'desc' },
  });
  console.log('Recent proctoring events in DB:', JSON.stringify(events, null, 2));

  const clips = await prisma.evidenceClip.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  console.log('Recent evidence clips in DB:', JSON.stringify(clips, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
