import { ModuleType } from "@prisma/client";

/**
 * SQL question seed data.
 * Each entry maps to a `Question` row with moduleType = SQL.
 *
 * `content` JSON shape for SQL questions:
 * {
 *   prompt:       string;          // scenario description + task instruction
 *   schema:       string;          // DDL / CREATE TABLE statements for the in-browser DB
 *   seedData:     string;          // INSERT statements used to populate the in-browser DB
 *   expectedQuery?: string;        // reference query (server-side validation only, never sent to client)
 *   explanation?: string;          // optional rationale shown post-assessment
 * }
 */
export interface SqlContent {
  prompt: string;
  schema: string;
  seedData: string;
  expectedQuery?: string;
  explanation?: string;
}

export interface SqlSeedEntry {
  moduleType: Extract<ModuleType, "SQL">;
  content: SqlContent;
}

/**
 * Seed data for SQL questions (Software Developer role).
 * Populate this array in the follow-up question-authoring task.
 * Target: 15–20 questions for adequate random-selection headroom (Phase 1 step 4).
 */
export const sqlQuestions: SqlSeedEntry[] = [
  // TODO: add 15-20 Software Developer SQL questions
];
