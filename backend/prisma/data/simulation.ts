import { ModuleType } from "@prisma/client";

/**
 * Contextual Simulation question seed data.
 * Each entry maps to a `Question` row with moduleType = SIMULATION.
 *
 * `content` JSON shape for Simulation questions:
 * {
 *   title:       string;           // short name for this scenario, e.g. "Production Incident"
 *   description: string;           // framing text shown before the simulation starts
 *   triggers:    SimulationTrigger[];  // ordered sequence of in-scenario events/messages
 *   rubric:      RubricCriteria[];     // grading rubric for the Correlation Engine
 *   explanation?: string;          // optional rationale shown post-assessment
 * }
 *
 * Trigger types drive what UI component is rendered on the candidate side:
 *   "email"  → mock email thread
 *   "slack"  → mock Slack message
 *   "ticket" → mock Jira/linear-style ticket
 */
export interface SimulationTrigger {
  type: "email" | "slack" | "ticket";
  from: string;       // sender name / handle
  subject?: string;   // email subject line (email only)
  body: string;       // message body
  timestamp: string;  // ISO-8601; drives display order and "when did this arrive" context
}

export interface RubricCriteria {
  criterion: string;
  weight: number;      // 0-1; all weights in a question should sum to 1
  description: string;
}

export interface SimulationContent {
  title: string;
  description: string;
  triggers: SimulationTrigger[];
  rubric: RubricCriteria[];
  explanation?: string;
}

export interface SimulationSeedEntry {
  moduleType: Extract<ModuleType, "SIMULATION">;
  content: SimulationContent;
}

/**
 * Seed data for Contextual Simulation questions (Software Developer role).
 * Populate this array in the follow-up question-authoring task.
 * Target: 15–20 questions for adequate random-selection headroom (Phase 1 step 4).
 */
export const simulationQuestions: SimulationSeedEntry[] = [
  // TODO: add 15-20 Software Developer Simulation scenarios
];
