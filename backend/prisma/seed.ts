/**
 * backend/prisma/seed.ts
 *
 * Prisma seed script for the CD-Recruit assessment platform.
 * Reads seed question datasets from declarative JSON files in backend/prisma/data/.
 *
 * Run via:
 *   npx prisma db seed
 *   (or directly: npx tsx backend/prisma/seed.ts)
 */

import { PrismaClient, ModuleType, CvMode, DecisionType } from "@prisma/client";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Standardize .env contract loading
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

import { nosqlQuestions } from "./data/nosql";

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------

const ROLE_NAME = "Software Developer";
const DURATION_MINUTES = 90;

const DEFAULT_WEIGHTING_PRESET: Record<ModuleType, number> = {
  MCQ: 0.10,
  SQL: 0.15,
  NOSQL: 0.15,
  CODING: 0.20,
  DEBUGGING: 0.10,
  AI_PROMPTING: 0.10,
  SIMULATION: 0.10,
  TEST_SCENARIOS: 0.10,
};

/**
 * Reads all declarative JSON seed question files from backend/prisma/data/
 */
function getAllQuestionSeedData(): Array<{
  moduleType: ModuleType;
  difficulty?: string;
  content: any;
}> {
  const dataDir = path.join(__dirname, "data");
  const jsonFiles = ["mcq.json", "sql.json", "coding.json", "debugging.json", "aiPrompting.json", "simulation.json"];
  const questions: Array<{ moduleType: ModuleType; difficulty?: string; content: any }> = [];

  for (const file of jsonFiles) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      const items = JSON.parse(fs.readFileSync(filePath, "utf8"));
      questions.push(...items);
    }
  }

  questions.push(
    ...nosqlQuestions.map((q) => ({
      moduleType: q.moduleType as ModuleType,
      difficulty: q.difficulty,
      content: q.content,
    })),
  );

  return questions;
}

// ---------------------------------------------------------------------------
// Main Seeder
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Starting seed…");

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

      // Instead of base template, use our seeded SDE Fresher template for the default drive
      let sdeFresherTemplate = await tx.roleTemplate.findFirst({
        where: {
          department: "SOFTWARE_ENGINEERING",
          level: "FRESHER",
          version: 1,
        },
      });

      // 2b. Seed 32 Department x Experience Level Role Templates
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

      const ROLE_TITLES: Record<string, string> = {
        SOFTWARE_ENGINEERING: "Software Engineer (SDE)",
        DATA_ENGINEERING: "Data Engineer",
        PMO: "Project Management Officer (PMO)",
        QA: "QA Engineer",
        SYSOPS: "SysOps Engineer",
        ITOPS: "ITOps Specialist",
        SECOPS: "SecOps Specialist",
        SRE: "Site Reliability Engineer (SRE)",
      };

      const DEPT_WEIGHTS: Record<string, Record<string, number>> = {
        SOFTWARE_ENGINEERING: {
          MCQ: 0.15,
          SQL: 0.15,
          CODING: 0.30,
          DEBUGGING: 0.10,
          TEST_SCENARIOS: 0.15,
          AI_PROMPTING: 0.05,
          SIMULATION: 0.10,
        },
        DATA_ENGINEERING: { MCQ: 0.20, SQL: 0.30, CODING: 0.20, TEST_SCENARIOS: 0.20, AI_PROMPTING: 0.10 },
        QA: { MCQ: 0.20, CODING: 0.15, DEBUGGING: 0.20, TEST_SCENARIOS: 0.35, AI_PROMPTING: 0.10 },
        SRE: { MCQ: 0.25, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.30 },
        SYSOPS: { MCQ: 0.30, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.25 },
        ITOPS: { MCQ: 0.30, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.25 },
        PMO: { MCQ: 0.25, TEST_SCENARIOS: 0.50, AI_PROMPTING: 0.25 },
        SECOPS: { MCQ: 0.25, TEST_SCENARIOS: 0.45, AI_PROMPTING: 0.30 },
      };

      for (const dept of DEPARTMENTS) {
        const levelsToSeed = [
          { lvl: "FRESHER", expLvl: null, suffix: "Fresher" },
          { lvl: "EXPERIENCED", expLvl: "L1", suffix: "Experienced L1" },
          { lvl: "EXPERIENCED", expLvl: "L2", suffix: "Experienced L2" },
          { lvl: "EXPERIENCED", expLvl: "L3", suffix: "Experienced L3" },
        ];

        for (const { lvl, expLvl, suffix } of levelsToSeed) {
          const name = `${ROLE_TITLES[dept]} - ${suffix}`;
          const existing = await tx.roleTemplate.findFirst({
            where: {
              department: dept as any,
              level: lvl as any,
              experiencedLevel: expLvl as any,
              version: 1,
            },
          });

          if (existing) {
            await tx.roleTemplate.update({
              where: { id: existing.id },
              data: {
                roleName: name,
                isActive: true,
                durationMinutes: 90,
                weightingPreset: DEPT_WEIGHTS[dept] as any,
              },
            });
          } else {
            await tx.roleTemplate.create({
              data: {
                department: dept as any,
                level: lvl as any,
                experiencedLevel: expLvl as any,
                roleName: name,
                version: 1,
                isActive: true,
                durationMinutes: 90,
                weightingPreset: DEPT_WEIGHTS[dept] as any,
              },
            });
          }
        }
      }
      console.log(`  ✔ Seeded 32 Department / Level Role Templates`);

      // Seed global ModuleSetting records
      console.log("  🌱 Seeding global ModuleSettings...");
      for (const dept of DEPARTMENTS) {
        const defaultWeights = DEPT_WEIGHTS[dept];
        for (const moduleType of Object.values(ModuleType)) {
          const isEnabled = defaultWeights && defaultWeights[moduleType] !== undefined && defaultWeights[moduleType] > 0;
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

      // Cleanup obsolete Role Templates
      const keepNames = [
        "Software Developer",
        ...DEPARTMENTS.flatMap(dept => [
          `${ROLE_TITLES[dept]} - Fresher`,
          `${ROLE_TITLES[dept]} - Experienced L1`,
          `${ROLE_TITLES[dept]} - Experienced L2`,
          `${ROLE_TITLES[dept]} - Experienced L3`,
        ])
      ];

      const obsoleteTemplates = await tx.roleTemplate.findMany({
        where: {
          roleName: { notIn: keepNames }
        },
        select: { id: true, roleName: true }
      });

      if (obsoleteTemplates.length > 0) {
        const obsoleteIds = obsoleteTemplates.map(t => t.id);

        for (const templateId of obsoleteIds) {
          // Find and delete all dependent sessions and their scores/integrity flags
          const sessionsToDelete = await tx.session.findMany({
            where: { roleTemplateId: templateId },
            select: { id: true }
          });
          const sessionIds = sessionsToDelete.map(s => s.id);

          if (sessionIds.length > 0) {
            await tx.score.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.reviewerDecision.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.integrityFlag.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.eventLog.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.moduleResponse.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.proctoringEvent.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.codingExecution.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.sQLExecution.deleteMany({ where: { sessionId: { in: sessionIds } } });
            await tx.identityCapture.deleteMany({ where: { sessionId: { in: sessionIds } } });
          }

          // Unlink sessions from invites
          await tx.invite.updateMany({
            where: { sessionId: { in: sessionIds } },
            data: { sessionId: null }
          });

          // Delete sessions
          await tx.session.deleteMany({ where: { roleTemplateId: templateId } });

          // Delete invites
          await tx.invite.deleteMany({ where: { roleTemplateId: templateId } });

          // Delete drives and drive questions
          const drivesToDelete = await tx.drive.findMany({
            where: { roleTemplateId: templateId },
            select: { id: true }
          });
          const driveIds = drivesToDelete.map(d => d.id);

          if (driveIds.length > 0) {
            await tx.driveQuestion.deleteMany({ where: { driveId: { in: driveIds } } });
            await tx.invite.deleteMany({ where: { driveId: { in: driveIds } } });
            await tx.session.deleteMany({ where: { driveId: { in: driveIds } } });
            await tx.drive.deleteMany({ where: { id: { in: driveIds } } });
          }

          // Delete role template questions
          await tx.roleTemplateQuestion.deleteMany({ where: { roleTemplateId: templateId } });

          // Finally delete the template itself
          await tx.roleTemplate.delete({ where: { id: templateId } });
        }
        console.log(`  🗑 Cleaned up database: Deleted all obsolete templates and their dependent records.`);
      }

      // Re-fetch sdeFresherTemplate to make sure it's fresh
      sdeFresherTemplate = await tx.roleTemplate.findFirst({
        where: {
          department: "SOFTWARE_ENGINEERING",
          level: "FRESHER",
          version: 1,
        },
      });

      // 3. Seed Questions from JSON Files
      const allQuestions = getAllQuestionSeedData();
      const createdQuestions = [];

      for (const q of allQuestions) {
        const prompt = q.content?.prompt || q.content?.title || "";
        const matchPath = q.content?.prompt ? ["prompt"] : ["title"];
        const difficulty = (q.difficulty || q.content?.difficulty || "medium").toLowerCase();
        const isDebugging = q.moduleType === "DEBUGGING" || prompt.toLowerCase().includes("debugging");
        const targetModule = isDebugging ? "DEBUGGING" : q.moduleType;
        const tags = isDebugging ? ["debugging", "coding"] : [q.moduleType.toLowerCase()];

        const existing = await tx.question.findFirst({
          where: {
            moduleType: targetModule as ModuleType,
            content: { path: matchPath, equals: prompt },
          },
        });

        if (existing) {
          const updated = await tx.question.update({
            where: { id: existing.id },
            data: { moduleType: targetModule as ModuleType, difficulty, tags, status: "PUBLISHED" },
          });
          createdQuestions.push(updated);
        } else {
          const created = await tx.question.create({
            data: {
              moduleType: targetModule as ModuleType,
              content: q.content,
              difficulty,
              tags,
              status: "PUBLISHED",
            },
          });
          createdQuestions.push(created);
        }
      }
      console.log(`  ✔ Ensured ${createdQuestions.length} JSON seed questions exist and published`);

      // 4. Upsert Default Recruitment Drive
      let drive = await tx.drive.findFirst({
        where: { name: "Software Developer Drive - July 2026" },
      });
      if (!drive) {
        drive = await tx.drive.create({
          data: {
            name: "Software Developer Drive - July 2026",
            roleTemplateId: sdeFresherTemplate!.id,
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
      }

      // 5. Link Questions to the Drive
      for (const q of createdQuestions) {
        await tx.driveQuestion.upsert({
          where: {
            driveId_questionId: {
              driveId: drive.id,
              questionId: q.id,
            },
          },
          update: {},
          create: {
            driveId: drive.id,
            questionId: q.id,
            moduleType: q.moduleType,
            questionVersionSnapshot: (q as any).version ?? 1,
          },
        });
      }
      console.log(`  ✔ Linked questions to Drive "${drive.name}"`);

      // 6. Seed Candidates, Invites, Sessions, Scores, Integrity Flags, and Reviewer Decisions
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
              roleTemplateId: sdeFresherTemplate!.id,
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
              roleTemplateId: sdeFresherTemplate!.id,
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
    { timeout: 30000 },
  );

  console.log("✅ Seed complete.");
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
