import { PrismaClient, InviteStatus } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET || "dev-jwt-secret-key-12345!!!";

async function main() {
  console.log("--- Testing Session Close Deadline Expiration ---");

  // 1. Generate a new token
  const inviteId = "dev-invite-uuid-close-test-" + Date.now();
  const token = jwt.sign(
    {
      inviteId,
      candidateEmail: "dev-candidate@example.com",
      candidateName: "Dev Candidate",
      roleTemplateId: "05eb554b-b03d-477a-ac16-323e2a7de303",
    },
    jwtSecret
  );

  // Clean up any existing sessions/invites for this candidate to prevent conflicts
  const existingCandidate = await prisma.candidate.findUnique({
    where: { email: "dev-candidate@example.com" },
  });
  if (existingCandidate) {
    const sessionIds = (
      await prisma.session.findMany({
        where: { candidateId: existingCandidate.id },
        select: { id: true },
      })
    ).map((s) => s.id);

    if (sessionIds.length > 0) {
      await prisma.eventLog.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await prisma.session.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }

    await prisma.invite.deleteMany({
      where: { candidateEmail: "dev-candidate@example.com" },
    });
  }

  // Upsert the invite
  const staff = await prisma.staff.findFirst();
  const roleTemplate = await prisma.roleTemplate.findFirst();
  const drive = await prisma.drive.findFirst();
  
  if (!staff || !roleTemplate || !drive) {
    console.error("Missing seeded data. Run seed first.");
    return;
  }

  await prisma.invite.create({
    data: {
      id: inviteId,
      candidateEmail: "dev-candidate@example.com",
      candidateName: "Dev Candidate",
      roleTemplateId: roleTemplate.id,
      driveId: drive.id,
      status: InviteStatus.PENDING,
      token,
      createdById: staff.id,
      expiresAt: new Date(Date.now() + 48 * 3600000),
      isGenerated: true,
    }
  });

  const baseUrl = "http://localhost:3001/api/v1";

  // 2. Start session
  console.log("Starting session...");
  const startRes = await fetch(`${baseUrl}/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteToken: token }),
  });
  const startData: any = await startRes.json();
  console.log("startData:", startData);
  const sessionId = startData.sessionId;
  console.log("Created Session:", sessionId);

  // 3. Begin session
  console.log("Beginning session...");
  await fetch(`${baseUrl}/sessions/${sessionId}/begin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  // 4. Manually set deadlineAt in the past
  console.log("Updating deadline to the past...");
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      deadlineAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
    },
  });

  // 5. Attempt to close session
  console.log("Attempting to close session after deadline...");
  const closeRes = await fetch(`${baseUrl}/sessions/${sessionId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const closeData = await closeRes.json();
  console.log("Close response status:", closeRes.status);
  console.log("Close response data:", closeData);

  if (closeRes.status === 410 && closeData.code === "DEADLINE_PASSED") {
    console.log("✔ SUCCESS: Session close correctly rejected with 410 Gone / DEADLINE_PASSED");
  } else {
    console.error("❌ FAILURE: Expected 410 Gone / DEADLINE_PASSED, but got:", closeRes.status, closeData);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
