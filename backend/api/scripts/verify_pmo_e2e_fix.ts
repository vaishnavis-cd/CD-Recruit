import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function verifyPmoE2eFix() {
  console.log("==================================================");
  console.log("   VERIFYING PMO ASSESSMENT END-TO-END FIX");
  console.log("==================================================");

  const prisma = new PrismaClient();
  await prisma.$connect();

  // 1. Get active PMO RoleTemplate
  const pmoTemplate = await prisma.roleTemplate.findFirst({
    where: { department: "PMO", isActive: true },
  });

  if (!pmoTemplate) {
    throw new Error("No active PMO RoleTemplate found in DB.");
  }

  console.log(`Using RoleTemplate: "${pmoTemplate.roleName}" (${pmoTemplate.id})`);
  console.log(`Weighting Preset:`, JSON.stringify(pmoTemplate.weightingPreset));

  // 2. Get Staff
  const staff = await prisma.staff.findFirst();
  const staffId = staff?.id || (await prisma.staff.create({ data: { name: "Admin", email: `admin_${Date.now()}@example.com`, role: "ADMIN" } as any })).id;

  // 3. Create fresh Drive for PMO
  const drive = await prisma.drive.create({
    data: {
      name: `PMO Verification Drive ${Date.now()}`,
      roleTemplateId: pmoTemplate.id,
      createdById: staffId,
      status: "SCHEDULED" as any,
      moduleConfig: {
        MCQ: { enabled: true, durationMinutes: 15, weight: 50 },
        TEST_SCENARIOS: { enabled: true, durationMinutes: 15, weight: 50 },
        SQL: { enabled: false },
        CODING: { enabled: false },
        DEBUGGING: { enabled: false },
        AI_PROMPTING: { enabled: false },
        SIMULATION: { enabled: false },
      },
    },
  });

  console.log(`\nCreated Drive ID: ${drive.id}`);
  console.log(`Drive Module Config:`, JSON.stringify(drive.moduleConfig, null, 2));

  // 4. Create Candidate & Invite
  const candidateEmail = `pmo_candidate_${Date.now()}@proctora.io`;
  const candidate = await prisma.candidate.create({
    data: { name: "PMO Test Candidate", email: candidateEmail },
  });

  const token = `inv_pmo_${Date.now()}`;
  await prisma.invite.create({
    data: {
      drive: { connect: { id: drive.id } },
      createdBy: { connect: { id: staffId } },
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      roleTemplate: { connect: { id: pmoTemplate.id } },
      token,
      isGenerated: true,
      status: "PENDING" as any,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`Created Candidate Invite Token: "${token}"`);

  // 5. Invoke live backend /sessions/start endpoint
  const url = "http://127.0.0.1:3001/api/v1/sessions/start";
  console.log(`\nInvoking API: POST ${url}...`);

  const res = await axios.post(url, { inviteToken: token });
  console.log(`✅ API /sessions/start returned HTTP ${res.status}`);
  console.log(`- Session ID: ${res.data.sessionId}`);
  console.log(`- Total Questions Received: ${res.data.questions?.length}`);

  const returnedModules = Array.from(new Set(res.data.questions?.map((q: any) => q.moduleType)));
  console.log(`\n--- MODULES RETURNED IN CANDIDATE PAYLOAD ---`);
  console.log(`Returned Module Types:`, returnedModules);

  console.log("\n--- DETAILED QUESTION BREAKDOWN ---");
  for (const q of res.data.questions) {
    const prompt = typeof q.content === "object" ? q.content.prompt || q.content.question : String(q.content);
    console.log(`- [${q.moduleType}] QID: ${q.questionId} | Difficulty: ${q.difficulty} | Prompt: "${prompt?.slice(0, 80)}..."`);
  }

  // 6. Assertions
  const hasAiPrompting = returnedModules.includes("AI_PROMPTING");
  const nonPmoModules = returnedModules.filter((m: any) => !["MCQ", "TEST_SCENARIOS"].includes(m));

  console.log("\n--- VERIFICATION CHECKS ---");
  console.log(`1. AI_PROMPTING absent in PMO payload? ${!hasAiPrompting ? "✅ YES (PASSED)" : "❌ NO (FAILED)"}`);
  console.log(`2. ONLY MCQ and TEST_SCENARIOS returned? ${nonPmoModules.length === 0 ? "✅ YES (PASSED)" : `❌ NO (FAILED - found ${nonPmoModules.join(", ")})`}`);

  await prisma.$disconnect();
}

verifyPmoE2eFix().catch(console.error);
