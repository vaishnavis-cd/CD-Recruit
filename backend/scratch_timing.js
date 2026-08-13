const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.session.findUnique({
    where: { id: 'd5687bab-a3e7-4488-ac3f-4f79dc992600' },
    include: {
      identityCaptures: true,
      eventLogs: true,
    }
  });

  console.log("=== SESSION DETAILS ===");
  console.log({
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    disconnectedAt: session.disconnectedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    disconnectCount: session.disconnectCount,
  });

  if (session.startedAt && session.submittedAt) {
    const gapMs = session.submittedAt.getTime() - session.startedAt.getTime();
    console.log(`\nGap between startedAt and submittedAt: ${gapMs / 1000} seconds`);
  }

  console.log("\n=== CAPTURES ===");
  console.log(session.identityCaptures.map(c => ({
    windowIndex: c.windowIndex,
    scheduledAt: c.scheduledAt,
    status: c.status,
    secondsAfterStart: session.startedAt ? (c.scheduledAt.getTime() - session.startedAt.getTime()) / 1000 : null
  })));

  console.log("\n=== EVENT LOGS ===");
  console.log(session.eventLogs.map(e => ({
    eventType: e.eventType,
    occurredAt: e.occurredAt,
    payload: e.payload
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
