import { ModuleType } from "@prisma/client";

/**
 * Coding/DSA question seed data.
 * Each entry maps to a `Question` row with moduleType = CODING.
 *
 * `content` JSON shape for Coding questions:
 * {
 *   prompt:        string;         // problem statement shown to the candidate
 *   starterCode?:  Record<string, string>; // keyed by language slug, e.g. { python: "def solve(...):\n    pass" }
 *   testCases:     TestCase[];     // public test cases shown to the candidate
 *   hiddenTests?:  TestCase[];     // private test cases used by Judge0 for final grading (server-side only)
 *   constraints?:  string[];       // e.g. ["1 <= n <= 10^5", "Time limit: 2s"]
 *   difficulty:    "easy" | "medium" | "hard";
 *   explanation?:  string;         // optional rationale shown post-assessment
 * }
 */
export interface TestCase {
  input: string;
  expectedOutput: string;
  label?: string;
}

export interface CodingContent {
  prompt: string;
  starterCode?: Record<string, string>;
  testCases: TestCase[];
  hiddenTests?: TestCase[];
  constraints?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
}

export interface CodingSeedEntry {
  moduleType: Extract<ModuleType, "CODING">;
  content: CodingContent;
}

/**
 * Seed data for Coding/DSA questions (Software Developer role).
 * Populate this array in the follow-up question-authoring task.
 * Target: 15–20 questions for adequate random-selection headroom (Phase 1 step 4).
 */
export const codingQuestions: CodingSeedEntry[] = [
  // TODO: add 15-20 Software Developer Coding/DSA questions
];
