/**
 * backend/prisma/scripts/replace-question-bank.ts
 *
 * Atomic, hassle-free Question Bank and Role Templates replacement tool.
 * Imports new questions, cleans old questions, and auto-wires all 32 Role Templates
 * without corrupting audit logs, candidate sessions, or existing drives.
 *
 * Usage:
 *   # Dry-run inspection (no database changes):
 *   npx tsx backend/prisma/scripts/replace-question-bank.ts --dry-run
 *
 *   # Live execution from default data folder:
 *   npx tsx backend/prisma/scripts/replace-question-bank.ts
 *
 *   # Live execution from a custom questions directory:
 *   npx tsx backend/prisma/scripts/replace-question-bank.ts --dir ./production-questions/
 */

import {
  PrismaClient,
  ModuleType,
  Department,
} from "@prisma/client";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  VALID_MODULE_TYPES,
  VALID_DIFFICULTIES,
  DEPARTMENTS,
  TIERS,
  validateSingleQuestion,
} from "./validate-question-bank";

// Standardize .env loading
dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../api/.env") });

const prisma = new PrismaClient();

const DEPT_NAMES: Record<string, string> = {
  SOFTWARE_ENGINEERING: "Software Engineering",
  DATA_ENGINEERING: "Data Engineering",
  PMO: "Project Management Office",
  QA: "Quality Assurance",
  SYSOPS: "System Operations",
  ITOPS: "IT Operations",
  SECOPS: "Security Operations",
  SRE: "Site Reliability Engineering",
};

function normalizeDepartment(deptStr: string | undefined): Department {
  if (!deptStr) return "SOFTWARE_ENGINEERING";
  const upper = deptStr.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "SDE" || upper === "SOFTWARE" || upper === "DEV") return "SOFTWARE_ENGINEERING";
  if (upper === "DATA" || upper === "DE" || upper === "DATA_ENGINEERING") return "DATA_ENGINEERING";
  if (upper === "QA" || upper === "TESTING") return "QA";
  if (upper === "SRE") return "SRE";
  if (upper === "SYSOPS" || upper === "SYS_OPS") return "SYSOPS";
  if (upper === "ITOPS" || upper === "IT_OPS") return "ITOPS";
  if (upper === "SECOPS" || upper === "SEC_OPS" || upper === "SECURITY") return "SECOPS";
  if (upper === "PMO" || upper === "PROJECT_MANAGEMENT") return "PMO";
  if (upper in DEPT_NAMES) return upper as Department;
  return "SOFTWARE_ENGINEERING";
}

function normalizeModuleType(modStr: string | undefined): ModuleType {
  if (!modStr) return "MCQ";
  const upper = modStr.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "CONTEXT_SIMULATION" || upper === "SIMULATION") return "SIMULATION";
  if (upper === "AI" || upper === "AI_PROMPTING" || upper === "AIPROMPTING") return "AI_PROMPTING";
  if (upper === "DEBUG" || upper === "DEBUGGING") return "DEBUGGING";
  if (upper === "CODE" || upper === "CODING" || upper === "DSA") return "CODING";
  if (upper === "SQL") return "SQL";
  if (upper === "NOSQL") return "NOSQL";
  if (upper === "TEST_SCENARIOS" || upper === "TESTSCENARIOS") return "TEST_SCENARIOS";
  if (upper in ModuleType) return upper as ModuleType;
  return "MCQ";
}

function determineSeniorityTags(difficulty: string, explicitSeniority?: string[]): string[] {
  if (explicitSeniority && explicitSeniority.length > 0) {
    return explicitSeniority.map((s) => s.toLowerCase());
  }
  const diff = (difficulty || "medium").toLowerCase();
  if (diff === "easy") return ["fresher", "l1"];
  if (diff === "medium") return ["l1", "l2"];
  if (diff === "hard") return ["l2", "l3"];
  return ["fresher", "l1", "l2", "l3"];
}

function getTargetLevelFromSeniority(tags: string[]): string {
  if (tags.includes("l3")) return "11-15";
  if (tags.includes("l2")) return "6-10";
  if (tags.includes("l1")) return "2-5";
  return "0-1";
}

export async function replaceQuestionBank(options: {
  sourceDir?: string;
  dryRun?: boolean;
  keepDrives?: boolean;
}) {
  const isDryRun = !!options.dryRun;
  const keepDrives = options.keepDrives !== false; // default true
  const dataDir = options.sourceDir ? path.resolve(options.sourceDir) : path.join(__dirname, "../data");

  console.log("\n=======================================================");
  console.log(`🚀 CD-RECRUIT QUESTION BANK CUTOVER & REPLACEMENT`);
  console.log(`Mode: ${isDryRun ? "🔍 DRY-RUN (Preview Only, No DB writes)" : "⚡ LIVE PRODUCTION UPDATE"}`);
  console.log(`Source Folder: ${dataDir}`);
  console.log(`Preserve Drive-Pinned Questions: ${keepDrives ? "YES" : "NO"}`);
  console.log("=======================================================\n");

  if (!fs.existsSync(dataDir)) {
    throw new Error(`Source directory does not exist: ${dataDir}`);
  }

  // 1. Gather all questions from source directory
  const allQuestionItems: any[] = [];
  const entries = fs.readdirSync(dataDir);

  for (const entry of entries) {
    const fullPath = path.join(dataDir, entry);
    if (!fs.statSync(fullPath).isFile() || !entry.endsWith(".json")) continue;

    const rawData = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const items = Array.isArray(rawData) ? rawData : Array.isArray(rawData.questions) ? rawData.questions : [rawData];

    for (const item of items) {
      const rawMod = item.moduleType || item.module || "";
      const modType = normalizeModuleType(rawMod);

      // In legacy proctora_question_bank.json, only ingest MCQs
      if (entry === "proctora_question_bank.json" && modType !== "MCQ") {
        continue;
      }

      const diff = (item.difficulty || item.content?.difficulty || "medium").toLowerCase();
      const seniority = determineSeniorityTags(diff, item.seniority);
      const targetLevel = item.targetLevel || getTargetLevelFromSeniority(seniority);
      const dept = normalizeDepartment(item.department || item.dept);

      const cleanTopic = (item.category || item.topic || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const tags = Array.from(
        new Set([
          dept.toLowerCase(),
          modType.toLowerCase(),
          ...seniority,
          ...(cleanTopic ? [cleanTopic] : []),
        ])
      );

      const content = item.content || item;

      // Normalize MCQ
      if (modType === "MCQ") {
        const hasOptions = Array.isArray(content.options) && content.options.length > 0;
        const correctAns =
          content.correctAnswer ||
          (hasOptions && content.correctIndex !== undefined ? content.options[content.correctIndex] : "") ||
          (hasOptions ? content.options[0] : "");
        content.correctAnswer = correctAns;
      }

      // Normalize Coding / Debugging testCases & starterCode
      if (modType === "CODING" || modType === "DEBUGGING") {
        if (!content.visibleTestCases && content.testCases) {
          content.visibleTestCases = content.testCases.filter((tc: any) => !tc.isHidden);
        }
        if (!content.hiddenTestCases && content.testCases) {
          content.hiddenTestCases = content.testCases.filter((tc: any) => tc.isHidden);
        }
        if (!content.testCases && (content.visibleTestCases || content.hiddenTestCases)) {
          content.testCases = [
            ...(content.visibleTestCases || []).map((tc: any) => ({ ...tc, isHidden: false })),
            ...(content.hiddenTestCases || []).map((tc: any) => ({ ...tc, isHidden: true })),
          ];
        }

        const fnName = content.functionName || "solution";
        const existingStarters = content.starterCode || {};
        content.starterCode = {
          javascript:
            existingStarters.javascript ||
            `const fs = require('fs');\n\nfunction ${fnName}(input) {\n  // TODO: Implement solution\n  return input;\n}\n\nconst raw = fs.readFileSync(0, 'utf-8').trim();\nif (raw) {\n  console.log(${fnName}(raw));\n}\n`,
          python:
            existingStarters.python ||
            `import sys\n\ndef ${fnName}(data):\n    # TODO: Implement solution\n    return data\n\nif __name__ == '__main__':\n    for line in sys.stdin:\n        if line.strip():\n            print(${fnName}(line.strip()))\n`,
          java:
            existingStarters.java ||
            `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static String ${fnName}(String input) {\n        // TODO: Implement solution\n        return input;\n    }\n\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line;\n        while ((line = br.readLine()) != null) {\n            if (line.trim().isEmpty()) continue;\n            System.out.println(${fnName}(line.trim()));\n        }\n    }\n}\n`,
          cpp:
            existingStarters.cpp ||
            `#include <iostream>\n#include <string>\nusing namespace std;\n\nstring ${fnName}(const string& input) {\n    // TODO: Implement solution\n    return input;\n}\n\nint main() {\n    string line;\n    while (getline(cin, line)) {\n        if (line.empty()) continue;\n        cout << ${fnName}(line) << endl;\n    }\n    return 0;\n}\n`,
        };
      }

      const scoringConfig = item.scoringConfig || {
        correctIndex:
          content.options && content.correctAnswer
            ? content.options.indexOf(content.correctAnswer)
            : content.correctIndex || 0,
        points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1,
      };

      allQuestionItems.push({
        moduleType: modType,
        department: dept,
        difficulty: diff,
        tags,
        targetLevel,
        content,
        scoringConfig,
        role: DEPT_NAMES[dept] || "General",
      });
    }
  }

  // Also include NoSQL questions if available in data/nosql.ts
  const nosqlPath = path.join(dataDir, "nosql.ts");
  if (fs.existsSync(nosqlPath)) {
    try {
      const { nosqlQuestions } = require(nosqlPath);
      if (Array.isArray(nosqlQuestions)) {
        for (const nq of nosqlQuestions) {
          const diff = (nq.difficulty || "medium").toLowerCase();
          const seniority = determineSeniorityTags(diff);
          allQuestionItems.push({
            moduleType: "NOSQL",
            department: "SOFTWARE_ENGINEERING",
            difficulty: diff,
            tags: Array.from(new Set(["software_engineering", "data_engineering", "nosql", ...seniority, "mongodb"])),
            targetLevel: seniority.includes("l2") ? "6-10" : "2-5",
            content: nq.content,
            scoringConfig: { points: 2 },
            role: "Software Engineering",
          });
        }
      }
    } catch {
      // Ignored if typescript module cannot be directly required
    }
  }

  console.log(`📦 Loaded and prepared ${allQuestionItems.length} candidate questions.`);

  if (isDryRun) {
    console.log("\n[DRY-RUN] No changes were written to the database. All questions parsed successfully.");
    return;
  }

  // 2. Perform Atomic Database Replacement
  await prisma.$transaction(async (tx) => {
    console.log("  🧹 Detaching existing RoleTemplateQuestion links...");
    await tx.roleTemplateQuestion.deleteMany({});

    // Keep drive-pinned questions if keepDrives is enabled
    let deletedCount = 0;
    if (keepDrives) {
      const driveQuestions = await tx.driveQuestion.findMany({ select: { questionId: true } });
      const driveQuestionIds = driveQuestions.map((dq) => dq.questionId);

      const deleteRes = await tx.question.deleteMany({
        where: {
          id: { notIn: driveQuestionIds },
        },
      });
      deletedCount = deleteRes.count;
      console.log(`  🗑 Deleted ${deletedCount} unpinned questions (preserved ${driveQuestionIds.length} drive questions).`);
    } else {
      await tx.driveQuestion.deleteMany({});
      const deleteRes = await tx.question.deleteMany({});
      deletedCount = deleteRes.count;
      console.log(`  🗑 Deleted all ${deletedCount} existing questions.`);
    }

    // Bulk create questions
    console.log(`  📥 Ingesting ${allQuestionItems.length} questions into Question repository...`);
    const createdQuestions: any[] = [];

    // Use chunks to prevent parameter limits
    const CHUNK_SIZE = 50;
    for (let i = 0; i < allQuestionItems.length; i += CHUNK_SIZE) {
      const chunk = allQuestionItems.slice(i, i + CHUNK_SIZE);
      for (const q of chunk) {
        const created = await tx.question.create({
          data: {
            moduleType: q.moduleType,
            content: q.content,
            scoringConfig: q.scoringConfig,
            difficulty: q.difficulty,
            tags: q.tags,
            targetLevel: q.targetLevel,
            status: "PUBLISHED",
            role: q.role,
          },
        });
        createdQuestions.push({ ...created, department: q.department });
      }
    }
    console.log(`  ✔ Successfully ingested ${createdQuestions.length} questions.`);

    // Auto-wire all 32 Role Templates
    console.log("  🔗 Auto-wiring questions to all 32 Role Templates...");
    const roleTemplates = await tx.roleTemplate.findMany();
    let templateQuestionsLinked = 0;

    for (const rt of roleTemplates) {
      const dept = rt.department;
      const deptTag = dept.toLowerCase();
      const tierTag = rt.experienceTier === "0-1" ? "fresher" : rt.experienceTier === "2-5" ? "l1" : rt.experienceTier === "6-10" ? "l2" : "l3";

      // 1. MCQ (8-10 questions)
      let deptMcqs = createdQuestions.filter(
        (q) => q.moduleType === "MCQ" && (q.tags.includes(deptTag) || q.department === dept) && q.tags.includes(tierTag)
      );
      if (deptMcqs.length < 8) {
        const fallback = createdQuestions.filter((q) => q.moduleType === "MCQ" && q.tags.includes(tierTag));
        deptMcqs = Array.from(new Set([...deptMcqs, ...fallback]));
      }
      const selectedMcqs = deptMcqs.slice(0, 8);

      // 2. CODING (2 questions)
      let codings = createdQuestions.filter((q) => q.moduleType === "CODING" && q.tags.includes(tierTag));
      if (codings.length < 2) codings = createdQuestions.filter((q) => q.moduleType === "CODING");
      const selectedCodings = codings.slice(0, 2);

      // 3. SQL (2 questions)
      let sqls = createdQuestions.filter((q) => q.moduleType === "SQL" && q.tags.includes(tierTag));
      if (sqls.length < 2) sqls = createdQuestions.filter((q) => q.moduleType === "SQL");
      const selectedSqls = sqls.slice(0, 2);

      // 4. DEBUGGING (1 question)
      let debugs = createdQuestions.filter((q) => q.moduleType === "DEBUGGING" && q.tags.includes(tierTag));
      if (debugs.length === 0) debugs = createdQuestions.filter((q) => q.moduleType === "DEBUGGING");
      const selectedDebugs = debugs.slice(0, 1);

      // 5. NOSQL (1 question)
      const nosqls = createdQuestions.filter((q) => q.moduleType === "NOSQL");
      const selectedNosqls = nosqls.slice(0, 1);

      // 6. AI PROMPTING (1 question)
      const promptings = createdQuestions.filter((q) => q.moduleType === "AI_PROMPTING");
      const selectedPromptings = promptings.slice(0, 1);

      // 7. SIMULATION (1 question)
      const simulations = createdQuestions.filter((q) => q.moduleType === "SIMULATION");
      const selectedSimulations = simulations.slice(0, 1);

      const templatePool = [
        ...selectedMcqs,
        ...selectedCodings,
        ...selectedSqls,
        ...selectedDebugs,
        ...selectedNosqls,
        ...selectedPromptings,
        ...selectedSimulations,
      ];

      for (let order = 0; order < templatePool.length; order++) {
        const q = templatePool[order];
        await tx.roleTemplateQuestion.create({
          data: {
            roleTemplateId: rt.id,
            questionId: q.id,
            moduleType: q.moduleType,
            orderIndex: order + 1,
            pointShare: 1.0,
          },
        });
        templateQuestionsLinked++;
      }
    }

    console.log(`  ✔ Linked ${templateQuestionsLinked} questions across ${roleTemplates.length} Role Templates.`);
  }, { timeout: 60000 });

  console.log("\n=======================================================");
  console.log("🎉 QUESTION BANK REPLACEMENT COMPLETED SUCCESSFULLY!");
  console.log("=======================================================\n");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const keepDrives = !args.includes("--force-all");
  let sourceDir: string | undefined;

  const dirIdx = args.indexOf("--dir");
  if (dirIdx >= 0 && args[dirIdx + 1]) {
    sourceDir = args[dirIdx + 1];
  }

  replaceQuestionBank({ sourceDir, dryRun: isDryRun, keepDrives })
    .catch((err) => {
      console.error("\n❌ Question Bank Replacement failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
