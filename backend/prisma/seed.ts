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
    // 1. Upsert RoleTemplate
    //    schema.prisma has no @unique on roleName, so we use findFirst
    //    and create only when absent — making the operation idempotent.
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
    // 2. Seed Questions
    //    Guard: skip if this template already has questions, so re-running
    //    the seed does not create duplicates (Question has no natural unique
    //    constraint in the schema — guard is count-based).
    // ------------------------------------------------------------------
    const existingCount = await tx.question.count({
      where: { roleTemplateId: roleTemplate.id },
    });

    const allQuestions = getAllQuestionSeedData();

    if (existingCount > 0) {
      console.log(
        `  ↩ Found ${existingCount} existing question(s) for "${ROLE_NAME}" — skipping question seed`,
      );
    } else if (allQuestions.length === 0) {
      console.log(
        "  ⚠ No question seed data found. " +
          "Populate the arrays in backend/prisma/data/*.ts and re-run the seed.",
      );
    } else {
      // Create all questions linked to the RoleTemplate in a single batch.
      const result = await tx.question.createMany({
        data: allQuestions.map((q) => ({
          roleTemplateId: roleTemplate.id,
          moduleType: q.moduleType,
          content: q.content,
        })),
      });
      console.log(`  ✔ Created ${result.count} question(s) for "${ROLE_NAME}"`);

      // Log per-module breakdown for visibility.
      const breakdown = allQuestions.reduce<Partial<Record<ModuleType, number>>>(
        (acc, q) => {
          acc[q.moduleType] = (acc[q.moduleType] ?? 0) + 1;
          return acc;
        },
        {},
      );
      for (const [moduleType, count] of Object.entries(breakdown)) {
        console.log(`     • ${moduleType}: ${count}`);
      }
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
