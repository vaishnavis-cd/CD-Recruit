import axios from "axios";
import FormData from "form-data";
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
      where: { email: "upload-test@example.com" },
      update: {},
      create: { email: "upload-test@example.com", name: "Upload Candidate" },
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
  const sessionId = await getActiveSessionId();
  const API_URL = `http://localhost:3001/api/v1/proctoring/session/${sessionId}/upload`;
  console.log(`🚀 Testing POST /api/v1/proctoring/session/${sessionId}/upload...`);

  // Generate 1KB dummy WebM buffer
  const sampleBuffer = Buffer.alloc(1024, "mock-webm-video-content");

  const form = new FormData();
  form.append("file", sampleBuffer, {
    filename: "phone_detected_1784538900.webm",
    contentType: "video/webm",
  });

  try {
    const res = await axios.post(API_URL, form, {
      headers: form.getHeaders(),
    });
    console.log(`STATUS: ${res.status}`);
    console.log(`RESPONSE: ${JSON.stringify(res.data)}`);
  } catch (err: any) {
    console.error("ERROR during file upload:", err?.response?.status, err?.response?.data || err.message);
  }
}

main();
