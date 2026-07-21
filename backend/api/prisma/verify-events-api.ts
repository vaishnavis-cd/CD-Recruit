import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_URL = "http://localhost:3001/api/v1/proctoring/events";
const SESSION_ID = "d58c2ef4-e546-4a17-947c-77f47adfc651";

const eventsToTest = [
  { eventType: "FACE_MISSING", severity: "HIGH", modelVersion: "mediapipe-face-v1" },
  { eventType: "LOOKING_AWAY", severity: "MEDIUM", modelVersion: "mediapipe-face-v1" },
  { eventType: "PHONE_DETECTED", severity: "CRITICAL", modelVersion: "object-detector-v1" },
  { eventType: "MULTIPLE_FACES", severity: "HIGH", modelVersion: "mediapipe-face-v1" },
];

async function main() {
  console.log("🚀 Testing POST /api/v1/proctoring/events...");

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
