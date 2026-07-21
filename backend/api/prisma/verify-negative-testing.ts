import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3001/api/v1/proctoring";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
const INVALID_UUID = "not-a-valid-uuid";

async function getActiveSessionId() {
  let session = await prisma.session.findFirst({
    where: { status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
  });
  if (!session) {
    const candidate = await prisma.candidate.upsert({
      where: { email: "negative-test@example.com" },
      update: {},
      create: { email: "negative-test@example.com", name: "Negative Candidate" },
    });
    const roleTemplate = await prisma.roleTemplate.findFirst();
    if (!roleTemplate) throw new Error("No RoleTemplate found. Please seed DB first.");
    session = await prisma.session.create({
      data: {
        candidateId: candidate.id,
        roleTemplateId: roleTemplate.id,
        cvMode: "FULL",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  }
  return session.id;
}

async function main() {
  const VALID_SESSION_ID = await getActiveSessionId();
  console.log("🚀 Phase 9: Negative Testing Backend API...");

  // 1. Invalid Session ID (Nonexistent UUID) for event creation
  console.log("\n[1] Testing POST /proctoring/events with Nonexistent UUID...");
  try {
    await axios.post(`${BASE_URL}/events`, {
      sessionId: NON_EXISTENT_UUID,
      eventType: "FACE_MISSING",
      severity: "HIGH",
      timestamp: new Date().toISOString(),
    });
    console.error("FAIL: Expected error but request succeeded.");
  } catch (err: any) {
    console.log(`PASS: Received HTTP ${err?.response?.status} (${err?.response?.data?.message})`);
  }
  // 2. Missing required fields (no eventType)
  console.log("\n[2] Testing POST /proctoring/events with missing eventType...");
  try {
    await axios.post(`${BASE_URL}/events`, {
      sessionId: VALID_SESSION_ID,
      severity: "HIGH",
      timestamp: new Date().toISOString(),
    });
    console.error("FAIL: Expected error but request succeeded.");
  } catch (err: any) {
    console.log(`PASS: Received HTTP ${err?.response?.status} (${JSON.stringify(err?.response?.data?.message)})`);
  }

  // 3. Invalid Event Type
  console.log("\n[3] Testing POST /proctoring/events with invalid eventType...");
  try {
    await axios.post(`${BASE_URL}/events`, {
      sessionId: VALID_SESSION_ID,
      eventType: "INVALID_EVENT_TYPE_123",
      severity: "HIGH",
      timestamp: new Date().toISOString(),
    });
    console.error("FAIL: Expected error but request succeeded.");
  } catch (err: any) {
    console.log(`PASS: Received HTTP ${err?.response?.status} (${JSON.stringify(err?.response?.data?.message)})`);
  }

  // 4. Invalid Upload without file
  console.log("\n[4] Testing POST /proctoring/session/{sessionId}/upload with missing file...");
  try {
    await axios.post(`${BASE_URL}/session/${NON_EXISTENT_UUID}/upload`, {});
    console.error("FAIL: Expected error but request succeeded.");
  } catch (err: any) {
    console.log(`PASS: Received HTTP ${err?.response?.status} (${err?.response?.data?.message})`);
  }

  // 5. Malformed UUID parameter
  console.log("\n[5] Testing GET /proctoring/session/{sessionId} with malformed UUID...");
  try {
    await axios.get(`${BASE_URL}/session/${INVALID_UUID}`);
    console.error("FAIL: Expected error but request succeeded.");
  } catch (err: any) {
    console.log(`PASS: Received HTTP ${err?.response?.status} (${err?.response?.data?.message})`);
  }
}

main();
