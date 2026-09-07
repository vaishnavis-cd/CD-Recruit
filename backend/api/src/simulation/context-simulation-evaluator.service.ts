import { Injectable, Logger } from "@nestjs/common";
import { AiEvaluationService } from "../integrations/ai/ai-evaluation.service";
import { TelemetryEvent } from "./simulation-telemetry.service";
import { QA_BUG_REPORT_SCENARIO } from "./scenarios/qa-bug-report.config";
import { ContextSimulationScenarioConfig } from "./scenarios/scenario-type.interface";

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
   * Validates whether candidate input text represents meaningful English/technical sentences
   * rather than random keyboard smashing or non-actionable gibberish.
   */
  private isMeaningfulText(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    const clean = text.trim();
    if (clean.length < 8) return false;

    // Check for extreme repeating characters (e.g. 'aaaaaa', 'asdfasdfasdf')
    if (/(.)\1{4,}/.test(clean)) return false;

    const words = clean.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 1 && clean.length > 14) {
      // Single long token without spaces is usually gibberish like 'ewqratyuilkjhngbf'
      return false;
    }

    // Check vowel-to-consonant ratio for natural language words
    const letters = clean.toLowerCase().replace(/[^a-z]/g, "");
    if (letters.length < 5) return false;
    const vowels = letters.replace(/[^aeiou]/g, "").length;
    const vowelRatio = vowels / letters.length;
    if (vowelRatio < 0.15 || vowelRatio > 0.85) {
      return false;
    }

    return true;
  }

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

    if (!this.isMeaningfulText(initialSayText)) {
      return {
        score: 0,
        reasoning: "Initial plan contains non-actionable or random keyboard text. No coherent strategy provided.",
        strengths: [],
        weaknesses: ["Submitted unintelligible / gibberish initial plan"],
      };
    }

    try {
      const prompt = `Evaluate the candidate's initial strategy for fixing a QA bug:
QA Bug: ${scenario.description}
Candidate's Stated Initial Plan:
${initialSayText}

Rate 0-100 on logical thinking, debugging strategy, planning, and clarity. Return 0 if the text is irrelevant or gibberish.`;

      const res = await this.aiEvaluationService.evaluateSimulationResponse(scenario.description, prompt);
      const score = res.score ?? 50;
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
      const lower = initialSayText.toLowerCase();
      const keywords = ["test", "debug", "check", "fix", "inspect", "cause", "issue", "verify", "reproduce", "log"];
      const matchCount = keywords.filter((k) => lower.includes(k)).length;
      const score = Math.min(85, Math.max(20, matchCount * 20));

      return {
        score,
        reasoning: "Rule-based evaluation of initial debugging plan.",
        strengths: matchCount >= 2 ? ["Identified core debugging concepts"] : ["Submitted initial strategy before coding"],
        weaknesses: matchCount < 2 ? ["Initial plan lacks technical debugging methodology"] : [],
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

    if (!this.isMeaningfulText(emailReplyText)) {
      return {
        score: 0,
        reasoning: "Manager email response contains non-actionable or random characters.",
        strengths: [],
        weaknesses: ["Did not provide a coherent reply to stakeholder inquiry"],
      };
    }

    try {
      const prompt = `Evaluate candidate email response to Engineering Manager:
Manager Query: ${scenario.managerEmail.body}
Candidate Reply:
${emailReplyText}

Rate 0-100 on professionalism, clear ETA, acknowledgment of deployment risks, and clarity. Return 0 if the reply is unintelligible.`;

      const res = await this.aiEvaluationService.evaluateSimulationResponse(scenario.managerEmail.body, prompt);
      const score = res.score ?? 50;
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
      const lower = emailReplyText.toLowerCase();
      const keywords = ["eta", "deploy", "risk", "safe", "patch", "ready", "hour", "minute", "fix", "test"];
      const matchCount = keywords.filter((k) => lower.includes(k)).length;
      const score = Math.min(85, Math.max(20, matchCount * 20));

      return {
        score,
        reasoning: "Rule-based evaluation of email response.",
        strengths: ["Communicated progress to stakeholders"],
        weaknesses: matchCount < 2 ? ["Email lacked explicit ETA or deployment risk details"] : [],
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
    const fileEdits = telemetryEvents.filter((e) => e.type === "FILE_EDIT");
    const fileOpens = telemetryEvents.filter((e) => e.type === "FILE_OPEN");
    const testRuns = telemetryEvents.filter((e) => e.type === "TEST_EXECUTE");

    // Zero-action safeguard
    if (fileOpens.length === 0 && fileEdits.length === 0 && testRuns.length === 0) {
      return {
        behaviourScore: 0,
        technicalScore: 0,
        compositeDoScore: 0,
        reasoning: "Zero workspace actions, file inspections, or test runs recorded during session.",
        strengths: [],
        weaknesses: ["Did not inspect codebase files", "Did not apply any code modifications", "Did not execute verification tests"],
      };
    }

    // 1. Calculate Behaviour Score (0-100)
    let behaviourScore = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (fileOpens.length > 0) {
      behaviourScore += 25;
      strengths.push("Inspected codebase files before modifying");
    }
    if (fileEdits.length > 0) {
      behaviourScore += 35;
      strengths.push("Applied targeted code changes");
    }
    if (testRuns.length > 0) {
      behaviourScore += 40;
      strengths.push("Executed unit tests to verify solution");
    } else {
      weaknesses.push("Did not run tests before submitting solution");
    }

    if (fileEdits.length > 12) {
      behaviourScore = Math.max(0, behaviourScore - 10);
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
        technicalScore = 100;
        strengths.push("Passed all functional and edge case tests");
      } else if (technicalScore < 100) {
        weaknesses.push("Failed one or more hidden edge case test cases");
      }
    } else {
      technicalScore = fileEdits.length > 0 ? 20 : 0;
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
    scenario: ContextSimulationScenarioConfig = QA_BUG_REPORT_SCENARIO,
  ): EvaluationPartScore {
    if (!initialSayText || !this.isMeaningfulText(initialSayText)) {
      return {
        score: 0,
        reasoning: "No coherent initial plan provided; Say-Do correlation score is 0%.",
        strengths: [],
        weaknesses: ["Cannot measure Say-Do correlation without valid initial plan"],
      };
    }

    const testRuns = telemetryEvents.filter((e) => e.type === "TEST_EXECUTE");
    const fileOpens = telemetryEvents.filter((e) => e.type === "FILE_OPEN");
    const fileEdits = telemetryEvents.filter((e) => e.type === "FILE_EDIT");

    // Zero-action safeguard
    if (fileOpens.length === 0 && fileEdits.length === 0 && testRuns.length === 0) {
      return {
        score: 0,
        reasoning: "Candidate stated initial intent but performed zero workspace actions (0% consistency).",
        strengths: [],
        weaknesses: ["Complete Say-Do gap: Stated intentions were not followed by any workspace execution"],
      };
    }

    const lowerSay = initialSayText.toLowerCase();
    let correlationScore = 20; // baseline for valid plan + activity
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Check plan vs execution alignment using scenario-specific expected concepts
    const concepts = scenario.expectedConcepts || ["test", "verify", "check", "inspect", "read", "look", "debug"];
    const testConcepts = concepts.filter((c) => ["test", "verify", "check"].includes(c));
    const inspectConcepts = concepts.filter((c) => ["inspect", "read", "look", "debug"].includes(c));

    const saidWouldTest = testConcepts.length > 0 
      ? testConcepts.some((c) => lowerSay.includes(c)) 
      : (lowerSay.includes("test") || lowerSay.includes("verify") || lowerSay.includes("check"));
    const didRunTest = testRuns.length > 0;

    if (saidWouldTest && didRunTest) {
      correlationScore += 35;
      strengths.push("Executed testing steps as promised in initial plan");
    } else if (saidWouldTest && !didRunTest) {
      correlationScore = Math.max(0, correlationScore - 20);
      weaknesses.push("Stated intention to run tests but did not execute tests in workspace");
    }

    const saidWouldInspect = inspectConcepts.length > 0 
      ? inspectConcepts.some((c) => lowerSay.includes(c)) 
      : (lowerSay.includes("inspect") || lowerSay.includes("read") || lowerSay.includes("look") || lowerSay.includes("debug"));
    const didInspectFiles = fileOpens.length > 0;

    if (saidWouldInspect && didInspectFiles) {
      correlationScore += 25;
      strengths.push("Inspected code files as outlined in initial plan");
    }

    if (fileEdits.length > 0) {
      correlationScore += 20;
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
    const sayDo = this.evaluateSayDoCorrelation(initialSayText, telemetryEvents, scenario);

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
