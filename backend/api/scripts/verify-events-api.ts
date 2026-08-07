import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();
const API_URL = "http://localhost:3001/api/v1/proctoring/events";
async function getActiveSessionId() {
  let session = await prisma.session.findFirst({
    where: { status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
  });
  if (!session) {
    const candidate = await prisma.candidate.upsert({
      where: { email: "events-test@example.com" },
      update: {},
      create: { email: "events-test@example.com", name: "Events Candidate" },
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
  const SESSION_ID = await getActiveSessionId();
  console.log(`🚀 Testing POST /api/v1/proctoring/events for session ${SESSION_ID}...`);

  const eventsToTest = [
    { eventType: "FACE_MISSING", severity: "HIGH", modelVersion: "mediapipe-face-v1" },
    { eventType: "LOOKING_AWAY", severity: "MEDIUM", modelVersion: "mediapipe-face-v1" },
    { eventType: "PHONE_DETECTED", severity: "CRITICAL", modelVersion: "object-detector-v1" },
    { eventType: "MULTIPLE_FACES", severity: "HIGH", modelVersion: "mediapipe-face-v1" },
  ];

  for (const item of eventsToTest) {
    const payload = {
      sessionId: SESSION_ID,
      eventType: item.eventType,
      severity: item.severity,
      timestamp: new Date().toISOString(),
      modelVersion: item.modelVersion,
      uploadStatus: "PENDING",
    };

    try {
      console.log(`\nSending ${item.eventType}...`);
      const res = await axios.post(API_URL, payload, {
        headers: { "Content-Type": "application/json" },
      });
      console.log(`STATUS: ${res.status}`);
      console.log(`RESPONSE: ${JSON.stringify(res.data)}`);
    } catch (err: any) {
      console.error(`ERROR sending ${item.eventType}:`, err?.response?.status, err?.response?.data || err.message);
    }
  }

  // Phase 5: Verify Database Rows in PostgreSQL
  console.log("\n==================================================");
  console.log("VERIFYING POSTGRESQL DATABASE ROWS IN ProctoringEvent:");
  const dbEvents = await prisma.proctoringEvent.findMany({
    where: { sessionId: SESSION_ID },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Total events found in DB: ${dbEvents.length}`);
  dbEvents.forEach((ev, idx) => {
    console.log(`[${idx + 1}] ID: ${ev.id} | EventType: ${ev.eventType} | Severity: ${ev.severity} | UploadStatus: ${ev.uploadStatus} | Model: ${ev.modelVersion}`);
  });
  console.log("==================================================\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
