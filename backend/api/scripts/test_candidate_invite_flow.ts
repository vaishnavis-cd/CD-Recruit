import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testCandidateInviteFlow() {
  console.log("=== TESTING EXACT CANDIDATE INVITE FLOW FOR inv_7996f94f2c2c3877d318bb85 ===");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const inviteToken = "inv_7996f94f2c2c3877d318bb85";

  // Step 1: Check token in DB
  const invite = await prisma.invite.findFirst({
    where: { token: inviteToken },
    include: { drive: { include: { roleTemplate: true } } },
  });

  console.log("\n[1] DB INVITE LOOKUP:");
  if (!invite) {
    console.error(`❌ Token "${inviteToken}" not found in DB.`);
    await prisma.$disconnect();
    return;
  }
  console.log(`- Invite Token: ${invite.token}`);
  console.log(`- Candidate Email: ${invite.candidateEmail}`);
  console.log(`- Drive ID: ${invite.driveId}`);
  console.log(`- Drive Status: ${invite.drive?.status}`);
  console.log(`- RoleTemplate ID: ${invite.roleTemplateId || invite.drive?.roleTemplateId}`);
  console.log(`- RoleTemplate Dept/Level: ${invite.drive?.roleTemplate?.department} / ${invite.drive?.roleTemplate?.level}`);

  // Step 2: Call backend /sessions/start API
  const url = "http://127.0.0.1:3001/api/v1/sessions/start";
  console.log(`\n[2] CALLING BACKEND API: POST ${url}`);
  console.log(`Request Body:`, { inviteToken });

  try {
    const res = await axios.post(url, { inviteToken });
    console.log(`\n✅ HTTP ${res.status} SUCCESS:`);
    console.log(`- Session ID:`, res.data.sessionId);
    console.log(`- Questions Count:`, res.data.questions?.length);
    console.log(`- Questions Preview:`, res.data.questions?.slice(0, 3));
  } catch (err: any) {
    console.error(`\n❌ HTTP FAILED:`);
    console.error(`- Status:`, err.response?.status);
    console.error(`- Status Text:`, err.response?.statusText);
    console.error(`- Response Body:`, JSON.stringify(err.response?.data, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

testCandidateInviteFlow();
