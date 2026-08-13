import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function verifySdeRegression() {
  console.log("==================================================");
  console.log("    VERIFYING SDE REGRESSION TEST");
  console.log("==================================================");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const sdeTemplate = await prisma.roleTemplate.findFirst({
    where: { department: "SOFTWARE_ENGINEERING", isActive: true },
  });

  if (!sdeTemplate) {
    throw new Error("No active SDE RoleTemplate found in DB.");
  }

  const staff = await prisma.staff.findFirst();
  const staffId = staff?.id || (await prisma.staff.create({ data: { name: "Admin", email: `admin_${Date.now()}@example.com`, role: "ADMIN" } as any })).id;

  const drive = await prisma.drive.create({
    data: {
      name: `SDE Regression Drive ${Date.now()}`,
      roleTemplateId: sdeTemplate.id,
      createdById: staffId,
      status: "SCHEDULED" as any,
      moduleConfig: {
        MCQ: { enabled: true, durationMinutes: 15, weight: 15 },
        SQL: { enabled: true, durationMinutes: 15, weight: 15 },
        CODING: { enabled: true, durationMinutes: 30, weight: 20 },
        DEBUGGING: { enabled: true, durationMinutes: 15, weight: 15 },
        AI_PROMPTING: { enabled: true, durationMinutes: 10, weight: 10 },
        SIMULATION: { enabled: true, durationMinutes: 15, weight: 15 },
        TEST_SCENARIOS: { enabled: true, durationMinutes: 10, weight: 10 },
      },
    },
  });

  const candidateEmail = `sde_candidate_${Date.now()}@proctora.io`;
  const candidate = await prisma.candidate.create({
    data: { name: "SDE Test Candidate", email: candidateEmail },
  });

  const token = `inv_sde_${Date.now()}`;
  await prisma.invite.create({
    data: {
      drive: { connect: { id: drive.id } },
      createdBy: { connect: { id: staffId } },
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      roleTemplate: { connect: { id: sdeTemplate.id } },
      token,
      isGenerated: true,
      status: "PENDING" as any,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const url = "http://127.0.0.1:3001/api/v1/sessions/start";
  const res = await axios.post(url, { inviteToken: token });

  const returnedModules = Array.from(new Set(res.data.questions?.map((q: any) => q.moduleType)));
  console.log(`SDE Returned Module Types:`, returnedModules);

  const hasAllSdeModules = ["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"].every(
    (m) => returnedModules.includes(m)
  );

  console.log(`\nSDE regression test result: ${hasAllSdeModules ? "✅ PASSED (All 7 SDE modules preserved)" : "❌ FAILED"}`);

  await prisma.$disconnect();
}

verifySdeRegression().catch(console.error);
