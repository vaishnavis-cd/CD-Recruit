/**
 * backend/prisma/seed.ts
 *
 * Prisma seed script for the CD-Recruit assessment platform.
 * Reads seed question datasets from declarative JSON files in backend/prisma/data/
 * and seniority_l2_l3_question_batch.json.
 *
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
      console.log(`  📥 Loading and ingesting questions from all dataset files...`);
      const allQuestionItems: Array<{
        moduleType: ModuleType;
        department: Department;
        difficulty: string;
        tags: string[];
        targetLevel?: string;
        content: any;
        scoringConfig?: any;
      }> = [];

      // Source A: proctora_question_bank.json (500 questions)
      const bankPath = path.join(__dirname, "data/proctora_question_bank.json");
      if (fs.existsSync(bankPath)) {
        const bankData = JSON.parse(fs.readFileSync(bankPath, "utf8"));
        if (Array.isArray(bankData.questions)) {
          for (const q of bankData.questions) {
            const dept = normalizeDepartment(q.department || q.dept);
            const modType = normalizeModuleType(q.module || q.moduleType);
            const diff = (q.difficulty || "medium").toLowerCase();
            const seniority = determineSeniorityTags(diff);
            const tags = Array.from(new Set([
              dept.toLowerCase(),
              modType.toLowerCase(),
              ...seniority,
              ...(q.tags || []),
              ...(q.category ? [q.category.toLowerCase().replace(/\s+/g, "-")] : []),
            ]));

            const content = {
              prompt: q.question || q.prompt || "",
              options: q.options || [],
              correctAnswer: q.correctAnswer || "",
              explanation: q.explanation || "",
              category: q.category || "",
              tier: q.tier || "TIER_1",
            };

            const scoringConfig = q.scoringConfig || {
              correctIndex: q.options ? q.options.indexOf(q.correctAnswer) : 0,
              points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1,
            };

            allQuestionItems.push({
              moduleType: modType,
              department: dept,
              difficulty: diff,
              tags,
              targetLevel: seniority.includes("l3") ? "L3" : seniority.includes("l2") ? "L2" : seniority.includes("l1") ? "L1" : "FRESHER",
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
            const modType = normalizeModuleType(q.moduleType);
            const diff = (q.difficulty || "hard").toLowerCase();
            const seniority = determineSeniorityTags(diff, q.seniority);
            const tags = Array.from(new Set([
              dept.toLowerCase(),
              modType.toLowerCase(),
              ...seniority,
              ...(q.tags || []),
              ...(q.topic ? [q.topic.toLowerCase().replace(/\s+/g, "-")] : []),
            ]));

            allQuestionItems.push({
              moduleType: modType,
              department: dept,
              difficulty: diff,
              tags,
              targetLevel: seniority.includes("l3") ? "L3" : "L2",
              content: q.content || {
                prompt: q.question || "",
                options: q.options || [],
                correctAnswer: q.correctAnswer || "",
                explanation: q.explanation || "",
              },
              scoringConfig: q.scoringConfig || { points: 3 },
            });
          }
        }
      }

      // Source C: Module-specific files (mcq, sql, coding, debugging, aiPrompting, simulation, nosql)
      const moduleFiles = [
        { file: "mcq.json", defaultMod: "MCQ" as ModuleType },
        { file: "sql.json", defaultMod: "SQL" as ModuleType },
        { file: "coding.json", defaultMod: "CODING" as ModuleType },
        { file: "debugging.json", defaultMod: "DEBUGGING" as ModuleType },
        { file: "aiPrompting.json", defaultMod: "AI_PROMPTING" as ModuleType },
        { file: "simulation.json", defaultMod: "SIMULATION" as ModuleType },
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
              const dept: Department = "SOFTWARE_ENGINEERING";
              const tags = Array.from(new Set([
                dept.toLowerCase(),
                modType.toLowerCase(),
                ...seniority,
                ...(item.tags || []),
              ]));

              allQuestionItems.push({
                moduleType: modType,
                department: dept,
                difficulty: diff,
                tags,
                targetLevel: seniority.includes("l3") ? "L3" : seniority.includes("l2") ? "L2" : seniority.includes("l1") ? "L1" : "FRESHER",
                content: item.content || item,
                scoringConfig: item.scoringConfig || { points: diff === "hard" ? 3 : diff === "medium" ? 2 : 1 },
              });
            }
          }
        }
      }

      // Source D: NoSQL module questions
      for (const nq of nosqlQuestions) {
        const diff = (nq.difficulty || "medium").toLowerCase();
        const seniority = determineSeniorityTags(diff);
        const dept: Department = "SOFTWARE_ENGINEERING";
        allQuestionItems.push({
          moduleType: "NOSQL",
          department: dept,
          difficulty: diff,
          tags: Array.from(new Set([dept.toLowerCase(), "nosql", ...seniority])),
          targetLevel: seniority.includes("l2") ? "L2" : "L1",
          content: nq.content,
          scoringConfig: { points: 2 },
        });
      }

      // Ingest all questions into database
      const createdQuestions: any[] = [];
      for (const q of allQuestionItems) {
        const prompt = q.content?.prompt || q.content?.title || q.content?.question || "";
        const matchPath = q.content?.prompt ? ["prompt"] : q.content?.title ? ["title"] : ["question"];

        const existing = await tx.question.findFirst({
          where: {
            moduleType: q.moduleType,
            content: { path: matchPath, equals: prompt },
          },
        });

        if (existing) {
          const updated = await tx.question.update({
            where: { id: existing.id },
            data: {
              moduleType: q.moduleType,
              difficulty: q.difficulty,
              tags: q.tags,
              targetLevel: q.targetLevel,
              status: "PUBLISHED",
              role: DEPT_NAMES[q.department] || "General",
            },
          });
          createdQuestions.push({ ...updated, department: q.department });
        } else {
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
      }
      console.log(`  ✔ Ingested and synchronized ${createdQuestions.length} questions into Question repository`);

      // 5. Assign Departmental & Seniority-Tier Questions to each of the 32 Role Templates
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

          // Match questions for this department & seniority tier
          const deptTag = dept.toLowerCase();
          const targetTag = t.seniorityTag; // "fresher", "l1", "l2", "l3"

          let matching = createdQuestions.filter(q => {
            const hasDept = q.tags.includes(deptTag) || q.department === dept;
            const hasSeniority = q.tags.includes(targetTag);
            return hasDept && hasSeniority;
          });

          // Fallback if not enough department-specific questions: include core Software Engineering / general questions
          if (matching.length < 10) {
            const fallback = createdQuestions.filter(q => {
              const hasSeniority = q.tags.includes(targetTag);
              return hasSeniority && (q.tags.includes("software_engineering") || q.tags.includes("sde"));
            });
            matching = Array.from(new Set([...matching, ...fallback]));
          }

          // Deduplicate questions by question id
          const seenQuestionIds = new Set<string>();
          const uniqueSelectedQuestions: any[] = [];
          for (const q of matching) {
            if (!seenQuestionIds.has(q.id)) {
              seenQuestionIds.add(q.id);
              uniqueSelectedQuestions.push(q);
            }
          }

          // Select a balanced set of 15 to 25 questions per template
          const selectedQuestions = uniqueSelectedQuestions.slice(0, 20);

          let orderIndex = 0;
          for (const q of selectedQuestions) {
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
      console.log(`  ✔ Successfully assigned questions across all 32 Role Templates`);

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
