import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SESSION_ID = "d58c2ef4-e546-4a17-947c-77f47adfc651";
const CONSENT_URL = `http://localhost:3001/api/v1/sessions/${SESSION_ID}/consent`;

async function main() {
  console.log("🚀 Testing POST /api/v1/sessions/{sessionId}/consent...");

  try {
    const res = await axios.post(CONSENT_URL, {
      version: "1.0",
      ipAddress: "127.0.0.1",
    });
    console.log(`STATUS: ${res.status}`);
    console.log(`RESPONSE: ${JSON.stringify(res.data)}`);

    // Verify in PostgreSQL
    const dbRecords = await prisma.consentRecord.findMany({
      where: { id: res.data.consentRecordId },
    });

    console.log(`\nVerified PostgreSQL ConsentRecords found: ${dbRecords.length}`);
    if (dbRecords.length > 0) {
      console.log(`ConsentRecord ID: ${dbRecords[0].id} | Version: ${dbRecords[0].version} | ConsentedAt: ${dbRecords[0].consentedAt}`);
    }
  } catch (err: any) {
    console.error("ERROR during consent recording:", err?.response?.status, err?.response?.data || err.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
