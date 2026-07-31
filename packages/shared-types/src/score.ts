export interface Score {
  coreScore?: number;
  bonusScore?: number;
  totalScore?: number;
  compositeScore: number;
  /** Per-module raw scores keyed by ModuleType string, e.g. { MCQ: 0.85, CODING: 0.72, ... }. */
  moduleScores: Record<string, number>;
  /**
   * Say-Do Consistency score — correlation between how the candidate described their
   * approach (AI_PROMPTING / SIMULATION narrative) and what they actually did (CODING / SQL).
   * Computed by the Correlation Engine in Phase 10.
   */
  sayDoConsistencyScore: number;
  /** Confidence level of the AI grader (0–1). Low confidence flags for human review. */
  aiConfidence: number;
  /** True once a human reviewer has verified and optionally overridden the AI score. */
  humanReviewed: boolean;
  /** Rationale explanation for the Say-Do consistency score. */
  sayDoRationale?: string | null;
  /** The source engine/level used to perform grading. */
  gradingSource?: 'placeholder' | 'deterministic' | 'ai_graded' | 'correlation_engine';
  /** Detected Mismatches between claims and actual actions. */
  mismatches?: Array<{ said: string; did: string; impact: string }>;
}

export interface CompositeScoreResult {
  coreScore: number;
  bonusScore: number;
  totalScore: number;
  compositeScore: number;
  sayDoConsistencyScore: number;
  gradingSource: string;
  sayDoRationale: string;
  moduleScores: Record<string, number>;
}
