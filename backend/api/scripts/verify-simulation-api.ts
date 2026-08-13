import axios from "axios";
import { PrismaClient, InviteStatus } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();
const apiBaseUrl = "http://localhost:3001/api/v1";
const jwtSecret = process.env.JWT_SECRET || "dev-jwt-secret-key-12345!!!";

async function runVerification() {
  console.log("🚀 Running Simulation API End-to-End Verification...");
  const timestamp = Date.now();
  const candidateEmail = `sim-candidate-${timestamp}@example.com`;
  const candidateName = `Sim Candidate ${timestamp.toString().slice(-4)}`;

  // 1. Create fresh candidate
  const candidate = await prisma.candidate.create({
    data: { email: candidateEmail, name: candidateName },
  });

  const roleTemplate = await prisma.roleTemplate.findFirst();
  const staff = await prisma.staff.findFirst();
  const drive = await prisma.drive.findFirst();

  if (!roleTemplate || !staff || !drive) {
    throw new Error("Missing seeded dependencies.");
  }

  const inviteId = `invite-sim-${timestamp}`;
  const token = jwt.sign(
    {
      inviteId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      roleTemplateId: roleTemplate.id,
    },
    jwtSecret,
    { expiresIn: "24h" }
  );

  await prisma.invite.create({
    data: {
      id: inviteId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      roleTemplateId: roleTemplate.id,
      driveId: drive.id,
      status: InviteStatus.PENDING,
      token,
      createdById: staff.id,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      scheduledTime: new Date(),
      bufferMinutes: 15,
      graceMinutes: 120,
    },
  });

  console.log(`✔ Created fresh candidate & invite: ${inviteId}`);

  // 2. Redeem invite to start session
  const startRes = await axios.post(`${apiBaseUrl}/sessions/start`, { inviteToken: token });
  console.log(`\n1. POST /sessions/start HTTP ${startRes.status}`);
  const sessionId = startRes.data.sessionId;
  const sessionToken = token;
  console.log(`   Session ID: ${sessionId}`);

  const authHeaders = {
    headers: { Authorization: `Bearer ${sessionToken}` },
  };

  // 3. Begin session
  const beginRes = await axios.post(`${apiBaseUrl}/sessions/${sessionId}/begin`, {}, authHeaders);
  console.log(`\n2. POST /sessions/${sessionId}/begin HTTP ${beginRes.status}`);

  // 4. POST /sessions/:id/simulation/start
  const simStartRes = await axios.post(`${apiBaseUrl}/sessions/${sessionId}/simulation/start`, {}, authHeaders);
  console.log(`\n3. POST /sessions/${sessionId}/simulation/start HTTP ${simStartRes.status}`);
  console.log("   Response Body:", JSON.stringify(simStartRes.data, null, 2));

  // 5. GET /sessions/:id/simulation/current
  const simCurrentRes = await axios.get(`${apiBaseUrl}/sessions/${sessionId}/simulation/current`, authHeaders);
  console.log(`\n4. GET /sessions/${sessionId}/simulation/current HTTP ${simCurrentRes.status}`);
  console.log("   Response Body:", JSON.stringify(simCurrentRes.data, null, 2));

  // 6. POST /sessions/:id/simulation/submit
  const submitPayload = {
    eventId: simCurrentRes.data.event?.id || "1",
    action: "REPLY",
    replyText: "Rolling back the recent deployment to mitigate high CPU usage.",
  };
  const simSubmitRes = await axios.post(`${apiBaseUrl}/sessions/${sessionId}/simulation/submit`, submitPayload, authHeaders);
  console.log(`\n5. POST /sessions/${sessionId}/simulation/submit HTTP ${simSubmitRes.status}`);
  console.log("   Response Body:", JSON.stringify(simSubmitRes.data, null, 2));

  console.log("\n==================================================");
  console.log("✅ ALL SIMULATION ENDPOINTS RETURNED 200 OK!");
  console.log("==================================================");
}

runVerification()
  .catch((err) => {
    console.error("❌ Simulation Verification Failed:", err.response?.status, err.response?.data || err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
