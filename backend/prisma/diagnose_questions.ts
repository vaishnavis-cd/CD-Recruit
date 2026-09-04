import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const prisma = new PrismaClient();

async function main() {
  const allQuestions = await prisma.question.findMany();
  console.log(`Total questions in DB: ${allQuestions.length}`);

  const byModule: Record<string, typeof allQuestions> = {};
  for (const q of allQuestions) {
    if (!byModule[q.moduleType]) byModule[q.moduleType] = [];
    byModule[q.moduleType].push(q);
  }

  for (const [mod, list] of Object.entries(byModule)) {
    console.log(`\n=== Module: ${mod} (${list.length} questions) ===`);
    let missingAnswer = 0;
    let missingTestCases = 0;
    let missingHiddenTestCases = 0;
    let missingStarterCode = 0;
    let missingSchema = 0;

    for (const q of list) {
      const content: any = q.content || {};
      const scoring: any = q.scoringConfig || {};

      if (mod === "MCQ") {
        const hasOptions = Array.isArray(content.options) && content.options.length > 0;
        const hasAns = Boolean(content.correctAnswer || scoring.correctIndex !== undefined || scoring.correctOption);
        if (!hasOptions || !hasAns) {
          missingAnswer++;
          if (missingAnswer <= 3) {
            console.log(`    [MCQ sample missing]: id=${q.id}, hasOptions=${hasOptions}, hasAns=${hasAns}, contentKeys=${Object.keys(content).join(",")}`);
          }
        }
      } else if (mod === "CODING") {
        const hasStarter = content.starterCode && Object.keys(content.starterCode).length > 0;
        const sampleTests = content.visibleTestCases || (content.testCases && content.testCases.filter((t: any) => !t.isHidden));
        const hiddenTests = content.hiddenTestCases || (content.testCases && content.testCases.filter((t: any) => t.isHidden));

        if (!hasStarter) missingStarterCode++;
        if (!sampleTests || sampleTests.length === 0) missingTestCases++;
        if (!hiddenTests || hiddenTests.length === 0) missingHiddenTestCases++;

        if (!hasStarter || !sampleTests || sampleTests.length === 0) {
          if (missingStarterCode <= 3) {
            console.log(`    [CODING sample missing]: id=${q.id}, prompt=${content.prompt?.slice(0, 50)}, keys=${Object.keys(content).join(",")}`);
          }
        }
      } else if (mod === "DEBUGGING") {
        const hasCode = content.starterCode || content.buggyCode || content.code;
        const hasTests = content.testCases || content.regressionTests || content.visibleTestCases;
        if (!hasCode) missingStarterCode++;
        if (!hasTests || hasTests.length === 0) missingTestCases++;
        if (!hasCode) {
          if (missingStarterCode <= 3) {
            console.log(`    [DEBUGGING sample missing]: id=${q.id}, keys=${Object.keys(content).join(",")}`);
          }
        }
      } else if (mod === "SQL") {
        const hasSchema = Boolean(content.schema);
        const hasSeed = Boolean(content.seedData || content.seed);
        if (!hasSchema || !hasSeed) {
          missingSchema++;
          if (missingSchema <= 3) {
            console.log(`    [SQL sample missing]: id=${q.id}, keys=${Object.keys(content).join(",")}`);
          }
        }
      }
    }

    if (mod === "MCQ") console.log(`  Missing Options/Answer: ${missingAnswer}`);
    if (mod === "CODING") {
      console.log(`  Missing Starter Code: ${missingStarterCode}`);
      console.log(`  Missing Sample Test Cases: ${missingTestCases}`);
      console.log(`  Missing Hidden Test Cases: ${missingHiddenTestCases}`);
    }
    if (mod === "DEBUGGING") {
      console.log(`  Missing Starter/Buggy Code: ${missingStarterCode}`);
      console.log(`  Missing Test Cases: ${missingTestCases}`);
    }
    if (mod === "SQL") {
      console.log(`  Missing Schema/Seed: ${missingSchema}`);
    }

    // Print 1 sample question structure
    if (list.length > 0) {
      const sample = list[0];
      console.log(`  Sample ID: ${sample.id}`);
      console.log(`  Sample Content Keys: ${Object.keys(sample.content as any || {}).join(", ")}`);
      console.log(`  Sample Scoring: ${JSON.stringify(sample.scoringConfig)}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
