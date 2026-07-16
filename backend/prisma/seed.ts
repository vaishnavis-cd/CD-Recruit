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

import { PrismaClient, ModuleType } from "@prisma/client";
import { mcqQuestions } from "./data/mcq";
import { sqlQuestions } from "./data/sql";
import { codingQuestions } from "./data/coding";
import { aiPromptingQuestions } from "./data/aiPrompting";
import { simulationQuestions } from "./data/simulation";

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
  SQL: 0.2,
  CODING: 0.3,
  AI_PROMPTING: 0.2,
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
  content: unknown;
}> {
  return [
    ...mcqQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, content: q.content })),
    ...sqlQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, content: q.content })),
    ...codingQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, content: q.content })),
    ...aiPromptingQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, content: q.content })),
    ...simulationQuestions.map((q) => ({ moduleType: q.moduleType as ModuleType, content: q.content })),
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Starting seed…");

  await prisma.$transaction(async (tx) => {
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
    const existingCount = await tx.question.count();
    const allQuestions = getAllQuestionSeedData();

    if (existingCount > 0) {
      console.log(
        `  ↩ Found ${existingCount} existing question(s) — skipping question seed`,
      );
    } else if (allQuestions.length === 0) {
      console.log(
        "  ⚠ No question seed data found. " +
          "Populate the arrays in backend/prisma/data/*.ts and re-run the seed.",
      );
    } else {
      // Create questions
      const createdQuestions = [];
      for (const q of allQuestions) {
        const created = await tx.question.create({
          data: {
            moduleType: q.moduleType,
            content: q.content as any,
            difficulty: "medium",
            tags: [q.moduleType.toLowerCase()],
            scoringConfig: {},
            version: 1,
            status: "PUBLISHED",
          },
        });
        createdQuestions.push(created);
      }
      console.log(`  ✔ Created ${createdQuestions.length} independent question(s)`);

      // ------------------------------------------------------------------
      // 4. Create Default Drive
      // ------------------------------------------------------------------
      const drive = await tx.drive.create({
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
          scheduleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          createdById: staff.id,
        },
      });
      console.log(`  ✔ Created Drive "${drive.name}" (id: ${drive.id})`);

      // ------------------------------------------------------------------
      // 5. Link Questions to the Drive
      // ------------------------------------------------------------------
      const driveQuestionsData = createdQuestions.map((q) => ({
        driveId: drive.id,
        questionId: q.id,
        moduleType: q.moduleType,
      }));
      await tx.driveQuestion.createMany({
        data: driveQuestionsData,
      });
      console.log(`  ✔ Linked ${driveQuestionsData.length} questions to Drive "${drive.name}"`);
    }
  });

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
