import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING RECENT SESSIONS & IDENTITY CAPTURES ===");
  const sessions = await prisma.session.findMany({
    take: 10,
    include: {
      candidate: true,
      identityCaptures: true,
    },
  });

  sessions.forEach((s) => {
    console.log(`\n----------------------------------------`);
    console.log(`Session ID: ${s.id}`);
    console.log(`Candidate Name: ${s.candidate?.name} (${s.candidate?.email})`);
    console.log(`Status: ${s.status}`);
    console.log(`Started At: ${s.startedAt}`);
    console.log(`Identity Captures Count: ${s.identityCaptures.length}`);
    s.identityCaptures.forEach((ic) => {
      console.log(`  - Window ${ic.windowIndex}: status=${ic.status}, scheduledAt=${ic.scheduledAt}, capturedAt=${ic.capturedAt}, imageRef=${ic.imageRef}, matched=${ic.matched}`);
    });
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
