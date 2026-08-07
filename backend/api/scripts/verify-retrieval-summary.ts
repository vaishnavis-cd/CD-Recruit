import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function getActiveSessionId() {
  const event = await prisma.proctoringEvent.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (event) return event.sessionId;
  const session = await prisma.session.findFirst({
    where: { status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
  });
  if (!session) throw new Error("No active session found in database.");
  return session.id;
}

async function main() {
  const SESSION_ID = await getActiveSessionId();
  const GET_EVENTS_URL = `http://localhost:3001/api/v1/proctoring/session/${SESSION_ID}`;
  const GET_SUMMARY_URL = `http://localhost:3001/api/v1/proctoring/session/${SESSION_ID}/summary`;
  console.log(`🚀 Phase 7: Testing GET /api/v1/proctoring/session/${SESSION_ID}...`);
  try {
    const res = await axios.get(GET_EVENTS_URL);
    console.log(`STATUS: ${res.status}`);
    console.log(`EVENTS RETRIEVED (${res.data.length} items):`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("ERROR retrieving events:", err?.response?.status, err?.response?.data || err.message);
  }

  console.log("\n🚀 Phase 8: Testing GET /api/v1/proctoring/session/{sessionId}/summary...");
  try {
    const res = await axios.get(GET_SUMMARY_URL);
    console.log(`STATUS: ${res.status}`);
    console.log("SUMMARY RESPONSE:");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("ERROR retrieving summary:", err?.response?.status, err?.response?.data || err.message);
  }
}

main();
