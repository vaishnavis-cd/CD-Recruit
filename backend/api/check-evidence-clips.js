require("dotenv").config({ path: "../../.env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sessionIds = [
    "e5c89a4e-7551-4f4c-80c3-78308ee574a2",
    "6f5e550d-9313-46ce-9ecf-5608fe9dc6d5"
  ];
  
  for (const sessionId of sessionIds) {
    const events = await prisma.proctoringEvent.findMany({ where: { sessionId } });
    const withClip = events.filter(e => e.clipUrl);
    console.log(`Session ${sessionId}:`);
    console.log(`  Total events: ${events.length}, with clipUrl: ${withClip.length}`);
    if (withClip.length > 0) console.log(`  Sample clip: ${withClip[0].clipUrl}`);
    
    const flags = await prisma.integrityFlag.findMany({ 
      where: { sessionId },
      include: { evidenceClip: true }
    });
    console.log(`  Integrity flags: ${flags.length}, with evidenceClip: ${flags.filter(f => f.evidenceClip).length}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
