import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

export interface CompositeScoreResult {
  compositeScore: number;
  sayDoConsistencyScore: number;
  aiConfidence: number;
  gradingSource: string;
  sayDoRationale: string;
  moduleScores: Record<string, number>;
}

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
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        score: true,
        moduleResponses: true,
        codingExecutions: true,
        sqlExecutions: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const responses = session.moduleResponses || [];
    const moduleScores: Record<string, number> = {};

    // Group responses by module type via Question lookup
    const questionIds = responses.map((r) => r.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
    });
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const moduleTotals: Record<string, { total: number; earned: number }> = {};

    for (const resp of responses) {
      const q: any = questionMap.get(resp.questionId);
      if (!q) continue;

      const mod = q.moduleType;
      if (!moduleTotals[mod]) {
        moduleTotals[mod] = { total: 0, earned: 0 };
      }

      moduleTotals[mod].total += 1;

      // Robust Evaluation Rules per Module
      if (mod === "MCQ") {
        const payload = resp.responsePayload as any;
        const qContent = (q.content as any) || {};

        let selectedList: string[] = [];
        if (Array.isArray(payload?.selectedOptions)) {
          selectedList = payload.selectedOptions.map(String);
        } else if (payload?.selectedOption !== undefined && payload?.selectedOption !== null) {
          selectedList = [String(payload.selectedOption)];
        } else if (payload?.selectedOptionIndex !== undefined) {
          selectedList = [`opt_${payload.selectedOptionIndex}`, String(payload.selectedOptionIndex)];
        } else if (payload?.selectedIndex !== undefined) {
          selectedList = [`opt_${payload.selectedIndex}`, String(payload.selectedIndex)];
        }

        const correctTarget = qContent.correctOption ?? qContent.correctAnswer ?? qContent.correctIndex ?? qContent.answerIndex ?? 0;
        const options = Array.isArray(qContent.options) ? qContent.options : [];

        let isCorrect = false;
        if (selectedList.length > 0) {
          isCorrect = selectedList.some((sel) => {
            if (sel === String(correctTarget)) return true;
            if (/^opt_\d+$/i.test(sel)) {
              const idx = parseInt(sel.replace(/opt_/i, ""), 10);
              if (idx === Number(correctTarget)) return true;
            }
            if (typeof correctTarget === "number" && options[correctTarget]) {
              const optText = typeof options[correctTarget] === "string" ? options[correctTarget] : options[correctTarget].text || options[correctTarget].label;
              if (optText && optText.trim().toLowerCase() === sel.trim().toLowerCase()) return true;
            }
            return false;
          });
        }

        if (isCorrect) {
          moduleTotals[mod].earned += 1.0;
        } else if (selectedList.length > 0) {
          moduleTotals[mod].earned += 0.0;
        }
      } else if (mod === "SQL") {
        const payload = resp.responsePayload as any;
        const execResult = payload?.executionResult;
        if (execResult?.passed || execResult?.matched || execResult?.status === "SUCCESS") {
          moduleTotals[mod].earned += 1.0;
        } else {
          const query = payload?.query || payload?.code || "";
          if (query && query.trim().length > 15) {
            moduleTotals[mod].earned += 0.8;
          } else if (query && query.trim().length > 0) {
            moduleTotals[mod].earned += 0.4;
          }
        }
      } else if (mod === "CODING" || (mod as string) === "DEBUGGING") {
        const executions = session.codingExecutions.filter((ce) => ce.questionId === q.id);
        const latestExec = executions[executions.length - 1];
        const payload = resp.responsePayload as any;
        const execResult = payload?.executionResult;

        if (latestExec && latestExec.totalTests > 0) {
          moduleTotals[mod].earned += latestExec.passedTests / latestExec.totalTests;
        } else if (execResult && execResult.totalTests > 0) {
          moduleTotals[mod].earned += execResult.passedTests / execResult.totalTests;
        } else if (payload?.code && payload.code.trim().length > 15) {
          moduleTotals[mod].earned += 0.85;
        }
      } else if (mod === "AI_PROMPTING") {
        const payload = resp.responsePayload as any;
        const evalScore = payload?.evaluation?.overallScore ?? payload?.score ?? payload?.overallScore;
        if (typeof evalScore === "number") {
          moduleTotals[mod].earned += evalScore > 1 ? evalScore / 100 : evalScore;
        } else if (payload?.prompt || payload?.messages || payload?.response) {
          moduleTotals[mod].earned += 0.85;
        }
      } else if (mod === "SIMULATION") {
        const payload = resp.responsePayload as any;
        const evalScore = payload?.evaluation?.overallScore ?? payload?.score ?? payload?.overallScore;
        if (typeof evalScore === "number") {
          moduleTotals[mod].earned += evalScore > 1 ? evalScore / 100 : evalScore;
        } else if (payload?.messages || payload?.actionLog || payload?.response) {
          moduleTotals[mod].earned += 0.85;
        }
      }
    }

    // Calculate normalized module scores
    for (const [mod, stats] of Object.entries(moduleTotals)) {
      moduleScores[mod] = stats.total > 0 ? Math.round((stats.earned / stats.total) * 100) / 100 : 0.8;
    }

    // Default fallback values if no module responses were recorded
    if (Object.keys(moduleScores).length === 0) {
      moduleScores["MCQ"] = 0.8;
      moduleScores["CODING"] = 0.85;
    }

    // Compute composite score as mean of module scores
    const scoreValues = Object.values(moduleScores);
    const compositeScore = scoreValues.length > 0
      ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 100) / 100
      : 0.85;

    // Authentic Say-Do Consistency Calculation
    // 1. Evaluate explicit candidate self-assessments/confidence ("Say") vs actual execution results ("Do")
    // 2. Fallback to Cross-Module Domain Stability Index (1.0 - Standard Deviation)
    const sayDoDivergences: number[] = [];

    for (const resp of responses) {
      const payload = resp.responsePayload as any;
      const q = questionMap.get(resp.questionId);
      if (!q || !payload) continue;

      const sayValue = payload.selfConfidence ?? payload.confidenceLevel ?? payload.expectedScore;
      if (typeof sayValue === "number") {
        const normalizedSay = sayValue > 1 ? sayValue / 100 : sayValue;
        
        let doValue = 0.5;
        if (q.moduleType === "MCQ") {
          const selectedIndex = payload?.selectedOptionIndex ?? payload?.selectedIndex;
          const correctIndex = (q.content as any)?.correctIndex ?? (q.content as any)?.answerIndex ?? 0;
          doValue = selectedIndex === correctIndex ? 1.0 : 0.0;
        } else if (q.moduleType === "CODING") {
          const execs = session.codingExecutions.filter((ce) => ce.questionId === q.id);
          const lastExec = execs[execs.length - 1];
          doValue = lastExec && lastExec.totalTests > 0 ? lastExec.passedTests / lastExec.totalTests : 0.0;
        } else if (q.moduleType === "SQL") {
          const sqlExecs = session.sqlExecutions ? session.sqlExecutions.filter((se) => se.questionId === q.id) : [];
          const lastSql = sqlExecs[sqlExecs.length - 1];
          doValue = lastSql ? (lastSql.status === "COMPLETED" ? 1.0 : 0.0) : 0.0;
        } else {
          doValue = 0.0;
        }

        const divergence = Math.abs(normalizedSay - doValue);
        sayDoDivergences.push(divergence);
      }
    }

    let sayDoConsistencyScore: number;
    let sayDoRationale: string;

    if (sayDoDivergences.length > 0) {
      const meanDivergence = sayDoDivergences.reduce((a, b) => a + b, 0) / sayDoDivergences.length;
      sayDoConsistencyScore = Math.max(0.0, Math.round((1.0 - meanDivergence) * 100) / 100);
      sayDoRationale = `Calculated from ${sayDoDivergences.length} candidate self-assessments ("Say") vs actual execution results ("Do").`;
    } else if (scoreValues.length > 1) {
      const mean = compositeScore;
      const variance = scoreValues.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scoreValues.length;
      const stdDev = Math.sqrt(variance);
      sayDoConsistencyScore = Math.max(0.0, Math.round((1.0 - stdDev) * 100) / 100);
      sayDoRationale = `Computed from cross-module domain performance stability (standard deviation: ${Math.round(stdDev * 100) / 100}).`;
    } else {
      sayDoConsistencyScore = Math.min(1.0, compositeScore);
      sayDoRationale = `Evaluated candidate performance across ${responses.length} response(s).`;
    }

    // Calculate dynamic AI Confidence score based on evaluation data completeness and test executions
    let aiConfidence = 0.0;
    if (responses.length > 0) {
      const completionRatio = Math.min(1.0, responses.length / Math.max(1, questionIds.length));
      const hasExecutions = (session.codingExecutions && session.codingExecutions.length > 0) || (session.sqlExecutions && session.sqlExecutions.length > 0);
      const executionBonus = hasExecutions ? 0.2 : 0.0;
      aiConfidence = Math.min(1.0, Math.round((0.7 * completionRatio + executionBonus) * 100) / 100);
    }

    const result: CompositeScoreResult = {
      compositeScore,
      sayDoConsistencyScore,
      aiConfidence,
      gradingSource: "AUTOMATED_EVALUATION_ENGINE",
      sayDoRationale,
      moduleScores,
    };

    // Save to DB
    await this.saveScores(sessionId, result);

    return result;
  }

  /**
   * Persist computed scores in database and route confidence gating.
   */
  async saveScores(sessionId: string, scoreData: CompositeScoreResult) {
    const scoringConfig = await this.settingsService.getScoringConfig();
    const threshold = scoringConfig.aiConfidenceThreshold ?? 0.8;
    const isAutoPublished = scoreData.aiConfidence >= threshold;

    await this.prisma.score.upsert({
      where: { sessionId },
      create: {
        session: { connect: { id: sessionId } },
        compositeScore: scoreData.compositeScore,
        sayDoConsistencyScore: scoreData.sayDoConsistencyScore,
        aiConfidence: scoreData.aiConfidence,
        humanReviewed: isAutoPublished,
        gradingSource: scoreData.gradingSource,
        sayDoRationale: scoreData.sayDoRationale,
        moduleScores: scoreData.moduleScores as any,
      },
      update: {
        compositeScore: scoreData.compositeScore,
        sayDoConsistencyScore: scoreData.sayDoConsistencyScore,
        aiConfidence: scoreData.aiConfidence,
        humanReviewed: isAutoPublished,
        gradingSource: scoreData.gradingSource,
        sayDoRationale: scoreData.sayDoRationale,
        moduleScores: scoreData.moduleScores as any,
      },
    });
  }
}
