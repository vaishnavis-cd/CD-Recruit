/**
 * backend/prisma/seed.ts
 *
 * Prisma seed script for the CD-Recruit assessment platform.
 * Populates:
 * - Exactly 32 Role Templates (8 Departments x 4 Experience Tiers) with 90 min duration.
 * - ~600-700 Questions with Department & Seniority tagging (Fresher, L1, L2, L3).
 * - RoleTemplateQuestion mappings for every template.
 * - Default Drive and candidate test sessions.
 *
 * Run via:
 *   npx prisma db seed
 *   (or: npm run db:seed)
 */

import { PrismaClient, ModuleType, CvMode, DecisionType, Department, CandidateCategory, ExperienceLevel } from "@prisma/client";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Standardize .env contract loading
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

import { nosqlQuestions } from "./data/nosql";

const prisma = new PrismaClient();
// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------

const DURATION_MINUTES = 90;

const DEPARTMENTS = [
  "SOFTWARE_ENGINEERING",
  "DATA_ENGINEERING",
  "PMO",
  "QA",
  "SYSOPS",
  "ITOPS",
  "SECOPS",
  "SRE",
] as const;

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

const TIERS = [
  { category: "FRESHER" as const, level: "FRESHER" as const, experienceTier: "0-1", suffix: "Fresher (0-1 yrs)", seniorityTag: "fresher" },
  { category: "EXPERIENCED" as const, level: "EXPERIENCED" as const, experienceTier: "2-5", suffix: "Level 1 (2-5 yrs)", seniorityTag: "l1" },
  { category: "EXPERIENCED" as const, level: "EXPERIENCED" as const, experienceTier: "6-10", suffix: "Level 2 (6-10 yrs)", seniorityTag: "l2" },
  { category: "EXPERIENCED" as const, level: "EXPERIENCED" as const, experienceTier: "11-15", suffix: "Level 3 (11-15 yrs)", seniorityTag: "l3" },
];

const DEFAULT_WEIGHTING_PRESET: Record<string, number> = {
  MCQ: 15,
  SQL: 15,
  NOSQL: 15,
  CODING: 20,
  DEBUGGING: 10,
  AI_PROMPTING: 10,
  SIMULATION: 15,
};

// Department mapping helper
function normalizeDepartment(deptStr: string | undefined): Department {
  if (!deptStr) return "SOFTWARE_ENGINEERING";
  const upper = deptStr.toUpperCase().replace(/\s+/g, "_");
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

// Module type normalization helper
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
  if (upper === "MCQ") return "MCQ";
  return "MCQ";
}

// Seniority determination helper
function determineSeniorityTags(difficulty?: string, explicitSeniority?: string[]): string[] {
  if (explicitSeniority && explicitSeniority.length > 0) {
    return explicitSeniority.map(s => s.toLowerCase());
  }
  const diff = (difficulty || "medium").toLowerCase();
  if (diff === "easy") return ["fresher", "l1"];
  if (diff === "medium") return ["l1", "l2"];
  if (diff === "hard") return ["l2", "l3"];
  return ["fresher", "l1", "l2", "l3"];
}

// ---------------------------------------------------------------------------
// Main Seeder
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🌱 Starting CD-Recruit comprehensive database seed…\n");

  await prisma.$transaction(
    async (tx) => {
      // 1. Upsert Staff (Recruiter)
      const staff = await tx.staff.upsert({
        where: { email: "recruiter@example.com" },
        update: {},
        create: {
          email: "recruiter@example.com",
          name: "Rachel Brooks",
          role: "RECRUITER",
          keycloakUserId: "mock-keycloak-recruiter-id",
        },
      });
      console.log(`  ✔ Upserted Staff "Rachel Brooks" (id: ${staff.id})`);

      // 2. Upsert exactly 32 Department x Experience Tier Role Templates
      console.log(`  🔨 Upserting exactly 32 Role Templates (8 Departments x 4 Tiers, 90 mins each)...`);
      const seededTemplates: Record<string, any> = {};
      const validTemplateIds: string[] = [];

      for (const dept of DEPARTMENTS) {
        for (const t of TIERS) {
          const roleName = `${DEPT_NAMES[dept]} - ${t.suffix}`;
          const key = `${dept}__${t.experienceTier}`;

          const template = await tx.roleTemplate.upsert({
            where: {
              department_category_experienceTier_version: {
                department: dept as Department,
                category: t.category as CandidateCategory,
                experienceTier: t.experienceTier,
                version: 1,
              },
            },
            update: {
              roleName,
              level: t.level as ExperienceLevel,
              isActive: true,
              durationMinutes: DURATION_MINUTES,
              weightingPreset: DEFAULT_WEIGHTING_PRESET,
            },
            create: {
              department: dept as Department,
              category: t.category as CandidateCategory,
              level: t.level as ExperienceLevel,
              experienceTier: t.experienceTier,
              roleName,
              version: 1,
              isActive: true,
              durationMinutes: DURATION_MINUTES,
              weightingPreset: DEFAULT_WEIGHTING_PRESET,
            },
          });
          seededTemplates[key] = template;
          validTemplateIds.push(template.id);
        }
      }
      console.log(`  ✔ Successfully ensured 32 standardized Role Templates`);

      // Seed global ModuleSetting records
      console.log("  🌱 Seeding global ModuleSettings...");
      for (const dept of DEPARTMENTS) {
        for (const moduleType of Object.values(ModuleType)) {
          const isEnabled = DEFAULT_WEIGHTING_PRESET && DEFAULT_WEIGHTING_PRESET[moduleType] !== undefined && DEFAULT_WEIGHTING_PRESET[moduleType] > 0;
          await tx.moduleSetting.upsert({
            where: {
              department_moduleType: {
                department: dept as any,
                moduleType: moduleType as any,
              },
            },
            update: {
              isEnabled,
            },
            create: {
              department: dept as any,
              moduleType: moduleType as any,
              isEnabled,
            },
          });
        }
      }
      console.log("  ✔ Seeded global ModuleSettings successfully.");

      const defaultTemplate = seededTemplates["SOFTWARE_ENGINEERING__0-1"];

      // 3. Reassign and clean up any legacy / un-tiered Role Templates
      const legacyTemplates = await tx.roleTemplate.findMany({
        where: {
          id: { notIn: validTemplateIds },
        },
      });
      if (legacyTemplates.length > 0) {
        console.log(`  🔄 Reassigning relations and removing ${legacyTemplates.length} legacy/duplicate role templates...`);
        for (const lt of legacyTemplates) {
          // Reassign drives, invites, and sessions to the valid default template
          await tx.drive.updateMany({
            where: { roleTemplateId: lt.id },
            data: { roleTemplateId: defaultTemplate.id },
          });
          await tx.invite.updateMany({
            where: { roleTemplateId: lt.id },
            data: { roleTemplateId: defaultTemplate.id },
          });
          await tx.session.updateMany({
            where: { roleTemplateId: lt.id },
            data: { roleTemplateId: defaultTemplate.id },
          });
          await tx.roleTemplateQuestion.deleteMany({
            where: { roleTemplateId: lt.id },
          });
          await tx.roleTemplate.delete({
            where: { id: lt.id },
          });
        }
      }

      // 4. Ingest and Seed Questions from all sources
      console.log(`  📥 Cleaning legacy question records and loading fresh questions from dataset files...`);
      await tx.$executeRawUnsafe('TRUNCATE TABLE "question", "drive_question", "role_template_question" CASCADE;');

      const allQuestionItems: Array<{
        moduleType: ModuleType;
        department: Department;
        difficulty: string;
        tags: string[];
        targetLevel?: string;
        content: any;
        scoringConfig?: any;
      }> = [];

      // Helper to compute canonical target level
      const getTargetLevelFromSeniority = (seniority: string[]): string => {
        if (seniority.includes("l3")) return "11-15";
        if (seniority.includes("l2")) return "6-10";
        if (seniority.includes("l1")) return "2-5";
        return "0-1";
      };

      // Source A: proctora_question_bank.json (500 questions)
      const bankPath = path.join(__dirname, "data/proctora_question_bank.json");
      if (fs.existsSync(bankPath)) {
        const bankData = JSON.parse(fs.readFileSync(bankPath, "utf8"));
        if (Array.isArray(bankData.questions)) {
          for (const q of bankData.questions) {
            const dept = normalizeDepartment(q.department || q.dept);
            const rawMod = q.module || q.moduleType || "";
            const modType: ModuleType = normalizeModuleType(rawMod);
            const diff = (q.difficulty || "medium").toLowerCase();
            const seniority = determineSeniorityTags(diff);
            const targetLevel = getTargetLevelFromSeniority(seniority);

            const cleanCategory = (q.category || q.topic || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");

            const tags = Array.from(
              new Set([
                dept.toLowerCase(),
                modType.toLowerCase(),
                ...seniority,
                ...(cleanCategory ? [cleanCategory] : []),
              ])
            );

            let content: any = {};
            let scoringConfig: any = {};

            if (modType === "MCQ") {
              const hasOptions = Array.isArray(q.options) && q.options.length > 0;
              const correctAns = q.correctAnswer || (hasOptions ? q.options[0] : "");
              content = {
                prompt: q.question || q.prompt || "",
                options: q.options || [],
                correctAnswer: correctAns,
                explanation: q.explanation || "",
                category: q.category || "",
              };
              scoringConfig = {
                correctIndex: hasOptions && q.options.indexOf(correctAns) >= 0 ? q.options.indexOf(correctAns) : 0,
                correctAnswer: correctAns,
                points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1,
              };
            } else if (modType === "SQL") {
              content = {
                prompt: q.question || q.prompt || "",
                expectedQuery: q.expectedAnswer || "SELECT * FROM employees;",
                expectedAnswer: q.expectedAnswer || "SELECT * FROM employees;",
                schema: q.schema || "CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50), salary DECIMAL(10,2), department_id INT);",
                seedData: q.seedData || "INSERT INTO employees VALUES (1, 'Alice', 95000, 1), (2, 'Bob', 80000, 1);",
                category: q.category || "SQL",
              };
              scoringConfig = { points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1 };
            } else if (modType === "CODING" || modType === "DEBUGGING") {
              const lang = q.language || "Python";
              const promptClean = q.question?.replace(/\n/g, " ") || q.prompt?.replace(/\n/g, " ") || "";
              content = {
                prompt: q.question || q.prompt || "",
                expectedAnswer: q.expectedAnswer || "",
                language: lang,
                category: q.category || modType,
                parameters: q.parameters || "input: string",
                returnType: q.returnType || "any",
                functionName: q.functionName || "solution",
                starterCode: {
                  python: `import sys\nimport json\n\ndef solution(data):\n    \"\"\"\n    Solve: ${promptClean}\n    :param data: input string or array\n    :return: expected output\n    \"\"\"\n    # TODO: Implement your solution here\n    pass\n\nif __name__ == '__main__':\n    for line in sys.stdin:\n        if line.strip():\n            print(solution(line.strip()))\n`,
                  javascript: `const fs = require('fs');\n\n/**\n * Solve: ${promptClean}\n * @param {string} data\n * @returns {any}\n */\nfunction solution(data) {\n  // TODO: Implement your solution here\n  return null;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  console.log(solution(input));\n}\n`,
                },
                visibleTestCases: [
                  {
                    input: "Sample Input 1",
                    expectedOutput: q.expectedAnswer || "Expected Result 1",
                    label: "Example 1: Basic Input",
                    explanation: "Verifies basic input processing.",
                  },
                ],
                hiddenTestCases: [
                  {
                    input: "Boundary Input 1",
                    expectedOutput: q.expectedAnswer || "Expected Result 1",
                    label: "Hidden Case 1: Edge Conditions",
                  },
                ],
                testCases: [
                  {
                    input: "Sample Input 1",
                    expectedOutput: q.expectedAnswer || "Expected Result 1",
                    label: "Example 1: Basic Input",
                    isHidden: false,
                  },
                  {
                    input: "Boundary Input 1",
                    expectedOutput: q.expectedAnswer || "Expected Result 1",
                    label: "Hidden Case 1: Edge Conditions",
                    isHidden: true,
                  },
                ],
              };
              scoringConfig = { points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1 };
            } else {
              content = {
                prompt: q.question || q.prompt || "",
                expectedAnswer: q.expectedAnswer || "",
                category: q.category || "",
              };
              scoringConfig = { points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1 };
            }

            allQuestionItems.push({
              moduleType: modType,
              department: dept,
              difficulty: diff,
              tags,
              targetLevel,
              content,
              scoringConfig,
            });
          }
        }
      }

      // Source B: seniority_l2_l3_question_batch.json (96 questions)
      const batchPath = path.join(__dirname, "../../seniority_l2_l3_question_batch.json");
      if (fs.existsSync(batchPath)) {
        const batchData = JSON.parse(fs.readFileSync(batchPath, "utf8"));
        if (Array.isArray(batchData)) {
          for (const q of batchData) {
            const dept = normalizeDepartment(q.department);
            const rawMod = q.moduleType || q.module || "";
            const modType: ModuleType = normalizeModuleType(rawMod);
            const diff = (q.difficulty || "hard").toLowerCase();
            const seniority = determineSeniorityTags(diff, q.seniority);
            const targetLevel = getTargetLevelFromSeniority(seniority);

            const cleanTopic = (q.topic || q.category || "")
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

            const hasOptions = Array.isArray(q.options) && q.options.length > 0;
            const correctAns = q.correctAnswer || (hasOptions ? q.options[0] : "");

            allQuestionItems.push({
              moduleType: modType,
              department: dept,
              difficulty: diff,
              tags,
              targetLevel,
              content: q.content || {
                prompt: q.question || "",
                options: q.options || [],
                correctAnswer: correctAns,
                explanation: q.explanation || "",
                category: q.topic || "",
              },
              scoringConfig: q.scoringConfig || {
                correctIndex: hasOptions && q.options.indexOf(correctAns) >= 0 ? q.options.indexOf(correctAns) : 0,
                correctAnswer: correctAns,
                points: 3,
              },
            });
          }
        }
      }

      // Source C: Module-specific files (mcq, sql, coding, debugging, aiPrompting, simulation)
      const moduleFiles = [
        { file: "mcq.json", defaultMod: "MCQ" as ModuleType, depts: ["SOFTWARE_ENGINEERING"] as Department[] },
        { file: "sql.json", defaultMod: "SQL" as ModuleType, depts: ["SOFTWARE_ENGINEERING", "DATA_ENGINEERING", "QA"] as Department[] },
        { file: "coding.json", defaultMod: "CODING" as ModuleType, depts: ["SOFTWARE_ENGINEERING", "DATA_ENGINEERING", "QA"] as Department[] },
        { file: "debugging.json", defaultMod: "DEBUGGING" as ModuleType, depts: ["SOFTWARE_ENGINEERING", "QA"] as Department[] },
        { file: "aiPrompting.json", defaultMod: "AI_PROMPTING" as ModuleType, depts: ["SOFTWARE_ENGINEERING", "PMO"] as Department[] },
        { file: "simulation.json", defaultMod: "SIMULATION" as ModuleType, depts: ["SOFTWARE_ENGINEERING", "SRE", "SYSOPS"] as Department[] },
      ];

      for (const mf of moduleFiles) {
        const fPath = path.join(__dirname, "data", mf.file);
        if (fs.existsSync(fPath)) {
          const items = JSON.parse(fs.readFileSync(fPath, "utf8"));
          if (Array.isArray(items)) {
            for (const item of items) {
              const modType = item.moduleType ? normalizeModuleType(item.moduleType) : mf.defaultMod;
              const diff = (item.difficulty || item.content?.difficulty || "medium").toLowerCase();
              const seniority = determineSeniorityTags(diff);
              const targetLevel = getTargetLevelFromSeniority(seniority);
              const deptTags = mf.depts.map((d) => d.toLowerCase());

              const cleanTopic = (item.category || item.topic || "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");

              const tags = Array.from(
                new Set([
                  ...deptTags,
                  modType.toLowerCase(),
                  ...seniority,
                  ...(cleanTopic ? [cleanTopic] : []),
                ])
              );

              const content = item.content || item;
              if (modType === "MCQ" && content.options && content.options.length > 0) {
                if (!content.correctAnswer && content.correctIndex !== undefined) {
                  content.correctAnswer = content.options[content.correctIndex];
                }
              } else if (modType === "CODING" || modType === "DEBUGGING") {
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
              }

              allQuestionItems.push({
                moduleType: modType,
                department: mf.depts[0],
                difficulty: diff,
                tags,
                targetLevel,
                content,
                scoringConfig: item.scoringConfig || {
                  correctIndex:
                    content.options && content.correctAnswer
                      ? content.options.indexOf(content.correctAnswer)
                      : content.correctIndex || 0,
                  points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1,
                },
              });
            }
          }
        }
      }

      // Source D: NoSQL module questions
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
        });
      }

      // Ingest all questions into database
      const createdQuestions: any[] = [];
      for (const q of allQuestionItems) {
        const created = await tx.question.create({
          data: {
            moduleType: q.moduleType,
            content: q.content,
            scoringConfig: q.scoringConfig,
            difficulty: q.difficulty,
            tags: q.tags,
            targetLevel: q.targetLevel,
            status: "PUBLISHED",
            role: DEPT_NAMES[q.department] || "General",
          },
        });
        createdQuestions.push({ ...created, department: q.department });
      }
      console.log(`  ✔ Ingested and synchronized ${createdQuestions.length} clean questions into Question repository`);

      // 5. Assign Balanced Multi-Module Questions to each of the 32 Role Templates
      console.log(`  🔗 Assigning questions to all 32 Role Templates via RoleTemplateQuestion...`);
      for (const dept of DEPARTMENTS) {
        for (const t of TIERS) {
          const key = `${dept}__${t.experienceTier}`;
          const template = seededTemplates[key];
          if (!template) continue;

          // Clear existing assigned questions for clean assignment
          await tx.roleTemplateQuestion.deleteMany({
            where: { roleTemplateId: template.id },
          });

          const deptTag = dept.toLowerCase();
          const targetTag = t.seniorityTag; // "fresher", "l1", "l2", "l3"

          // 1. MCQ questions for this department & seniority (target 8-10)
          let deptMcqs = createdQuestions.filter(q =>
            q.moduleType === "MCQ" &&
            (q.tags.includes(deptTag) || q.department === dept) &&
            q.tags.includes(targetTag)
          );
          if (deptMcqs.length < 8) {
            const fallbackMcqs = createdQuestions.filter(q =>
              q.moduleType === "MCQ" && q.tags.includes(targetTag)
            );
            deptMcqs = Array.from(new Set([...deptMcqs, ...fallbackMcqs]));
          }
          const selectedMcqs = deptMcqs.slice(0, 8);

          // 2. CODING questions (target 2)
          let codings = createdQuestions.filter(q =>
            q.moduleType === "CODING" && q.tags.includes(targetTag)
          );
          if (codings.length < 2) {
            codings = createdQuestions.filter(q => q.moduleType === "CODING");
          }
          const selectedCodings = codings.slice(0, 2);

          // 3. SQL questions (target 2)
          let sqls = createdQuestions.filter(q =>
            q.moduleType === "SQL" && q.tags.includes(targetTag)
          );
          if (sqls.length < 2) {
            sqls = createdQuestions.filter(q => q.moduleType === "SQL");
          }
          const selectedSqls = sqls.slice(0, 2);

          // 4. DEBUGGING questions (target 1)
          let debugs = createdQuestions.filter(q =>
            q.moduleType === "DEBUGGING" && q.tags.includes(targetTag)
          );
          if (debugs.length === 0) {
            debugs = createdQuestions.filter(q => q.moduleType === "DEBUGGING");
          }
          const selectedDebugs = debugs.slice(0, 1);

          // 5. NOSQL questions (target 1)
          const nosqls = createdQuestions.filter(q => q.moduleType === "NOSQL");
          const selectedNosqls = nosqls.slice(0, 1);

          // 6. AI PROMPTING (target 1)
          const promptings = createdQuestions.filter(q => q.moduleType === "AI_PROMPTING");
          const selectedPromptings = promptings.slice(0, 1);

          // 7. SIMULATION (target 1)
          const simulations = createdQuestions.filter(q => q.moduleType === "SIMULATION");
          const selectedSimulations = simulations.slice(0, 1);

          // 8. TEST SCENARIOS (target 2)
          let scenarios = createdQuestions.filter(q =>
            q.moduleType === "TEST_SCENARIOS" &&
            (q.tags.includes(deptTag) || q.department === dept)
          );
          if (scenarios.length < 2) {
            scenarios = createdQuestions.filter(q => q.moduleType === "TEST_SCENARIOS");
          }
          const selectedScenarios = scenarios.slice(0, 2);

          // Combine all selected questions
          const combinedQuestions = [
            ...selectedMcqs,
            ...selectedCodings,
            ...selectedSqls,
            ...selectedDebugs,
            ...selectedNosqls,
            ...selectedPromptings,
            ...selectedSimulations,
            ...selectedScenarios,
          ];

          // Deduplicate
          const seenIds = new Set<string>();
          const finalTemplateQuestions: any[] = [];
          for (const q of combinedQuestions) {
            if (!seenIds.has(q.id)) {
              seenIds.add(q.id);
              finalTemplateQuestions.push(q);
            }
          }

          let orderIndex = 0;
          for (const q of finalTemplateQuestions) {
            await tx.roleTemplateQuestion.upsert({
              where: {
                roleTemplateId_questionId: {
                  roleTemplateId: template.id,
                  questionId: q.id,
                },
              },
              update: {
                orderIndex: orderIndex++,
                moduleType: q.moduleType,
                pointShare: 1.0,
                questionVersionSnapshot: q.version || 1,
              },
              create: {
                roleTemplateId: template.id,
                questionId: q.id,
                moduleType: q.moduleType,
                orderIndex: orderIndex++,
                pointShare: 1.0,
                questionVersionSnapshot: q.version || 1,
              },
            });
          }
        }
      }
      console.log(`  ✔ Successfully assigned balanced multi-module questions across all 32 Role Templates`);

      // 6. Upsert Default Recruitment Drive linked to Software Engineering Fresher template
      let drive = await tx.drive.findFirst({
        where: { name: "Software Developer Drive - July 2026" },
      });

      if (!drive) {
        drive = await tx.drive.create({
          data: {
            name: "Software Developer Drive - July 2026",
            roleTemplateId: defaultTemplate.id,
            moduleConfig: {
              MCQ: { enabled: true, durationMinutes: 15, weight: 0.15 },
              SQL: { enabled: true, durationMinutes: 20, weight: 0.20 },
              CODING: { enabled: true, durationMinutes: 30, weight: 0.30 },
              AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 0.20 },
              SIMULATION: { enabled: true, durationMinutes: 10, weight: 0.15 },
            },
            status: "ACTIVE",
            scheduleStart: new Date(),
            scheduleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdById: staff.id,
          },
        });
        console.log(`  ✔ Created Drive "${drive.name}" (id: ${drive.id})`);
      } else {
        await tx.drive.update({
          where: { id: drive.id },
          data: { roleTemplateId: defaultTemplate.id },
        });
      }

      // 7. Link Questions to the Drive
      const defaultTemplateQuestions = await tx.roleTemplateQuestion.findMany({
        where: { roleTemplateId: defaultTemplate.id },
        include: { question: true },
      });

      for (const rtq of defaultTemplateQuestions) {
        await tx.driveQuestion.upsert({
          where: {
            driveId_questionId: {
              driveId: drive.id,
              questionId: rtq.questionId,
            },
          },
          update: {},
          create: {
            driveId: drive.id,
            questionId: rtq.questionId,
            moduleType: rtq.moduleType,
            questionVersionSnapshot: rtq.questionVersionSnapshot || 1,
          },
        });
      }
      console.log(`  ✔ Linked ${defaultTemplateQuestions.length} questions to Drive "${drive.name}"`);

      // 8. Seed Candidates, Invites, Sessions, Scores, Integrity Flags, and Reviewer Decisions
      const candidatesData = [
        { name: "Alice Johnson", email: "alice.johnson@example.com", score: 88, status: "SUBMITTED", decision: DecisionType.ADVANCE, flags: 0 },
        { name: "Bob Smith", email: "bob.smith@example.com", score: 74, status: "SUBMITTED", decision: null, flags: 1 },
        { name: "Carol White", email: "carol.white@example.com", score: 42, status: "SUBMITTED", decision: DecisionType.REJECT, flags: 2 },
        { name: "David Miller", email: "david.miller@example.com", score: null, status: "IN_PROGRESS", decision: null, flags: 0 },
        { name: "Emma Watson", email: "emma.watson@example.com", score: 92, status: "SUBMITTED", decision: null, flags: 0 },
      ];

      for (const cand of candidatesData) {
        const candidate = await tx.candidate.upsert({
          where: { email: cand.email },
          update: {},
          create: {
            name: cand.name,
            email: cand.email,
          },
        });

        let invite = await tx.invite.findFirst({ where: { candidateEmail: cand.email } });
        if (!invite) {
          invite = await tx.invite.create({
            data: {
              candidateEmail: cand.email,
              candidateName: cand.name,
              roleTemplateId: defaultTemplate.id,
              driveId: drive.id,
              status: "REDEEMED",
              token: `token-${cand.email.replace(/[@.]/g, "-")}-${Date.now()}`,
              createdById: staff.id,
              expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
            },
          });
        }

        let session = await tx.session.findFirst({ where: { candidateId: candidate.id } });
        if (!session) {
          session = await tx.session.create({
            data: {
              candidateId: candidate.id,
              driveId: drive.id,
              roleTemplateId: defaultTemplate.id,
              cvMode: CvMode.FULL,
              status: cand.status as any,
              startedAt: new Date(Date.now() - 3600 * 1000),
              submittedAt: cand.status === "SUBMITTED" ? new Date() : null,
            },
          });

          await tx.invite.update({
            where: { id: invite.id },
            data: { sessionId: session.id },
          });

          if (cand.score !== null) {
            await tx.score.create({
              data: {
                sessionId: session.id,
                compositeScore: cand.score,
                moduleScores: { MCQ: cand.score, SQL: cand.score, CODING: cand.score },
                sayDoConsistencyScore: cand.score / 100,
                aiConfidence: 0.9,
                humanReviewed: cand.decision !== null,
              },
            });
          }

          if (cand.decision) {
            await tx.reviewerDecision.create({
              data: {
                sessionId: session.id,
                staffId: staff.id,
                decision: cand.decision,
                note: cand.decision === DecisionType.ADVANCE ? "Excellent technical performance." : "Did not meet pass threshold.",
              },
            });
          }

          if (cand.flags > 0) {
            await tx.integrityFlag.create({
              data: {
                sessionId: session.id,
                category: "CORRELATED_PASTE_ANOMALY",
                severity: "CRITICAL",
                confidence: 0.95,
              },
            });
          }
        }
      }
      console.log(`  ✔ Seeded candidate sessions, scores, integrity flags, and reviewer decisions.`);
    },
    { timeout: 120000 },
  );

  console.log("\n✅ Database seed completed successfully.");
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
