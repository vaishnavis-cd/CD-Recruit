import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const sessions = await prisma.session.findMany({
    where: {
      candidate: {
        name: {
          contains: "ake",
          mode: "insensitive"
        }
      }
    },
    include: {
      candidate: true,
      roleTemplate: true,
      drive: true,
    }
  });

  console.log(`Found sessions matching candidate name "ake": ${sessions.length}`);
  for (const s of sessions) {
    console.log(`Session ID: ${s.id}`);
    console.log(` - Candidate: ${s.candidate.name} (${s.candidate.email})`);
    console.log(` - RoleTemplate: ${s.roleTemplate.roleName} | Level: ${s.roleTemplate.level} | Dept: ${s.roleTemplate.department}`);
    console.log(` - Drive: ${s.drive?.name ?? "No Drive"}`);
    console.log("-----------------------------------------");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
