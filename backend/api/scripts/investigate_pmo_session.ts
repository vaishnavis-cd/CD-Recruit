import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function investigatePmoSession() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log("=== INVESTIGATING PMO ROLE TEMPLATE & CANDIDATE SESSIONS ===");

  // 1. Fetch PMO RoleTemplates
  const pmoTemplates = await prisma.roleTemplate.findMany({
    where: { department: "PMO" },
  });

  console.log("\n--- 1. PMO ROLE TEMPLATES ---");
  for (const t of pmoTemplates) {
    console.log(`ID: ${t.id} | Level: ${t.level} | Name: "${t.roleName}" | Active: ${t.isActive}`);
    console.log(`Weighting Preset:`, JSON.stringify(t.weightingPreset, null, 2));
  }

  // 2. Fetch Latest Drives with PMO template
  const pmoDrives = await prisma.drive.findMany({
    where: { roleTemplate: { department: "PMO" } },
    include: { roleTemplate: true, invites: true },
    take: 5,
  });

  console.log("\n--- 2. LATEST PMO DRIVES ---");
  for (const d of pmoDrives) {
    console.log(`Drive ID: ${d.id} | Name: "${d.name}" | Status: ${d.status}`);
    console.log(`Drive Module Config:`, JSON.stringify(d.moduleConfig, null, 2));
    console.log(`Invites Count: ${d.invites.length}`);
    for (const inv of d.invites) {
      console.log(`  - Candidate: ${inv.candidateEmail} | Session ID: ${inv.sessionId}`);
    }
  }

  // 3. Inspect Latest Session
  const sessions = await prisma.session.findMany({
    take: 5,
  });

  console.log("\n--- 3. LATEST SESSIONS ---");
  for (const s of sessions) {
    const template = await prisma.roleTemplate.findUnique({ where: { id: s.roleTemplateId } });
    const candidate = await prisma.candidate.findUnique({ where: { id: s.candidateId } });
    console.log(`Session ID: ${s.id} | Candidate Email: ${candidate?.email} | RoleTemplate: ${template?.department} / ${template?.level} (${template?.roleName})`);

    const responses = await prisma.moduleResponse.findMany({
      where: { sessionId: s.id },
      include: { question: true },
    });
    console.log(`  Responses Count: ${responses.length}`);
    for (const r of responses) {
      const q = r.question;
      const prompt = typeof q.content === "object" ? (q.content as any)?.prompt || (q.content as any)?.question : String(q.content);
      console.log(`    - QID: ${q.id} | moduleType: ${q.moduleType} | role: ${q.role} | difficulty: ${q.difficulty} | prompt: "${prompt?.slice(0, 70)}..."`);
    }
  }

  // 4. Query imported TEST_SCENARIOS questions in DB
  const testScenarioQuestions = await prisma.question.findMany({
    where: { moduleType: "TEST_SCENARIOS" },
    take: 10,
  });

  console.log(`\n--- 4. TEST_SCENARIOS QUESTIONS IN DB (Total: ${await prisma.question.count({ where: { moduleType: "TEST_SCENARIOS" } })}) ---`);
  for (const q of testScenarioQuestions) {
    console.log(`- QID: ${q.id} | role: ${q.role} | difficulty: ${q.difficulty}`);
    const prompt = typeof q.content === "object" ? (q.content as any)?.prompt || (q.content as any)?.question : String(q.content);
    console.log(`  Prompt: "${prompt?.slice(0, 100)}..."`);
  }

  await prisma.$disconnect();
}

investigatePmoSession().catch(console.error);
