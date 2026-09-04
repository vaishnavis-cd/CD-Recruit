import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const prisma = new PrismaClient();

async function inspect() {
  const templates = await prisma.roleTemplate.findMany({
    include: {
      questions: true,
    }
  });
  console.log(`\n=== Total RoleTemplates in DB: ${templates.length} ===`);
  templates.forEach(t => {
    console.log(`[${t.id}] ${t.roleName} | Dept: ${t.department} | Cat: ${t.category} | Tier: ${t.experienceTier} | Duration: ${t.durationMinutes}m | Assigned Questions: ${t.questions.length}`);
  });

  const totalQuestions = await prisma.question.count();
  console.log(`\n=== Total Questions in DB: ${totalQuestions} ===`);

  const moduleCounts = await prisma.question.groupBy({
    by: ['moduleType'],
    _count: { id: true },
  });
  console.log('\nQuestions by moduleType in DB:');
  moduleCounts.forEach(m => {
    console.log(`  - ${m.moduleType}: ${m._count.id}`);
  });

  // Check proctora_question_bank.json
  const bankPath = path.join(__dirname, "data/proctora_question_bank.json");
  if (fs.existsSync(bankPath)) {
    const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
    console.log(`\nproctora_question_bank.json questions count:`, bank.questions ? bank.questions.length : 'none');
  }

  // Check seniority_l2_l3_question_batch.json
  const batchPath = path.join(__dirname, "../../seniority_l2_l3_question_batch.json");
  if (fs.existsSync(batchPath)) {
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    console.log(`seniority_l2_l3_question_batch.json count:`, batch.length);
  }

  await prisma.$disconnect();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
