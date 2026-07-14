import { ModuleType } from "@prisma/client";

/**
 * AI Prompting question seed data.
 * Each entry maps to a `Question` row with moduleType = AI_PROMPTING.
 *
 * `content` JSON shape for AI Prompting questions:
 * {
 *   prompt:     string;    // scenario description — what the candidate must achieve by prompting an AI
 *   context?:   string;    // background context or constraints the candidate should consider
 *   rubric:     RubricCriteria[]; // grading rubric passed to the Claude API for automated scoring
 *   explanation?: string;  // optional rationale shown post-assessment
 * }
 */
export interface RubricCriteria {
  criterion: string;   // what is being evaluated, e.g. "Clarity", "Specificity"
  weight: number;      // relative weight 0-1; all weights in a question should sum to 1
  description: string; // detailed description of what a full-marks response looks like
}

export interface AiPromptingContent {
  prompt: string;
  context?: string;
  rubric: RubricCriteria[];
  explanation?: string;
}

export interface AiPromptingSeedEntry {
  moduleType: Extract<ModuleType, "AI_PROMPTING">;
  content: AiPromptingContent;
}

/**
 * Seed data for AI Prompting questions (Software Developer role).
 * Populate this array in the follow-up question-authoring task.
 * Target: 15–20 questions for adequate random-selection headroom (Phase 1 step 4).
 */
export const aiPromptingQuestions: AiPromptingSeedEntry[] = [
  // TODO: add 15-20 Software Developer AI Prompting questions
];
