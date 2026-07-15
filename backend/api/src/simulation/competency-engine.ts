import { Injectable } from "@nestjs/common";

export type EventOutcome =
  | "resolved_correctly"
  | "partially_resolved"
  | "incorrect_resolution"
  | "ignored";

export interface EventScoreDetail {
  eventId: string;
  outcome: EventOutcome;
  weightedScore: number;
  durationSeconds: number;
  competenciesImpacted: string[];
}

export interface CompetencyScoreBreakdown {
  [competencyName: string]: number;
}

export interface FinalSimulationScore {
  finalScore: number;
  competencyBreakdown: CompetencyScoreBreakdown;
  outcomes: Array<{ eventId: string; outcome: EventOutcome }>;
}

@Injectable()
export class CompetencyEngine {
  // Configurable outcome weights
  private outcomeWeights: Record<EventOutcome, number> = {
    resolved_correctly: 100,
    partially_resolved: 60,
    incorrect_resolution: 20,
    ignored: 0,
  };

  getOutcomeWeight(outcome: EventOutcome): number {
    return this.outcomeWeights[outcome] ?? 0;
  }

  calculateEventScore(outcome: EventOutcome): number {
    return this.getOutcomeWeight(outcome);
  }

  /**
   * Evaluates candidate responses/actions deterministically for the 10 simulation events.
   */
  evaluateResponse(eventId: string, responsePayload: any): EventOutcome {
    if (!responsePayload) return "ignored";

    const responseText = (
      typeof responsePayload === "string"
        ? responsePayload
        : responsePayload.text ||
          responsePayload.response ||
          responsePayload.code ||
          ""
    )
      .toLowerCase()
      .trim();
    const actions = Array.isArray(responsePayload.actionLog)
      ? responsePayload.actionLog
      : [];

    switch (eventId) {
      // --- FRESHER EVENTS ---
      case "fresher_manager_eta": {
        // Must provide realistic ETA and mention blockers
        const hasEta =
          responseText.includes("eta") ||
          responseText.includes("tomorrow") ||
          responseText.includes("hour") ||
          responseText.includes("pm") ||
          responseText.includes("am") ||
          /\d+/.test(responseText);
        const hasBlocker =
          responseText.includes("blocker") ||
          responseText.includes("waiting") ||
          responseText.includes("block") ||
          responseText.includes("depend");
        if (hasEta && hasBlocker) return "resolved_correctly";
        if (hasEta || hasBlocker) return "partially_resolved";
        return "incorrect_resolution";
      }

      case "fresher_req_clarify": {
        // PM requirement clarification. Should ask questions or state assumptions.
        const asksClarification =
          responseText.includes("search") ||
          responseText.includes("what") ||
          responseText.includes("clar") ||
          responseText.includes("scope") ||
          responseText.includes("field") ||
          responseText.includes("criteria") ||
          responseText.includes("limit") ||
          responseText.includes("?") ||
          responseText.includes("assume");
        if (asksClarification) return "resolved_correctly";
        if (responseText.length > 10) return "partially_resolved";
        return "incorrect_resolution";
      }

      case "fresher_qa_bug": {
        // Space-only validation fails. Fix must check for trim()
        const hasTrim =
          responseText.includes("trim()") ||
          responseText.includes("trim (") ||
          responseText.includes(".trim()");
        const runsTests = actions.some(
          (a: any) =>
            a.action === "run_tests" ||
            a.action?.toLowerCase().includes("test"),
        );
        if (hasTrim && runsTests) return "resolved_correctly";
        if (hasTrim) return "partially_resolved"; // Didn't validate/run tests but code is correct
        if (responseText.length > 0) return "incorrect_resolution";
        return "ignored";
      }

      case "fresher_code_review": {
        // Leo's PR review. Should identify memory leak (static Map) or console.log
        const identifiesLeak =
          responseText.includes("leak") ||
          responseText.includes("static") ||
          responseText.includes("memory") ||
          responseText.includes("evict") ||
          responseText.includes("ttl") ||
          responseText.includes("map");
        const identifiesConsole =
          responseText.includes("console.log") ||
          responseText.includes("print") ||
          responseText.includes("debug");
        const action = responsePayload.action || "";
        if (identifiesLeak && identifiesConsole && action === "reject")
          return "resolved_correctly";
        if (identifiesLeak || identifiesConsole) return "partially_resolved";
        return "incorrect_resolution";
      }

      case "fresher_teammate_question": {
        // Teammate Raj asking about db indexes. Needs to mention fast read/retrieval AND write performance penalty.
        const explainsBenefits =
          responseText.includes("fast") ||
          responseText.includes("retriev") ||
          responseText.includes("read") ||
          responseText.includes("speed") ||
          responseText.includes("search");
        const explainsDrawbacks =
          responseText.includes("write") ||
          responseText.includes("insert") ||
          responseText.includes("update") ||
          responseText.includes("slow") ||
          responseText.includes("space") ||
          responseText.includes("overhead");
        if (explainsBenefits && explainsDrawbacks) return "resolved_correctly";
        if (explainsBenefits || explainsDrawbacks) return "partially_resolved";
        return "incorrect_resolution";
      }

      // --- EXPERIENCED EVENTS ---
      case "experienced_prod_incident": {
        // Action rollback is correct. Investigate is partial. Restart DB is incorrect.
        const action = responsePayload.action || "";
        if (action === "rollback") return "resolved_correctly";
        if (action === "investigate" || action === "escalate")
          return "partially_resolved";
        return "incorrect_resolution";
      }

      case "experienced_pipeline_failure": {
        // CI config bug. Replace npm install with npm ci, and re-run.
        const hasNpmCi = responseText.includes("npm ci");
        const runsPipeline = actions.some(
          (a: any) =>
            a.action === "re_run_pipeline" ||
            a.action?.toLowerCase().includes("run"),
        );
        if (hasNpmCi && runsPipeline) return "resolved_correctly";
        if (hasNpmCi) return "partially_resolved";
        if (responseText.length > 0) return "incorrect_resolution";
        return "ignored";
      }

      case "experienced_security_alert": {
        // Key leak. Must deactivate key in AWS / IAM. Deleting commit is not enough.
        const action = responsePayload.action || "";
        if (action === "deactivate_key") return "resolved_correctly";
        if (action === "escalate" || action === "patch_code")
          return "partially_resolved";
        return "incorrect_resolution";
      }

      case "experienced_customer_escalation": {
        // AM email escalation. Must acknowledge customer pain and outline payment europe issue.
        const hasAcknowledge =
          responseText.includes("sorry") ||
          responseText.includes("apolog") ||
          responseText.includes("understand") ||
          responseText.includes("pain") ||
          responseText.includes("impact") ||
          responseText.includes("enterprise");
        const hasStripeIssue =
          responseText.includes("stripe") ||
          responseText.includes("europe") ||
          responseText.includes("gateway") ||
          responseText.includes("validation");
        if (hasAcknowledge && hasStripeIssue) return "resolved_correctly";
        if (hasAcknowledge || hasStripeIssue) return "partially_resolved";
        return "incorrect_resolution";
      }

      case "experienced_priority_conflict": {
        // Stakeholder conflict Clara (Stripe) vs Dave (Cache leak).
        const action = responsePayload.action || "";
        if (action === "propose_compromise") return "resolved_correctly";
        if (action === "choose_stripe" || action === "choose_cache")
          return "partially_resolved";
        return "incorrect_resolution";
      }

      default:
        return "ignored";
    }
  }

  generateFinalScore(events: EventScoreDetail[]): FinalSimulationScore {
    if (events.length === 0) {
      return { finalScore: 0, competencyBreakdown: {}, outcomes: [] };
    }

    // 1. Calculate final module score as simple average of event scores
    let totalWeightedScore = 0;
    events.forEach((e) => {
      totalWeightedScore += this.calculateEventScore(e.outcome);
    });
    const finalScore = Math.round(totalWeightedScore / events.length);

    // 2. Aggregate scores by competency
    const competencyScores: Record<string, { total: number; count: number }> =
      {};

    events.forEach((event) => {
      const eventScore = this.calculateEventScore(event.outcome);
      event.competenciesImpacted.forEach((comp) => {
        if (!competencyScores[comp]) {
          competencyScores[comp] = { total: 0, count: 0 };
        }
        competencyScores[comp].total += eventScore;
        competencyScores[comp].count += 1;
      });
    });

    const competencyBreakdown: CompetencyScoreBreakdown = {};
    Object.keys(competencyScores).forEach((comp) => {
      const { total, count } = competencyScores[comp];
      competencyBreakdown[comp.toLowerCase().replace(/ /g, "_")] = Math.round(
        total / count,
      );
    });

    // 3. Compile event outcomes list
    const outcomes = events.map((e) => ({
      eventId: e.eventId,
      outcome: e.outcome,
    }));

    return {
      finalScore,
      competencyBreakdown,
      outcomes,
    };
  }
}
