import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany({
    include: {
      score: true,
      candidate: true,
      drive: true,
      moduleResponses: true,
    },
    orderBy: { startedAt: "desc" },
    take: 5,
  });

  for (const s of sessions) {
    console.log("-----------------------------------------");
    console.log(`Session ID: ${s.id}, Candidate: ${s.candidate?.email}, Status: ${s.status}`);
    console.log("Drive Name:", s.drive?.name);
    console.log("Drive moduleConfig:", JSON.stringify(s.drive?.moduleConfig, null, 2));
    console.log("Score Record:", JSON.stringify(s.score, null, 2));
    console.log("Module Responses count:", s.moduleResponses.length);
  }
}

main().finally(() => prisma.$disconnect());
