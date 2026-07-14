import { ModuleType } from "@prisma/client";

/**
 * MCQ question seed data.
 * Each entry maps to a `Question` row with moduleType = MCQ.
 *
 * `content` JSON shape for MCQ questions:
 * {
 *   prompt:       string;          // question text shown to the candidate
 *   options:      string[];        // ordered list of answer choices (A, B, C, D …)
 *   correctIndex: number;          // 0-based index of the correct option
 *   explanation?: string;          // optional rationale shown post-assessment
 * }
 */
export interface McqContent {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface McqSeedEntry {
  moduleType: Extract<ModuleType, "MCQ">;
  content: McqContent;
}

/**
 * Seed data for MCQ questions (Software Developer role).
 * Populate this array in the follow-up question-authoring task.
 * Target: 15–20 questions for adequate random-selection headroom (Phase 1 step 4).
 */
export const mcqQuestions: McqSeedEntry[] = [
  // TODO: add 15-20 Software Developer MCQ questions
];
