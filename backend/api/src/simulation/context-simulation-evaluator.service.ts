import { Injectable, Logger } from "@nestjs/common";
import { AiEvaluationService } from "../integrations/ai/ai-evaluation.service";
import { TelemetryEvent } from "./simulation-telemetry.service";
import { QA_BUG_REPORT_SCENARIO, ContextSimulationScenarioConfig } from "./scenarios/qa-bug-report.config";

export interface EvaluationPartScore {
  score: number; // 0 to 100
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
}

export interface DetailedDoScore {
  behaviourScore: number; // 0 to 100
  technicalScore: number; // 0 to 100
  compositeDoScore: number; // 0 to 100
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
}

export interface FullSimulationEvaluationResult {
  overallScore: number; // 0 to 100
  rubricVersion: string;
  initialSay: EvaluationPartScore;
  emailSay: EvaluationPartScore;
  doEvaluation: DetailedDoScore;
  sayDoCorrelation: EvaluationPartScore;
  categoryBreakdown: Record<string, number>;
  competencyBreakdown: {
    problemSolving: number;
    debugging: number;
    communication: number;
    technicalExecution: number;
    sayDoConsistency: number;
  };
  recommendation: "Recommended" | "Needs Further Evaluation" | "Not Recommended";
  recommendationReason: string;
  strengths: string[];
  areasForImprovement: string[];
  actionTimeline: Array<{ timestamp: string; action: string }>;
  summaryReasoning: string;
  evaluatedAt: string;
}

@Injectable()
export class ContextSimulationEvaluatorService {
  private readonly logger = new Logger(ContextSimulationEvaluatorService.name);

  constructor(private readonly aiEvaluationService: AiEvaluationService) {}

  /**
   * Part 1: Evaluate Initial SAY response (0-100)
   */
  async evaluateInitialSay(
    initialSayText: string,
    scenario: ContextSimulationScenarioConfig = QA_BUG_REPORT_SCENARIO,
  ): Promise<EvaluationPartScore> {
    if (!initialSayText || initialSayText.trim().length === 0) {
      return {
        score: 0,
        reasoning: "No initial plan was submitted before accessing code.",
        strengths: [],
        weaknesses: ["Missing initial problem-solving plan"],
      };
    }

    try {
      const prompt = `Evaluate the candidate's initial strategy for fixing a QA bug:
QA Bug: ${scenario.description}
Candidate's Stated Initial Plan:
${initialSayText}

Rate 0-100 on logical thinking, debugging strategy, planning, and clarity.`;
      
      const res = await this.aiEvaluationService.evaluateSimulationResponse(scenario.description, prompt);
      const score = res.score;
      const strengths = score >= 70 ? ["Clear debugging plan outlined", "Identified potential root cause"] : ["Provided response"];
      const weaknesses = score < 70 ? ["Plan lacks specific verification steps or edge case handling"] : [];

      return {
        score,
        reasoning: res.reasoning || "Initial plan evaluated.",
        strengths,
        weaknesses,
      };
    } catch (err: any) {
      this.logger.warn(`AI initial SAY evaluation fallback: ${err.message}`);
      const length = initialSayText.trim().length;
      const score = Math.min(95, Math.max(40, Math.floor(length / 3) + 40));
      return {
        score,
        reasoning: "Rule-based evaluation of initial debugging plan.",
        strengths: ["Submitted initial strategy before coding"],
        weaknesses: length < 50 ? ["Initial plan was brief"] : [],
      };
    }
  }

  /**
   * Part 2: Evaluate Email SAY response (0-100)
   */
  async evaluateEmailSay(
    emailReplyText: string,
    scenario: ContextSimulationScenarioConfig = QA_BUG_REPORT_SCENARIO,
  ): Promise<EvaluationPartScore> {
    if (!emailReplyText || emailReplyText.trim().length === 0) {
      return {
        score: 0,
        reasoning: "Candidate did not reply to manager email inquiry.",
        strengths: [],
        weaknesses: ["Did not acknowledge engineering manager deployment inquiry"],
      };
    }

    try {
      const prompt = `Evaluate candidate email response to Engineering Manager:
Manager Query: ${scenario.managerEmail.body}
Candidate Reply:
${emailReplyText}

Rate 0-100 on professionalism, clear ETA, acknowledgment of deployment risks, and clarity.`;

      const res = await this.aiEvaluationService.evaluateSimulationResponse(scenario.managerEmail.body, prompt);
      const score = res.score;
      const strengths = score >= 75 ? ["Professional tone", "Clear ETA and risk status update"] : ["Replied to manager email"];
      const weaknesses = score < 75 ? ["Response lacked clear ETA or risk assessment"] : [];

      return {
        score,
        reasoning: res.reasoning || "Email response evaluated.",
        strengths,
        weaknesses,
      };
    } catch (err: any) {
      this.logger.warn(`AI Email SAY evaluation fallback: ${err.message}`);
      const length = emailReplyText.trim().length;
      const score = Math.min(95, Math.max(50, Math.floor(length / 2) + 45));
      return {
        score,
        reasoning: "Rule-based evaluation of email response.",
        strengths: ["Communicated progress to stakeholders"],
        weaknesses: [],
      };
    }
  }

  /**
   * Part 3: Evaluate DO Phase (Behaviour + Technical Score)
   */
  evaluateDoPhase(
    telemetryEvents: TelemetryEvent[],
    testExecutionResult: { passedTests: number; totalTests: number; isCorrect: boolean } | null,
  ): DetailedDoScore {
    // 1. Calculate Behaviour Score (0-100)
    const fileEdits = telemetryEvents.filter((e) => e.type === "FILE_EDIT");
    const fileOpens = telemetryEvents.filter((e) => e.type === "FILE_OPEN");
    const testRuns = telemetryEvents.filter((e) => e.type === "TEST_EXECUTE");

    let behaviourScore = 70; // baseline
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (fileOpens.length > 0) {
      behaviourScore += 10;
      strengths.push("Inspected codebase files before modifying");
    }
    if (fileEdits.length > 0) {
      behaviourScore += 10;
      strengths.push("Applied targeted code changes");
    }
    if (testRuns.length > 0) {
      behaviourScore += 10;
      strengths.push("Executed unit tests to verify solution");
    } else {
      behaviourScore -= 15;
      weaknesses.push("Did not run tests before submitting solution");
    }

    if (fileEdits.length > 10) {
      behaviourScore -= 10;
      weaknesses.push("Excessive edit iterations detected");
    }

    behaviourScore = Math.min(100, Math.max(0, behaviourScore));

    // 2. Calculate Technical Score (0-100)
    let technicalScore = 0;
    if (testExecutionResult) {
      if (testExecutionResult.totalTests > 0) {
        technicalScore = Math.round(
          (testExecutionResult.passedTests / testExecutionResult.totalTests) * 100,
        );
      }
      if (testExecutionResult.isCorrect) {
        technicalScore = Math.max(technicalScore, 100);
        strengths.push("Passed all functional and edge case tests");
      } else if (technicalScore < 100) {
        weaknesses.push("Failed one or more hidden edge case test cases");
      }
    } else {
      technicalScore = fileEdits.length > 0 ? 50 : 0;
    }

    // 3. Composite DO Score (50% Behaviour, 50% Technical)
    const compositeDoScore = Math.round(behaviourScore * 0.5 + technicalScore * 0.5);

    return {
      behaviourScore,
      technicalScore,
      compositeDoScore,
      reasoning: `DO score combined from Workflow Behaviour (${behaviourScore}%) and Technical Test Results (${technicalScore}%).`,
      strengths,
      weaknesses,
    };
  }

  /**
   * Part 4: Evaluate Say-Do Correlation Score (0-100)
   */
  evaluateSayDoCorrelation(
    initialSayText: string,
    telemetryEvents: TelemetryEvent[],
  ): EvaluationPartScore {
    if (!initialSayText) {
      return {
        score: 0,
        reasoning: "No initial plan available to compute Say-Do correlation.",
        strengths: [],
        weaknesses: ["Cannot measure correlation without initial plan"],
      };
    }

    const lowerSay = initialSayText.toLowerCase();
    const testRuns = telemetryEvents.filter((e) => e.type === "TEST_EXECUTE");
    const fileOpens = telemetryEvents.filter((e) => e.type === "FILE_OPEN");
    const fileEdits = telemetryEvents.filter((e) => e.type === "FILE_EDIT");

    let correlationScore = 75; // baseline
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Check plan vs execution alignment
    const saidWouldTest = lowerSay.includes("test") || lowerSay.includes("verify") || lowerSay.includes("check");
    const didRunTest = testRuns.length > 0;

    if (saidWouldTest && didRunTest) {
      correlationScore += 15;
      strengths.push("Executed testing steps as promised in initial plan");
    } else if (saidWouldTest && !didRunTest) {
      correlationScore -= 20;
      weaknesses.push("Stated intention to run tests but did not execute tests in workspace");
    }

    const saidWouldInspect = lowerSay.includes("inspect") || lowerSay.includes("read") || lowerSay.includes("look") || lowerSay.includes("debug");
    const didInspectFiles = fileOpens.length > 0;

    if (saidWouldInspect && didInspectFiles) {
      correlationScore += 10;
      strengths.push("Inspected code files as outlined in initial plan");
    }

    if (fileEdits.length > 0) {
      correlationScore += 5;
    }

    correlationScore = Math.min(100, Math.max(0, correlationScore));

    return {
      score: correlationScore,
      reasoning: `Say-Do correlation measured consistency between initial stated intent and actual workspace telemetry.`,
      strengths,
      weaknesses,
    };
  }

  /**
   * Aggregate all 4 parts into a full evaluation payload
   */
  async generateFullEvaluation(
    initialSayText: string,
    emailReplyText: string,
    telemetryEvents: TelemetryEvent[],
    testExecutionResult: { passedTests: number; totalTests: number; isCorrect: boolean } | null,
    scenario: ContextSimulationScenarioConfig = QA_BUG_REPORT_SCENARIO,
  ): Promise<FullSimulationEvaluationResult> {
    const initialSay = await this.evaluateInitialSay(initialSayText, scenario);
    const emailSay = await this.evaluateEmailSay(emailReplyText, scenario);
    const doEval = this.evaluateDoPhase(telemetryEvents, testExecutionResult);
    const sayDo = this.evaluateSayDoCorrelation(initialSayText, telemetryEvents);

    const weights = scenario.evaluationCriteria;
    const weightedSum =
      initialSay.score * weights.initialSayWeight +
      emailSay.score * weights.emailSayWeight +
      doEval.compositeDoScore * (weights.doBehaviourWeight + weights.doTechnicalWeight) +
      sayDo.score * weights.sayDoCorrelationWeight;

    const overallScore = Math.round(weightedSum);

    const categoryBreakdown = {
      INITIAL_SAY: initialSay.score,
      EMAIL_SAY: emailSay.score,
      DO_BEHAVIOUR: doEval.behaviourScore,
      DO_TECHNICAL: doEval.technicalScore,
      DO_COMPOSITE: doEval.compositeDoScore,
      SAY_DO_CORRELATION: sayDo.score,
    };

    const competencyBreakdown = {
      problemSolving: initialSay.score,
      debugging: doEval.behaviourScore,
      communication: emailSay.score,
      technicalExecution: doEval.technicalScore,
      sayDoConsistency: sayDo.score,
    };

    let recommendation: "Recommended" | "Needs Further Evaluation" | "Not Recommended" = "Needs Further Evaluation";
    let recommendationReason = "";

    if (overallScore >= 80 && doEval.technicalScore >= 80) {
      recommendation = "Recommended";
      recommendationReason = `Candidate demonstrated systematic debugging, strong technical execution (${doEval.technicalScore}%), and clear stakeholder communication.`;
    } else if (overallScore >= 55) {
      recommendation = "Needs Further Evaluation";
      recommendationReason = `Candidate showed partial issue resolution (${doEval.technicalScore}% technical) with minor communication or correlation gaps.`;
    } else {
      recommendation = "Not Recommended";
      recommendationReason = `Candidate was unable to resolve the primary QA bug or failed diagnostic test constraints.`;
    }

    const allStrengths = Array.from(
      new Set([
        ...initialSay.strengths,
        ...emailSay.strengths,
        ...doEval.strengths,
        ...sayDo.strengths,
      ]),
    );

    const allWeaknesses = Array.from(
      new Set([
        ...initialSay.weaknesses,
        ...emailSay.weaknesses,
        ...doEval.weaknesses,
        ...sayDo.weaknesses,
      ]),
    );

    const actionTimeline = (telemetryEvents || []).map((evt) => {
      const timeStr = evt.timestamp
        ? new Date(evt.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "00:00:00";
      let actionLabel = evt.type as string;
      if (evt.type === "FILE_OPEN") actionLabel = `Inspected ${evt.filepath || "source file"}`;
      else if (evt.type === "FILE_EDIT") actionLabel = `Modified ${evt.filepath || "source file"}`;
      else if ((evt.type as string) === "SUBMIT_REPLY" || (evt.type as string) === "EMAIL_REPLY_SUBMIT") actionLabel = `Submitted manager email reply`;
      else if ((evt.type as string) === "SAY_PLAN_SUBMITTED" || (evt.type as string) === "INITIAL_SAY_SUBMIT") actionLabel = `Submitted initial SAY debugging plan`;
      return { timestamp: timeStr, action: actionLabel };
    });

    return {
      overallScore,
      rubricVersion: scenario.rubricVersion,
      initialSay,
      emailSay,
      doEvaluation: doEval,
      sayDoCorrelation: sayDo,
      categoryBreakdown,
      competencyBreakdown,
      recommendation,
      recommendationReason,
      strengths: allStrengths.length > 0 ? allStrengths : ["Attempted diagnostic debugging scenario"],
      areasForImprovement: allWeaknesses.length > 0 ? allWeaknesses : ["Ensure complete test suite coverage"],
      actionTimeline,
      summaryReasoning: `Candidate achieved ${overallScore}/100 overall score. Technical (${doEval.technicalScore}%), Communication (${emailSay.score}%), Say-Do Correlation (${sayDo.score}%).`,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
