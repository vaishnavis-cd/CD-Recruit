import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";

export interface ModuleEvaluationResult<TScoreDetail = any> {
  status: ExecutionStatus;
  score: number; // Normalized 0.0 - 1.0
  scoreDetail: TScoreDetail;
  evaluatedAt: Date;
}

export interface AssessmentModuleEngine<TSubmission = any, TScoreDetail = any> {
  readonly moduleType: ModuleType;

  /**
   * Validate submission payload format for this assessment module.
   */
  validateSubmission(submission: TSubmission): Promise<boolean>;

  /**
   * Grade and evaluate a submission payload for this module.
   */
  evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: TSubmission,
  ): Promise<ModuleEvaluationResult<TScoreDetail>>;
}
