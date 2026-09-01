import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const prisma = new PrismaClient();

async function main() {
  const eventsWithClip = await prisma.proctoringEvent.findMany({
    where: { clipUrl: { not: null } },
    take: 10,
    orderBy: { timestamp: "desc" },
  });

  console.log(`Proctoring Events with clipUrl in DB: ${eventsWithClip.length}`);
  for (const e of eventsWithClip) {
    console.log(`- ID: ${e.id}, EventType: ${e.eventType}, clipUrl: ${e.clipUrl}, SessionId: ${e.sessionId}`);
  }

  const clips = await prisma.evidenceClip.findMany({
    take: 10,
  });
  console.log(`EvidenceClips in DB: ${clips.length}`);
  for (const c of clips) {
    console.log(`- Clip ID: ${c.id}, storageRef: ${c.storageRef}`);
  }
}

main().finally(() => prisma.$disconnect());
