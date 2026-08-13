const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany({
    include: {
      candidate: true,
      eventLogs: {
        orderBy: { occurredAt: 'asc' }
      }
    }
  });

  console.log('--- ALL SESSIONS & EVENT LOGS ---');
  for (const s of sessions) {
    console.log(`\nSession ID: ${s.id} | Candidate: ${s.candidate.email} | Status: ${s.status} | Disconnects: ${s.disconnectCount}`);
    for (const log of s.eventLogs) {
      console.log(`  [${log.occurredAt.toISOString()}] ${log.eventType} - Payload: ${JSON.stringify(log.payload)}`);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
