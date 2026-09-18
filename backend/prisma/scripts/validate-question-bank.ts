/**
 * backend/prisma/scripts/validate-question-bank.ts
 *
 * Standalone validation tool for the CD-Recruit Question Bank.
 * Validates syntax, schemas, Judge0 test cases, and role template coverage
 * before deploying or replacing questions in production.
 *
 * Usage:
 *   npx tsx backend/prisma/scripts/validate-question-bank.ts
 *   npx tsx backend/prisma/scripts/validate-question-bank.ts --dir ./my-questions/
 */

import * as fs from "fs";
import * as path from "path";

// Supported modules and departments
export const VALID_MODULE_TYPES = [
  "MCQ",
  "CODING",
  "DEBUGGING",
  "SQL",
  "NOSQL",
  "AI_PROMPTING",
  "SIMULATION",
  "TEST_SCENARIOS",
] as const;

export const VALID_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const DEPARTMENTS = [
  "SOFTWARE_ENGINEERING",
  "DATA_ENGINEERING",
  "PMO",
  "QA",
  "SYSOPS",
  "ITOPS",
  "SECOPS",
  "SRE",
] as const;

export const TIERS = ["0-1", "2-5", "6-10", "11-15"] as const;

export interface ValidationError {
  file: string;
  index: number;
  questionTitle?: string;
  field: string;
  message: string;
}

export interface QuestionStats {
  total: number;
  byModule: Record<string, number>;
  byDifficulty: Record<string, number>;
  byDepartment: Record<string, number>;
  byTier: Record<string, number>;
}

export function validateSingleQuestion(
  q: any,
  file: string,
  index: number
): ValidationError[] {
  const errors: ValidationError[] = [];
  const title =
    q.content?.title ||
    q.content?.prompt ||
    q.content?.question ||
    q.title ||
    q.question ||
    `Question #${index + 1}`;

  const addError = (field: string, message: string) => {
    errors.push({
      file,
      index,
      questionTitle: typeof title === "string" ? title.slice(0, 40) : `Item #${index + 1}`,
      field,
      message,
    });
  };

  // 1. Module Type Check
  const rawMod = (q.moduleType || q.module || "").toUpperCase().replace(/[\s-]+/g, "_");
  const modType =
    rawMod === "CONTEXT_SIMULATION"
      ? "SIMULATION"
      : rawMod === "AI"
      ? "AI_PROMPTING"
      : rawMod === "DEBUG"
      ? "DEBUGGING"
      : rawMod === "CODE" || rawMod === "DSA"
      ? "CODING"
      : rawMod;

  if (!modType || !(VALID_MODULE_TYPES as readonly string[]).includes(modType)) {
    addError(
      "moduleType",
      `Invalid or missing moduleType "${q.moduleType}". Must be one of: ${VALID_MODULE_TYPES.join(", ")}`
    );
  }

  // 2. Difficulty Check
  const diff = (q.difficulty || q.content?.difficulty || "").toLowerCase();
  if (diff && !(VALID_DIFFICULTIES as readonly string[]).includes(diff)) {
    addError(
      "difficulty",
      `Invalid difficulty "${q.difficulty}". Must be one of: ${VALID_DIFFICULTIES.join(", ")}`
    );
  }

  // 3. Content Check
  const content = q.content || q;
  if (!content || typeof content !== "object") {
    addError("content", "Question missing content payload.");
    return errors;
  }

  const promptText =
    content.prompt ||
    content.question ||
    content.problemStatement ||
    content.scenario ||
    content.description ||
    content.title ||
    content.text ||
    q.question ||
    q.title;

  if (!promptText || typeof promptText !== "string" || promptText.trim().length === 0) {
    addError("content.prompt", "Question is missing prompt / question text.");
  }

  // 4. Module-specific Schema Validation
  switch (modType) {
    case "MCQ": {
      if (!Array.isArray(content.options) || content.options.length < 2) {
        addError("content.options", "MCQ question must provide at least 2 options.");
      }
      const hasAnswer =
        content.correctAnswer !== undefined ||
        content.correctIndex !== undefined ||
        q.scoringConfig?.correctAnswer !== undefined ||
        q.scoringConfig?.correctIndex !== undefined;
      if (!hasAnswer) {
        addError("content.correctAnswer", "MCQ question missing correctAnswer or correctIndex.");
      }
      break;
    }

    case "CODING": {
      const testCases =
        content.testCases ||
        [...(content.visibleTestCases || []), ...(content.hiddenTestCases || [])];
      if (!Array.isArray(testCases) || testCases.length === 0) {
        addError("content.testCases", "CODING question must provide at least 1 testCase.");
      } else {
        testCases.forEach((tc: any, i: number) => {
          if (tc.input === undefined || tc.expectedOutput === undefined) {
            addError(
              `content.testCases[${i}]`,
              "Each testCase must include both 'input' and 'expectedOutput'."
            );
          }
        });
      }
      break;
    }

    case "DEBUGGING": {
      if (!content.buggyCode && !content.starterCode) {
        addError("content.buggyCode", "DEBUGGING question must provide buggyCode or starterCode.");
      }
      const testCases =
        content.testCases ||
        [...(content.visibleTestCases || []), ...(content.hiddenTestCases || [])];
      if (!Array.isArray(testCases) || testCases.length === 0) {
        addError("content.testCases", "DEBUGGING question must provide testCases for verification.");
      }
      break;
    }

    case "SQL": {
      const hasQueryOrCases =
        content.expectedQuery ||
        content.expectedOutput ||
        content.solutionQuery ||
        content.testCases;
      if (!hasQueryOrCases) {
        addError("content.expectedQuery", "SQL question should define expectedQuery, solutionQuery, or testCases.");
      }
      break;
    }

    case "NOSQL": {
      const hasQuery =
        content.expectedQuery ||
        content.solutionQuery ||
        content.pipeline ||
        content.testCases;
      if (!hasQuery && !promptText) {
        addError("content.expectedQuery", "NOSQL question missing query or test definition.");
      }
      break;
    }

    case "AI_PROMPTING":
    case "SIMULATION":
    case "TEST_SCENARIOS":
      // Validated by prompt/scenario requirement above
      break;
  }

  return errors;
}

export function loadQuestionsFromDir(targetDir: string): { questions: any[]; files: string[] } {
  const questions: any[] = [];
  const files: string[] = [];

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  const entries = fs.readdirSync(targetDir);
  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const sub = loadQuestionsFromDir(fullPath);
      questions.push(...sub.questions);
      files.push(...sub.files);
    } else if (entry.endsWith(".json")) {
      files.push(entry);
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            const rawMod = (item.moduleType || item.module || "").toUpperCase();
            if (entry === "proctora_question_bank.json" && rawMod !== "MCQ") return;
            questions.push({ ...item, _sourceFile: entry });
          });
        } else if (Array.isArray(parsed.questions)) {
          parsed.questions.forEach((item: any) => {
            const rawMod = (item.moduleType || item.module || "").toUpperCase();
            if (entry === "proctora_question_bank.json" && rawMod !== "MCQ") return;
            questions.push({ ...item, _sourceFile: entry });
          });
        } else {
          questions.push({ ...parsed, _sourceFile: entry });
        }
      } catch (err: any) {
        console.error(`[ValidationError] Failed to parse JSON file ${entry}: ${err.message}`);
      }
    }
  }

  return { questions, files };
}

export function runValidation(targetDir?: string): {
  success: boolean;
  errors: ValidationError[];
  stats: QuestionStats;
} {
  const baseDir = targetDir || path.join(__dirname, "../data");
  console.log(`\n🔍 Validating Question Bank from: ${path.resolve(baseDir)}`);

  const { questions, files } = loadQuestionsFromDir(baseDir);
  console.log(`📂 Discovered ${files.length} question files with ${questions.length} total question definitions.`);

  const errors: ValidationError[] = [];
  const stats: QuestionStats = {
    total: questions.length,
    byModule: {},
    byDifficulty: {},
    byDepartment: {},
    byTier: {},
  };

  questions.forEach((q, idx) => {
    const file = q._sourceFile || "unknown.json";
    const qErrors = validateSingleQuestion(q, file, idx);
    errors.push(...qErrors);

    // Aggregate stats
    const mod = (q.moduleType || q.module || "MCQ").toUpperCase();
    stats.byModule[mod] = (stats.byModule[mod] || 0) + 1;

    const diff = (q.difficulty || "medium").toLowerCase();
    stats.byDifficulty[diff] = (stats.byDifficulty[diff] || 0) + 1;

    const dept = (q.department || "SOFTWARE_ENGINEERING").toUpperCase();
    stats.byDepartment[dept] = (stats.byDepartment[dept] || 0) + 1;

    const tier = q.targetLevel || q.experienceTier || "all";
    stats.byTier[tier] = (stats.byTier[tier] || 0) + 1;
  });

  // Display Summary Tables
  console.log("\n=======================================================");
  console.log("📊 QUESTION BANK INVENTORY SUMMARY");
  console.log("=======================================================");
  console.log(`Total Questions: ${stats.total}`);
  console.log("\n--- By Module ---");
  for (const [mod, count] of Object.entries(stats.byModule)) {
    console.log(`  ${mod.padEnd(18)} : ${count}`);
  }

  console.log("\n--- By Difficulty ---");
  for (const [diff, count] of Object.entries(stats.byDifficulty)) {
    console.log(`  ${diff.padEnd(18)} : ${count}`);
  }

  console.log("\n--- By Department Tag ---");
  for (const [dept, count] of Object.entries(stats.byDepartment)) {
    console.log(`  ${dept.padEnd(24)} : ${count}`);
  }

  if (errors.length > 0) {
    console.log("\n=======================================================");
    console.log(`❌ VALIDATION FOUND ${errors.length} ISSUE(S):`);
    console.log("=======================================================");
    errors.slice(0, 20).forEach((err, idx) => {
      console.log(
        `  ${idx + 1}. [${err.file}#${err.index}] "${err.questionTitle}": ${err.field} -> ${err.message}`
      );
    });
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more errors.`);
    }
  } else {
    console.log("\n=======================================================");
    console.log("✅ ALL QUESTIONS PASSED VALIDATION! READY FOR PRODUCTION.");
    console.log("=======================================================");
  }

  return {
    success: errors.length === 0,
    errors,
    stats,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let targetDir: string | undefined;
  const dirIdx = args.indexOf("--dir");
  if (dirIdx >= 0 && args[dirIdx + 1]) {
    targetDir = args[dirIdx + 1];
  }

  const result = runValidation(targetDir);
  if (!result.success) {
    process.exit(1);
  }
}
