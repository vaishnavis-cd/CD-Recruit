import { Injectable, Logger } from "@nestjs/common";
import { AiEvaluationService } from "../integrations/ai/ai-evaluation.service";

export interface ConceptMatchItem {
  concept: string;
  matched: boolean;
  reasoning: string;
}

export interface TestScenarioScoreResult {
  score: number | null;
  conceptMatches: ConceptMatchItem[];
  matchedCount: number;
  totalConcepts: number;
  providerUsed: string;
}

@Injectable()
export class TestScenarioScoringService {
  private readonly logger = new Logger(TestScenarioScoringService.name);

  constructor(private readonly aiEvaluationService: AiEvaluationService) {}

  async scoreTestScenarioResponse(
    prompt: string,
    expectedConcepts: string[],
    candidateResponse: string
  ): Promise<TestScenarioScoreResult> {
    if (!expectedConcepts || expectedConcepts.length === 0) {
      return {
        score: null,
        conceptMatches: [],
        matchedCount: 0,
        totalConcepts: 0,
        providerUsed: "NO_EXPECTED_CONCEPTS",
      };
    }

    try {
      const evalResult = await this.aiEvaluationService.evaluateTestScenarioConcepts(
        prompt,
        expectedConcepts,
        candidateResponse
      );

      const matchedCount = evalResult.conceptMatches.filter((c) => c.matched).length;

      return {
        score: evalResult.score,
        conceptMatches: evalResult.conceptMatches,
        matchedCount,
        totalConcepts: expectedConcepts.length,
        providerUsed: evalResult.providerUsed,
      };
    } catch (err: any) {
      this.logger.error(`TestScenario evaluation failed: ${err.message}`);
      return {
        score: null,
        conceptMatches: [],
        matchedCount: 0,
        totalConcepts: expectedConcepts.length,
        providerUsed: "FAILED",
      };
    }
  }
}
