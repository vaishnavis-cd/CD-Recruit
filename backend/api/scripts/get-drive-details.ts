import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const drives = await prisma.drive.findMany({
    include: {
      roleTemplate: true
    }
  });

  for (const d of drives) {
    console.log(`Drive ID: ${d.id} | Name: ${d.name}`);
    console.log(` - RoleTemplate: ${d.roleTemplate.roleName} | Level: ${d.roleTemplate.level} | Dept: ${d.roleTemplate.department}`);
    
    const invites = await prisma.invite.findMany({
      where: { driveId: d.id },
      include: {
        candidate: true,
        session: true
      }
    });

    console.log(` - Candidates:`);
    for (const inv of invites) {
      console.log(`   * Candidate: ${inv.candidate.name} | Email: ${inv.candidate.email} | SessionID: ${inv.session?.id ?? "None"}`);
    }
    console.log("-----------------------------------------");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
