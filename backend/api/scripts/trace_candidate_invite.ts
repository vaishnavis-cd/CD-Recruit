import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function traceCandidateInvite() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log("=== TRACING DRIVE & CANDIDATE INVITE ===");

  const driveId = "03639d97-17d5-4dc9-b685-a0d23e75aee1";
  const candidateEmail = "name2nckasnka@sds.com";

  // 1. Fetch Drive
  const drive = await prisma.drive.findUnique({
    where: { id: driveId },
    include: {
      roleTemplate: true,
      questions: { include: { question: true } },
      invites: true,
    },
  });

  console.log("\n--- 1. DRIVE DETAILS ---");
  if (!drive) {
    console.error(`❌ Drive not found with ID: ${driveId}`);
  } else {
    console.log(`Drive ID: ${drive.id}`);
    console.log(`Drive Name: ${drive.name}`);
    console.log(`Status: ${drive.status}`);
    console.log(`RoleTemplate ID: ${drive.roleTemplateId}`);
    console.log(`RoleTemplate Name: ${drive.roleTemplate?.roleName}`);
    console.log(`RoleTemplate Dept/Level: ${drive.roleTemplate?.department} / ${drive.roleTemplate?.level}`);
    console.log(`Drive Questions Linked Count: ${drive.questions.length}`);
    console.log(`Module Config:`, JSON.stringify(drive.moduleConfig, null, 2));
  }

  // 2. Fetch Candidate & Invite
  const candidate = await prisma.candidate.findFirst({
    where: { email: { equals: candidateEmail, mode: "insensitive" } },
    include: {
      sessions: true,
    },
  });

  console.log("\n--- 2. CANDIDATE & SESSIONS ---");
  if (!candidate) {
    console.log(`Candidate not found by email: ${candidateEmail}`);
  } else {
    console.log(`Candidate ID: ${candidate.id}`);
    console.log(`Candidate Name: ${candidate.name}`);
    console.log(`Candidate Email: ${candidate.email}`);
    console.log(`Sessions Count: ${candidate.sessions.length}`);
    for (const s of candidate.sessions) {
      console.log(`  - Session ${s.id}: status=${s.status}, driveId=${s.driveId}, roleTemplateId=${s.roleTemplateId}`);
    }
  }

  // 3. Fetch Invites
  const invite = await prisma.invite.findFirst({
    where: {
      driveId,
      candidateEmail: { equals: candidateEmail, mode: "insensitive" },
    },
    include: { session: true },
  });

  console.log("\n--- 3. INVITE RECORD ---");
  if (!invite) {
    console.error(`❌ Invite not found for drive ${driveId} and candidate ${candidateEmail}`);
  } else {
    console.log(`Invite ID: ${invite.id}`);
    console.log(`Token: "${invite.token}"`);
    console.log(`Status: ${invite.status}`);
    console.log(`Is Generated: ${invite.isGenerated}`);
    console.log(`Candidate Email: ${invite.candidateEmail}`);
    console.log(`RoleTemplate ID: ${invite.roleTemplateId}`);
    console.log(`Expires At: ${invite.expiresAt}`);
    console.log(`Session ID: ${invite.sessionId}`);
  }

  await prisma.$disconnect();
}

traceCandidateInvite().catch(console.error);
