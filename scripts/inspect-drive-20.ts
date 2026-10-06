import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const drives = await prisma.drive.findMany({
    where: {
      name: { contains: '20', mode: 'insensitive' },
    },
    include: {
      invites: {
        include: {
          session: {
            include: {
              score: true,
              integrityFlags: true,
              proctoringEvents: true,
              identityCaptures: true,
            },
          },
        },
      },
      sessions: {
        include: {
          score: true,
          integrityFlags: true,
          proctoringEvents: true,
          identityCaptures: true,
        },
      },
    },
  });

  console.log('=== DRIVES MATCHING 20 ===');
  console.log(JSON.stringify(drives, null, 2));

  // Also check all recent sessions in DB
  const recentSessions = await prisma.session.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      candidate: true,
      drive: true,
      score: true,
      integrityFlags: true,
      proctoringEvents: true,
      identityCaptures: true,
    },
  });

  console.log('=== RECENT SESSIONS (ALL) ===');
  console.log(JSON.stringify(recentSessions, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
