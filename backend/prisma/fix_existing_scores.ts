import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const prisma = new PrismaClient();

async function main() {
  const scores = await prisma.score.findMany();
  let updatedCount = 0;

  for (const sc of scores) {
    if (sc.compositeScore !== null && sc.compositeScore <= 1.0 && sc.compositeScore > 0) {
      const scaled = sc.totalScore && sc.totalScore > 1 ? sc.totalScore : Math.round(sc.compositeScore * 100);
      await prisma.score.update({
        where: { id: sc.id },
        data: { compositeScore: scaled, totalScore: scaled, coreScore: scaled },
      });
      updatedCount++;
    }
  }

  console.log(`Successfully normalized ${updatedCount} existing score records in database.`);
}

main().finally(() => prisma.$disconnect());
