import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function checkPmoTemplateQuestions() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log("=== CHECKING PMO ROLE TEMPLATE QUESTIONS IN DB ===");

  const pmoTemplate = await prisma.roleTemplate.findFirst({
    where: { department: "PMO" },
    include: {
      questions: {
        include: { question: true },
        orderBy: { orderIndex: "asc" },
      },
    },
  });

  if (!pmoTemplate) {
    console.error("❌ No PMO RoleTemplate found!");
    await prisma.$disconnect();
    return;
  }

  console.log(`RoleTemplate ID: ${pmoTemplate.id}`);
  console.log(`RoleName: "${pmoTemplate.roleName}"`);
  console.log(`Department: ${pmoTemplate.department} | Level: ${pmoTemplate.level}`);
  console.log(`Weighting Preset:`, JSON.stringify(pmoTemplate.weightingPreset, null, 2));
  console.log(`RoleTemplateQuestions Count: ${pmoTemplate.questions.length}`);

  for (const rtq of pmoTemplate.questions) {
    const q = rtq.question;
    const prompt = typeof q.content === "object" ? (q.content as any)?.prompt || (q.content as any)?.question : String(q.content);
    console.log(`- RTQ ID: ${rtq.id}`);
    console.log(`  RTQ moduleType: ${rtq.moduleType}`);
    console.log(`  Question ID: ${q.id}`);
    console.log(`  Question moduleType in Question table: ${q.moduleType}`);
    console.log(`  Question Role: ${q.role} | Difficulty: ${q.difficulty}`);
    console.log(`  Prompt: "${prompt?.slice(0, 100)}..."`);
  }

  await prisma.$disconnect();
}

checkPmoTemplateQuestions().catch(console.error);
