/**
 * backend/prisma/seed.ts
 *
 * Prisma seed script for the CD-Recruit assessment platform.
 *
 * Run via:
 *   npx prisma db seed
 *   (or directly: npx tsx backend/prisma/seed.ts)
 *
 * Idempotent: safe to run multiple times.
 *   - Uses findFirst + conditional create for RoleTemplate (no unique constraint in schema).
 *   - Skips Question seeding if any questions already exist for the template.
 */

import { PrismaClient, ModuleType, CvMode, DecisionType } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

import { mcqQuestions } from "./data/mcq";
import { sqlQuestions } from "./data/sql";
import { codingQuestions } from "./data/coding";
import { aiPromptingQuestions } from "./data/aiPrompting";
import { simulationQuestions } from "./data/simulation";
import { debuggingQuestions } from "./data/debugging";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_NAME = "Software Developer";

/**
 * Default weighting preset for the Software Developer role.
 * Keys correspond to ModuleType enum values; values are 0–1 weights summing to 1.
 * These are used by the Correlation Engine (Phase 10) to compute the composite score.
 */
const DEFAULT_WEIGHTING_PRESET: Record<ModuleType, number> = {
  MCQ: 0.15,
  SQL: 0.15,
  CODING: 0.25,
  DEBUGGING: 0.15,
  AI_PROMPTING: 0.15,
  SIMULATION: 0.15,
};

/**
 * Assessment duration for a Software Developer session, in minutes.
 * Stored on RoleTemplate.durationMinutes and used to compute Session.deadlineAt.
 */
const DURATION_MINUTES = 90;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * Returns a unified list of all question seed entries across every module type,
 * cast to the shape Prisma expects for Question.create / createMany.
 */
function getAllQuestionSeedData(): Array<{
  moduleType: ModuleType;
  difficulty?: string;
  content: unknown;
}> {
  return [
    ...mcqQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, difficulty: q.difficulty, content: q.content })),
    ...sqlQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, difficulty: (q as any).difficulty, content: q.content })),
    ...codingQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, difficulty: (q as any).difficulty, content: q.content })),
    ...debuggingQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, difficulty: (q as any).difficulty, content: q.content })),
    ...aiPromptingQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, difficulty: (q as any).difficulty, content: q.content })),
    ...simulationQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, difficulty: (q as any).difficulty, content: q.content })),
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Starting seed…");

  await prisma.$transaction(
    async (tx) => {
    // ------------------------------------------------------------------
    // 1. Upsert Staff (Recruiter)
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // 2. Upsert RoleTemplate
    // ------------------------------------------------------------------
    let roleTemplate = await tx.roleTemplate.findFirst({
      where: { roleName: ROLE_NAME },
    });

    if (!roleTemplate) {
      roleTemplate = await tx.roleTemplate.create({
        data: {
          roleName: ROLE_NAME,
          weightingPreset: DEFAULT_WEIGHTING_PRESET,
          durationMinutes: DURATION_MINUTES,
        },
      });
      console.log(`  ✔ Created RoleTemplate "${ROLE_NAME}" (id: ${roleTemplate.id})`);
    } else {
      console.log(`  ↩ RoleTemplate "${ROLE_NAME}" already exists (id: ${roleTemplate.id}) — skipping create`);
    }

    // ------------------------------------------------------------------
    // 3. Seed Questions (Independent of RoleTemplate)
    // ------------------------------------------------------------------
    const allQuestions = getAllQuestionSeedData();

    // Create questions with distributed easy / medium / hard difficulty levels
    const difficulties = ["easy", "medium", "hard"];
    let diffIdx = 0;
    const createdQuestions = [];
    for (const q of allQuestions) {
      const prompt = (q.content as any)?.prompt || (q.content as any)?.title || '';
      const matchPath = (q.content as any)?.prompt ? ['prompt'] : ['title'];
      const difficulty = (q.difficulty || (q.content as any)?.difficulty || difficulties[diffIdx % 3]).toLowerCase();
      diffIdx++;

      const existing = await tx.question.findFirst({
        where: {
          moduleType: q.moduleType,
          content: { path: matchPath, equals: prompt },
        },
      });
      const isDebugging = prompt.toLowerCase().includes("debugging") || q.moduleType === "DEBUGGING";
      const targetModule = isDebugging ? "DEBUGGING" : q.moduleType;
      const tags = isDebugging ? ["debugging", "coding"] : [q.moduleType.toLowerCase()];

      if (existing) {
        const updated = await tx.question.update({
          where: { id: existing.id },
          data: { moduleType: targetModule as any, difficulty, tags, status: "PUBLISHED" as any },
        });
        createdQuestions.push(updated);
      } else {
        const created = await tx.question.create({
          data: {
            moduleType: targetModule as any,
            content: q.content as any,
            difficulty,
            tags,
            status: "PUBLISHED" as any,
          },
        });
        createdQuestions.push(created);
      }
    }
    console.log(`  ✔ Ensured ${createdQuestions.length} independent question(s) with difficulty levels exist`);

    // 4. Create Default Drive if missing
    let drive = await tx.drive.findFirst({
      where: { name: "Software Developer Drive - July 2026" },
    });
    if (!drive) {
      drive = await tx.drive.create({
        data: {
          name: "Software Developer Drive - July 2026",
          roleTemplateId: roleTemplate.id,
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
        },
      });
    }
    console.log(`  ✔ Linked questions to Drive "${drive.name}"`);

    // ------------------------------------------------------------------
    // 6. Seed Candidates, Sessions, Scores, Flags, and Decisions
    // ------------------------------------------------------------------
    let defaultDrive = await tx.drive.findFirst();
    if (!defaultDrive) {
      defaultDrive = await tx.drive.create({
        data: {
          name: "Software Developer Drive - July 2026",
          roleTemplateId: roleTemplate.id,
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
    }

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
            roleTemplateId: roleTemplate.id,
            driveId: defaultDrive.id,
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
            driveId: defaultDrive.id,
            roleTemplateId: roleTemplate.id,
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
  }, { timeout: 30000 });

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
