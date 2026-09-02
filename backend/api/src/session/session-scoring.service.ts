import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { ModuleResponse, CodingExecution, SQLExecution, Question } from "@prisma/client";
import { SemanticAnswerMatcher } from "../test-scenarios/semantic-answer-matcher";

export interface DriveModuleConfigEntry {
  enabled?: boolean;
  isBonus?: boolean;
  weight?: number;
  maxBonusPoints?: number;
  questionWeighting?: {
    mode?: "equal" | "difficulty";
  };
}

export interface CompositeScoreResult {
  coreScore: number | null;
  bonusScore: number | null;
  totalScore: number | null;
  compositeScore: number | null;
  sayDoConsistencyScore: number | null;
  aiConfidence: number | null;
  gradingSource: string;
  sayDoRationale: string | null;
  moduleScores: Record<string, number>;
}

// Local Interfaces for Strong Type Safety
interface QuestionContentOptionObject {
  text?: string;
  label?: string;
}

type QuestionOption = string | QuestionContentOptionObject;

interface QuestionContent {
  correctOption?: string | number;
  correctAnswer?: string | number;
  correctIndex?: number;
  answerIndex?: number;
  options?: QuestionOption[];
  [key: string]: unknown;
}

interface ExecutionResultPayload {
  passed?: boolean;
  matched?: boolean;
  status?: string;
  totalTests?: number;
  passedTests?: number;
}

interface EvaluationPayload {
  overallScore?: number;
}

interface ResponsePayload {
  selectedOptions?: Array<string | number>;
  selectedOption?: string | number;
  selectedOptionIndex?: number;
  selectedIndex?: number;
  executionResult?: ExecutionResultPayload;
  query?: string;
  code?: string;
  evaluation?: EvaluationPayload;
  score?: number;
  overallScore?: number;
  prompt?: string;
  messages?: unknown[];
  actionLog?: unknown[];
  response?: string;
  selfConfidence?: number;
  confidenceLevel?: number;
  expectedScore?: number;
  [key: string]: unknown;
}

interface QuestionScoreItem {
  questionId: string;
  accuracy: number;
  pointShare?: number;
}

// Private Readonly Constants (Replacing Magic Numbers)
const MODULE_SCORING = "module_scoring";
const NO_DATA = "no_data";

const DEFAULT_MCQ_FALLBACK_SCORE = 0.8;
const DEFAULT_CODING_FALLBACK_SCORE = 0.85;

const SQL_STRICT_PASS_SCORE = 1.0;
const SQL_LONG_QUERY_SCORE = 0.8;
const SQL_SHORT_QUERY_SCORE = 0.4;
const SQL_MIN_QUERY_LENGTH = 15;

const CODING_FALLBACK_SCORE = 0.85;
const CODING_MIN_LENGTH = 15;

const AI_PROMPTING_FALLBACK_SCORE = 0.85;
const SIMULATION_FALLBACK_SCORE = 0.85;

const DEFAULT_SAY_DO_VALUE = 0.5;

const AI_CONFIDENCE_COMPLETION_RATIO_WEIGHT = 0.7;
const AI_CONFIDENCE_EXECUTION_BONUS = 0.2;
const DEFAULT_AI_CONFIDENCE_THRESHOLD = 0.8;

@Injectable()
export class SessionScoringService {
  private readonly logger = new Logger(SessionScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Aggregate final scores for a session and compute composite metrics.
   * Evaluates candidate's module responses and test executions.
   */
  async computeSessionScores(sessionId: string): Promise<CompositeScoreResult> {
    const session = await this.loadSession(sessionId);

    const responses = session.moduleResponses || [];
    const codingExecutions = session.codingExecutions || [];
    const sqlExecutions = session.sqlExecutions || [];
    const driveModuleConfig = (session.drive?.moduleConfig as unknown as Record<string, DriveModuleConfigEntry>) || {};
    const driveQuestions = session.drive?.questions || [];
    const dqMap = new Map(driveQuestions.map((dq) => [dq.questionId, dq]));

    // Map pre-grouping for performance optimization (O(1) lookups)
    const codingExecutionsMap = new Map<string, CodingExecution[]>();
    for (const ce of codingExecutions) {
      const list = codingExecutionsMap.get(ce.questionId) || [];
      list.push(ce);
      codingExecutionsMap.set(ce.questionId, list);
    }

    const sqlExecutionsMap = new Map<string, SQLExecution[]>();
    for (const se of sqlExecutions) {
      const list = sqlExecutionsMap.get(se.questionId) || [];
      list.push(se);
      sqlExecutionsMap.set(se.questionId, list);
    }

    // Group responses by module type via Question lookup
    const questionIds = responses.map((r) => r.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
    });
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // Track question-level evaluation results: mod -> array of { questionId, accuracy (0-1), pointShare }
    const moduleQuestionScores: Record<string, QuestionScoreItem[]> = {};

    for (const resp of responses) {
      const q = questionMap.get(resp.questionId);
      if (!q) continue;

      const mod = q.moduleType;
      if (!moduleQuestionScores[mod]) {
        moduleQuestionScores[mod] = [];
      }

      const dq = dqMap.get(q.id);
      const pointShare = dq?.pointShare !== null && dq?.pointShare !== undefined ? Number(dq.pointShare) : undefined;
      const payload = resp.responsePayload as ResponsePayload | null;
      const qContent = (q.content as QuestionContent) || {};

      let accuracy = 0.0;

      if (mod === "MCQ") {
        accuracy = this.evaluateMCQ(payload, qContent, q.scoringConfig);
      } else if (mod === "SQL") {
        accuracy = this.evaluateSQL(payload);
      } else if (mod === "NOSQL") {
        accuracy = this.evaluateNoSQL(payload);
      } else if (mod === "CODING" || (mod as string) === "DEBUGGING") {
        accuracy = this.evaluateCoding(payload, codingExecutionsMap.get(q.id) || []);
      } else if (mod === "AI_PROMPTING") {
        accuracy = this.evaluateAIPrompting(payload);
      } else if (mod === "SIMULATION") {
        accuracy = this.evaluateSimulation(payload);
      } else if (mod === "TEST_SCENARIOS") {
        accuracy = this.evaluateTestScenarios(payload, q);
      }

      moduleQuestionScores[mod].push({
        questionId: q.id,
        accuracy: Math.max(0.0, Math.min(1.0, accuracy)),
        pointShare,
      });
    }

    const moduleScores = this.calculateModuleScores(moduleQuestionScores, driveModuleConfig);
    const { coreScore, bonusScore, totalScore, compositeScore } = this.calculateCompositeScores(moduleScores, driveModuleConfig);
    const { sayDoConsistencyScore, sayDoRationale } = this.calculateSayDoConsistency(
      responses,
      questionMap,
      codingExecutionsMap,
      sqlExecutionsMap,
      moduleScores,
      compositeScore,
    );

    const hasExecutions = codingExecutions.length > 0 || sqlExecutions.length > 0;
    const aiConfidence = this.calculateAIConfidence(responses.length, questionIds.length, hasExecutions);

    const hasNoData = responses.length === 0;
    const gradingSource = !hasNoData ? MODULE_SCORING : NO_DATA;

    const result: CompositeScoreResult = {
      coreScore: hasNoData ? null : coreScore,
      bonusScore: hasNoData ? null : bonusScore,
      totalScore: hasNoData ? null : totalScore,
      compositeScore: hasNoData ? null : compositeScore,
      sayDoConsistencyScore,
      aiConfidence,
      gradingSource,
      sayDoRationale,
      moduleScores,
    };

    this.logger.debug(
      `Computed session scores for session ${sessionId}: compositeScore=${compositeScore}, aiConfidence=${aiConfidence}, modulesCount=${Object.keys(moduleScores).length}`,
    );

    await this.saveScores(sessionId, result);

    return result;
  }

  /**
   * Load session from database with all relations required for scoring.
   */
  private async loadSession(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        score: true,
        moduleResponses: true,
        codingExecutions: true,
        sqlExecutions: true,
        drive: {
          include: {
            questions: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    return session;
  }

  /**
   * Helper to round numeric values to two decimal places.
   */
  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Extract selected options from MCQ payload as string array.
   */
  private extractSelectedOptions(payload: ResponsePayload | null): string[] {
    if (!payload) return [];
    if (Array.isArray(payload.selectedOptions)) {
      return payload.selectedOptions.map(String);
    }
    if (payload.selectedOption !== undefined && payload.selectedOption !== null) {
      return [String(payload.selectedOption)];
    }
    if (payload.selectedOptionIndex !== undefined) {
      return [`opt_${payload.selectedOptionIndex}`, String(payload.selectedOptionIndex)];
    }
    if (payload.selectedIndex !== undefined) {
      return [`opt_${payload.selectedIndex}`, String(payload.selectedIndex)];
    }
    return [];
  }

  /**
   * Evaluate NOSQL module accuracy (0.0 to 1.0).
   */
  private evaluateNoSQL(payload: ResponsePayload | null): number {
    const execResult = payload?.executionResult;
    if (execResult?.passed || execResult?.status === "SUCCESS") {
      return 1.0;
    }
    return 0.0;
  }

  /**
   * Evaluate MCQ module accuracy (0.0 to 1.0).
   */
  private evaluateMCQ(payload: ResponsePayload | null, qContent: QuestionContent, scoringConfig?: any): number {
    const selectedList = this.extractSelectedOptions(payload);
    if (selectedList.length === 0) return 0.0;

    const correctTarget =
      qContent.correctOption ??
      qContent.correctAnswer ??
      qContent.correctIndex ??
      qContent.answerIndex ??
      scoringConfig?.correctAnswer ??
      scoringConfig?.correctIndex ??
      0;
    const options = Array.isArray(qContent.options) ? qContent.options : [];

    const isCorrect = selectedList.some((sel) => {
      const cleanSel = sel.trim().toLowerCase();
      // Direct string comparison
      if (typeof correctTarget === "string" && cleanSel === correctTarget.trim().toLowerCase()) return true;
      if (sel === String(correctTarget)) return true;

      // opt_X comparison
      if (/^opt_\d+$/i.test(sel)) {
        const idx = parseInt(sel.replace(/opt_/i, ""), 10);
        if (typeof correctTarget === "number" && idx === Number(correctTarget)) return true;
        if (scoringConfig && typeof scoringConfig.correctIndex === "number" && idx === scoringConfig.correctIndex) return true;
        if (options[idx]) {
          const optVal = typeof options[idx] === "string" ? options[idx] : (options[idx] as any).text || (options[idx] as any).label;
          if (typeof correctTarget === "string" && optVal && optVal.trim().toLowerCase() === correctTarget.trim().toLowerCase()) return true;
          if (scoringConfig?.correctAnswer && typeof scoringConfig.correctAnswer === "string" && optVal && optVal.trim().toLowerCase() === scoringConfig.correctAnswer.trim().toLowerCase()) return true;
        }
      }

      // Check numeric index match to options array
      if (typeof correctTarget === "number" && options[correctTarget]) {
        const targetOpt = options[correctTarget];
        const optText = typeof targetOpt === "string" ? targetOpt : (targetOpt as any).text || (targetOpt as any).label;
        if (optText && optText.trim().toLowerCase() === cleanSel) return true;
      }

      // Check scoringConfig text match
      if (scoringConfig?.correctAnswer && typeof scoringConfig.correctAnswer === "string") {
        if (cleanSel === scoringConfig.correctAnswer.trim().toLowerCase()) return true;
      }

      return false;
    });

    return isCorrect ? 1.0 : 0.0;
  }

  /**
   * Evaluate SQL module accuracy (0.0 to 1.0).
   */
  private evaluateSQL(payload: ResponsePayload | null): number {
    const execResult = payload?.executionResult;
    if (execResult?.passed || execResult?.matched || execResult?.status === "SUCCESS") {
      return SQL_STRICT_PASS_SCORE;
    }
    const query = payload?.query || payload?.code || "";
    const trimmedLen = query.trim().length;
    if (trimmedLen > SQL_MIN_QUERY_LENGTH) {
      return SQL_LONG_QUERY_SCORE;
    }
    if (trimmedLen > 0) {
      return SQL_SHORT_QUERY_SCORE;
    }
    return 0.0;
  }

  /**
   * Evaluate CODING/DEBUGGING module accuracy (0.0 to 1.0).
   */
  private evaluateCoding(payload: ResponsePayload | null, questionExecutions: CodingExecution[] = []): number {
    const latestExec = questionExecutions.length > 0 ? questionExecutions[questionExecutions.length - 1] : null;
    const execResult = payload?.executionResult;

    if (latestExec && latestExec.totalTests > 0) {
      return latestExec.passedTests / latestExec.totalTests;
    }
    if (execResult && typeof execResult.totalTests === "number" && execResult.totalTests > 0 && typeof execResult.passedTests === "number") {
      return execResult.passedTests / execResult.totalTests;
    }
    const code = payload?.code || "";
    if (code.trim().length > CODING_MIN_LENGTH) {
      return CODING_FALLBACK_SCORE;
    }
    return 0.0;
  }

  /**
   * Evaluate AI_PROMPTING module accuracy (0.0 to 1.0).
   */
  private evaluateAIPrompting(payload: ResponsePayload | null): number {
    const evalScore =
      (payload as any)?.promptStructureScore ??
      (payload as any)?.aiValidationScore ??
      payload?.evaluation?.overallScore ??
      payload?.score ??
      payload?.overallScore;
    if (typeof evalScore === "number") {
      return evalScore > 1 ? evalScore / 100 : evalScore;
    }
    if (payload?.prompt || payload?.messages || payload?.response) {
      return 0.75;
    }
    return 0.0;
  }

  /**
   * Evaluate SIMULATION module accuracy (0.0 to 1.0).
   */
  private evaluateSimulation(payload: ResponsePayload | null): number {
    const evalScore =
      payload?.overallScore ??
      (payload as any)?.compositeDoScore ??
      (payload as any)?.evaluation?.overallScore ??
      payload?.evaluation?.overallScore ??
      payload?.score;
    if (typeof evalScore === "number") {
      return evalScore > 1 ? evalScore / 100 : evalScore;
    }
    if (payload?.messages || payload?.actionLog || payload?.response) {
      return SIMULATION_FALLBACK_SCORE;
    }
    return 0.0;
  }

  /**
   * Evaluate TEST_SCENARIOS module accuracy (0.0 to 1.0).
   */
  private evaluateTestScenarios(payload: ResponsePayload | null, question?: any): number {
    const evalScore = payload?.evaluation?.overallScore ?? payload?.score ?? payload?.overallScore;
    if (typeof evalScore === "number") {
      return evalScore > 1 ? evalScore / 100 : evalScore;
    }

    const qContent = question?.content || {};
    const expected = String(qContent.expectedAnswer || qContent.correctAnswer || "");
    const answer = String(payload?.answer || payload?.text || "");

    const matchRes = SemanticAnswerMatcher.matchAnswer(answer, expected);
    return matchRes.score / 100;
  }

  /**
   * Compute normalized score per module (0.0 to 1.0).
   */
  private calculateModuleScores(
    moduleQuestionScores: Record<string, QuestionScoreItem[]>,
    driveModuleConfig: Record<string, DriveModuleConfigEntry>,
  ): Record<string, number> {
    const moduleScores: Record<string, number> = {};

    for (const [mod, qScores] of Object.entries(moduleQuestionScores)) {
      if (qScores.length === 0) continue;

      const conf = driveModuleConfig[mod];
      const mode = conf?.questionWeighting?.mode || "equal";
      const hasCustomShares = qScores.some((qs) => qs.pointShare !== undefined && qs.pointShare !== null);

      if (mode === "difficulty" && hasCustomShares) {
        const totalShareSum = qScores.reduce((sum, qs) => sum + (qs.pointShare || 0), 0);
        const earnedShareSum = qScores.reduce((sum, qs) => sum + qs.accuracy * (qs.pointShare || 0), 0);
        moduleScores[mod] = totalShareSum > 0 ? this.roundToTwoDecimals(earnedShareSum / totalShareSum) : 0.0;
      } else {
        const totalAcc = qScores.reduce((sum, qs) => sum + qs.accuracy, 0);
        moduleScores[mod] = this.roundToTwoDecimals(totalAcc / qScores.length);
      }
    }

    return moduleScores;
  }

  /**
   * Compute core, bonus, total, and composite scores (out of 100%).
   */
  private calculateCompositeScores(
    moduleScores: Record<string, number>,
    driveModuleConfig: Record<string, DriveModuleConfigEntry>,
  ) {
    let coreScore = 0;
    let bonusScore = 0;
    let totalWeightApplied = 0;

    const presentMods = Object.keys(moduleScores);
    const enabledConfigs = Object.entries(driveModuleConfig).filter(
      ([_, c]) => c && c.enabled && typeof c.weight === "number" && c.weight > 0,
    );

    if (enabledConfigs.length > 0) {
      for (const [modKey, normalizedScore] of Object.entries(moduleScores)) {
        const conf = driveModuleConfig[modKey];
        if (!conf || !conf.enabled) continue;
        if (conf.isBonus) {
          bonusScore += normalizedScore * (conf.maxBonusPoints ?? 0);
        } else {
          coreScore += normalizedScore * (conf.weight ?? 0);
          totalWeightApplied += (conf.weight ?? 0);
        }
      }

      // If weights were fractional (sum <= 1.0, e.g. 0.20, 0.30, 0.50), normalize to 100
      if (totalWeightApplied <= 1.0 && totalWeightApplied > 0) {
        coreScore = (coreScore / totalWeightApplied) * 100;
      }
    } else if (presentMods.length > 0) {
      // Default fallback: Equal weighting across all attempted/present modules
      const sum = presentMods.reduce((acc, m) => acc + (moduleScores[m] || 0), 0);
      coreScore = (sum / presentMods.length) * 100;
    }

    coreScore = this.roundToTwoDecimals(coreScore);
    bonusScore = this.roundToTwoDecimals(bonusScore);
    const totalScore = this.roundToTwoDecimals(coreScore + bonusScore);
    const compositeScore = totalScore;

    return { coreScore, bonusScore, totalScore, compositeScore };
  }

  /**
   * Compute authentic Say-Do consistency metric and rationale.
   */
  private calculateSayDoConsistency(
    responses: ModuleResponse[],
    questionMap: Map<string, Question>,
    codingExecutionsMap: Map<string, CodingExecution[]>,
    sqlExecutionsMap: Map<string, SQLExecution[]>,
    moduleScores: Record<string, number>,
    compositeScore: number,
  ): { sayDoConsistencyScore: number | null; sayDoRationale: string | null } {
    const sayDoDivergences: number[] = [];

    for (const resp of responses) {
      const payload = resp.responsePayload as ResponsePayload | null;
      const q = questionMap.get(resp.questionId);
      if (!q || !payload) continue;

      const sayValue = payload.selfConfidence ?? payload.confidenceLevel ?? payload.expectedScore;
      if (typeof sayValue === "number") {
        const normalizedSay = sayValue > 1 ? sayValue / 100 : sayValue;

        let doValue = DEFAULT_SAY_DO_VALUE;
        if (q.moduleType === "MCQ") {
          const selectedIndex = payload.selectedOptionIndex ?? payload.selectedIndex;
          const qContent = (q.content as QuestionContent) || {};
          const correctIndex = qContent.correctIndex ?? qContent.answerIndex ?? 0;
          doValue = selectedIndex === correctIndex ? 1.0 : 0.0;
        } else if (q.moduleType === "CODING") {
          const execs = codingExecutionsMap.get(q.id) || [];
          const lastExec = execs.length > 0 ? execs[execs.length - 1] : null;
          doValue = lastExec && lastExec.totalTests > 0 ? lastExec.passedTests / lastExec.totalTests : 0.0;
        } else if (q.moduleType === "SQL") {
          const sqlExecs = sqlExecutionsMap.get(q.id) || [];
          const lastSql = sqlExecs.length > 0 ? sqlExecs[sqlExecs.length - 1] : null;
          doValue = lastSql ? (lastSql.status === "COMPLETED" ? 1.0 : 0.0) : 0.0;
        } else if (q.moduleType === "NOSQL") {
          const execResult = payload?.executionResult;
          doValue = execResult?.passed ? 1.0 : 0.0;
        } else if (q.moduleType === "SIMULATION") {
          const simScore = (payload as any)?.sayDoScore ?? (payload as any)?.sayDoCorrelationScore ?? (payload as any)?.evaluation?.sayDoCorrelation?.score;
          if (typeof simScore === "number") {
            doValue = simScore > 1 ? simScore / 100 : simScore;
          } else {
            doValue = payload?.executionResult?.passed ? 1.0 : 0.0;
          }
        } else {
          doValue = 0.0;
        }

        const divergence = Math.abs(normalizedSay - doValue);
        sayDoDivergences.push(divergence);
      }
    }

    let sayDoConsistencyScore: number | null;
    let sayDoRationale: string | null;

    const scoreValues = Object.values(moduleScores);
    if (sayDoDivergences.length > 0) {
      const meanDivergence = sayDoDivergences.reduce((a, b) => a + b, 0) / sayDoDivergences.length;
      sayDoConsistencyScore = Math.max(0.0, this.roundToTwoDecimals(1.0 - meanDivergence));
      sayDoRationale = `Calculated from ${sayDoDivergences.length} candidate self-assessments ("Say") vs actual execution results ("Do").`;
    } else if (scoreValues.length > 1) {
      const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
      const variance = scoreValues.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scoreValues.length;
      const stdDev = Math.sqrt(variance);
      sayDoConsistencyScore = Math.max(0.0, this.roundToTwoDecimals(1.0 - stdDev));
      sayDoRationale = `Computed from cross-module domain performance stability (standard deviation: ${this.roundToTwoDecimals(stdDev)}).`;
    } else {
      sayDoConsistencyScore = 0.0;
      sayDoRationale = "Single module assessment or insufficient Say-Do variance data.";
    }

    return { sayDoConsistencyScore, sayDoRationale };
  }

  /**
   * Compute dynamic AI Confidence score based on evaluation completeness and test executions.
   */
  private calculateAIConfidence(responsesCount: number, questionIdsCount: number, hasExecutions: boolean): number | null {
    if (responsesCount === 0) return 0.0;

    const completionRatio = Math.min(1.0, responsesCount / Math.max(1, questionIdsCount));
    const executionBonus = hasExecutions ? AI_CONFIDENCE_EXECUTION_BONUS : 0.0;
    const rawConfidence = AI_CONFIDENCE_COMPLETION_RATIO_WEIGHT * completionRatio + executionBonus;

    return Math.min(1.0, this.roundToTwoDecimals(rawConfidence));
  }

  /**
   * Persist computed scores in database and route confidence gating.
   */
  async saveScores(sessionId: string, scoreData: CompositeScoreResult): Promise<void> {
    const existing = await this.prisma.score.findUnique({ where: { sessionId } });
    if (existing && existing.humanReviewed) {
      this.logger.debug(`[saveScores] Preserving existing human-reviewed score for session ${sessionId}`);
      return;
    }

    const scoringConfig = await this.settingsService.getScoringConfig();
    const threshold = scoringConfig.aiConfidenceThreshold ?? DEFAULT_AI_CONFIDENCE_THRESHOLD;
    const isAutoPublished = (scoreData.aiConfidence ?? 0) >= threshold;

    const data = {
      compositeScore: scoreData.compositeScore ?? 0.0,
      coreScore: scoreData.coreScore ?? 0.0,
      bonusScore: scoreData.bonusScore ?? 0.0,
      totalScore: scoreData.totalScore ?? 0.0,
      sayDoConsistencyScore: scoreData.sayDoConsistencyScore ?? 0.0,
      aiConfidence: scoreData.aiConfidence ?? 0.0,
      humanReviewed: isAutoPublished,
      gradingSource: scoreData.gradingSource,
      sayDoRationale: scoreData.sayDoRationale,
      moduleScores: scoreData.moduleScores as any,
    };

    await this.prisma.score.upsert({
      where: { sessionId },
      create: {
        session: { connect: { id: sessionId } },
        ...data,
      },
      update: data,
    });
  }
}
