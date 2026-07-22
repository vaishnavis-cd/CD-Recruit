import { ModuleType } from "./enums";

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface TestCase {
  input: string;
  expectedOutput: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Per-module question content (client-facing shapes)
//
// IMPORTANT — server-only fields are EXCLUDED here:
//   MCQ       → correctIndex & explanation omitted (never sent to candidate)
//   SQL       → expectedQuery omitted
//   CODING    → hiddenTests omitted
// These fields exist only in the seed data and server-side grading logic.
// ---------------------------------------------------------------------------

export interface McqQuestionContent {
  moduleType: ModuleType.MCQ;
  prompt: string;
  /** Ordered answer choices; candidate submits the 0-based selectedIndex. */
  options: string[];
}

export interface SqlQuestionContent {
  moduleType: ModuleType.SQL;
  /** Scenario description and task instruction shown to the candidate. */
  prompt: string;
  /** DDL CREATE TABLE statements for the in-browser SQL sandbox. */
  schema: string;
  /** INSERT statements that seed the in-browser sandbox before the candidate runs queries. */
  seedData: string;
}

export interface CodingQuestionContent {
  moduleType: ModuleType.CODING;
  prompt: string;
  /**
   * Starter code templates keyed by language slug, e.g. { python: "def solve(...):\n    pass" }.
   * May be empty if no starter code is provided for a given language.
   */
  starterCode: Record<string, string>;
  /** Visible test cases the candidate can run against their solution. */
  testCases: TestCase[];
  /** Constraints shown alongside the problem statement, e.g. ["1 ≤ n ≤ 10^5", "Time limit: 2s"]. */
  constraints: string[];
  difficulty: "easy" | "medium" | "hard";
}

/** Flexible rubric JSON — actual scoring logic defined in Phase 10 (Correlation Engine). */
export interface AiPromptingRubric {
  evaluationCriteria: string[];
  idealResponseSummary: string;
}

export interface AiPromptingQuestionContent {
  moduleType: ModuleType.AI_PROMPTING;
  /** The task scenario the candidate must achieve by crafting an AI prompt. */
  prompt: string;
  /** Optional background context or constraints. */
  context?: string;
  /**
   * Lightweight grading guidance for human reviewers / Claude API.
   * Schema intentionally kept flexible — Phase 10 will extend without a migration.
   */
  rubric: AiPromptingRubric;
}

export interface SimulationTrigger {
  type: "email" | "slack" | "ticket";
  from: string;
  subject?: string;
  body: string;
  /** ISO-8601 timestamp; drives display order and "when did this arrive" context. */
  timestamp: string;
}

export interface SimulationRubricCriteria {
  criterion: string;
  weight: number;
  description: string;
}

export interface SimulationQuestionContent {
  moduleType: ModuleType.SIMULATION;
  title: string;
  description: string;
  triggers: SimulationTrigger[];
  rubric: SimulationRubricCriteria[];
}

// ---------------------------------------------------------------------------
// Discriminated union — key on moduleType literal
// ---------------------------------------------------------------------------

/**
 * Full discriminated union of all module question content shapes.
 * Use `content.moduleType` as the discriminant in switch statements.
 */
export type QuestionContent =
  | McqQuestionContent
  | SqlQuestionContent
  | CodingQuestionContent
  | AiPromptingQuestionContent
  | SimulationQuestionContent;

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

/** Lightweight metadata returned in the session progress / question list. */
export interface QuestionSummary {
  questionId: string;
  moduleType: ModuleType;
  /** Index within the module (0-based), used for free-navigation addressing. */
  moduleIndex: number;
  content?: any;
}

/** Full question payload returned by GET /sessions/:id/questions/:questionId. */
export interface GetQuestionResponse {
  questionId: string;
  roleTemplateId: string;
  content: QuestionContent;
}
