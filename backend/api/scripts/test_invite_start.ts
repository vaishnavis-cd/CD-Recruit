import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function checkInvitesAndSessions() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log("=== CHECKING INVITES AND SESSIONS IN DATABASE ===");

  const invites = await prisma.invite.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      drive: {
        include: { roleTemplate: true },
      },
      session: {
        include: { roleTemplate: true },
      },
    },
  });

  console.log(`Found ${invites.length} recent invites:`);
  for (const inv of invites) {
    console.log(`\nInvite ID: ${inv.id}`);
    console.log(`- Token: ${inv.token}`);
    console.log(`- Status: ${inv.status}`);
    console.log(`- Candidate Email: ${inv.candidateEmail}`);
    console.log(`- Drive ID: ${inv.driveId} (Drive Name: ${inv.drive?.name})`);
    console.log(`- Drive RoleTemplateId: ${inv.drive?.roleTemplateId}`);
    console.log(`- Invite RoleTemplateId: ${inv.roleTemplateId}`);
    console.log(`- Session ID: ${inv.sessionId}`);
    if (inv.session) {
      console.log(`  - Session Status: ${inv.session.status}`);
      console.log(`  - Session RoleTemplateId: ${inv.session.roleTemplateId}`);
      console.log(`  - Session RoleTemplate Object:`, inv.session.roleTemplate ? "FOUND" : "NULL ❌");
    }
  }

  // Check all sessions in DB
  const sessions = await prisma.session.findMany({
    take: 5,
    include: { roleTemplate: true },
  });

  console.log(`\nFound ${sessions.length} recent sessions in DB:`);
  for (const s of sessions) {
    console.log(`Session ${s.id}: status=${s.status}, roleTemplateId=${s.roleTemplateId}, roleTemplateObject=${s.roleTemplate ? "FOUND" : "NULL ❌"}`);
  }

  await prisma.$disconnect();
}

checkInvitesAndSessions().catch(console.error);
