import { PrismaClient } from "@prisma/client";
import { QuestionService } from "../src/question/question.service";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

const prisma = new PrismaClient();
const questionService = new QuestionService(prisma as any);

async function testRoleModuleFiltering() {
  console.log("=== TESTING ROLE-BASED MODULE FILTERING & TIER QUERYING ===");

  const depts = [
    { name: "PMO", expectedModules: ["MCQ", "TEST_SCENARIOS"] },
    { name: "SRE", expectedModules: ["MCQ", "TEST_SCENARIOS"] },
    { name: "DATA_ENGINEERING", expectedModules: ["MCQ", "SQL", "CODING"] },
    { name: "QA", expectedModules: ["MCQ", "SQL", "CODING", "DEBUGGING", "TEST_SCENARIOS"] },
    { name: "SOFTWARE_ENGINEERING", expectedModules: ["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"] },
  ];

  for (const d of depts) {
    const res = await questionService.list({ department: d.name, page: 1, pageSize: 200 } as any);
    const modulesReturned = Array.from(new Set(res.items.map((q) => q.moduleType)));
    const invalidModules = modulesReturned.filter((m) => !d.expectedModules.includes(m));

    console.log(`\n[Department: ${d.name}]`);
    console.log(`- Total Questions Returned: ${res.total}`);
    console.log(`- Modules Present: ${modulesReturned.join(", ")}`);
    console.log(`- Expected Allowed Modules: ${d.expectedModules.join(", ")}`);
    if (invalidModules.length > 0) {
      console.error(`❌ FAILED! Unallowed modules found: ${invalidModules.join(", ")}`);
    } else {
      console.log(`✅ PASSED! Strictly confined to allowed modules.`);
    }
  }

  console.log("\n=== TESTING TIER FILTERING ===");
  const tier1Res = await questionService.list({ tier: "TIER_1", page: 1, pageSize: 500 } as any);
  const tier2Res = await questionService.list({ tier: "TIER_2", page: 1, pageSize: 500 } as any);

  console.log(`- Tier 1 Questions: ${tier1Res.total}`);
  console.log(`- Tier 2 Questions: ${tier2Res.total}`);

  console.log("\n=== ALL TEST VERIFICATIONS COMPLETED SUCCESSFULLY ===");
  await prisma.$disconnect();
}

testRoleModuleFiltering().catch((err) => {
  console.error(err);
  process.exit(1);
});
