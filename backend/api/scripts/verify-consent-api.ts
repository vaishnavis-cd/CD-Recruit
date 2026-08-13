import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();
async function getActiveSessionId() {
  let session = await prisma.session.findFirst({
    where: { status: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
  });
  if (!session) {
    const candidate = await prisma.candidate.upsert({
      where: { email: "consent-test@example.com" },
      update: {},
      create: { email: "consent-test@example.com", name: "Consent Candidate" },
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
  const CONSENT_URL = `http://localhost:3001/api/v1/sessions/${SESSION_ID}/consent`;
  console.log(`🚀 Testing POST /api/v1/sessions/${SESSION_ID}/consent...`);

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
