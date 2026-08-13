import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface AiEvaluationResult {
  score: number | null; // 0 to 100 or null if unavailable
  reasoning: string;
  feedback: string;
  providerUsed: "GROQ" | "CEREBRAS" | "DEV_FALLBACK" | "UNAVAILABLE";
}

@Injectable()
export class AiEvaluationService {
  private readonly logger = new Logger(AiEvaluationService.name);
  private readonly groqApiKey: string;
  private readonly cerebrasApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.groqApiKey = this.configService.get<string>("groqApiKey", { infer: true }) || "";
    this.cerebrasApiKey = this.configService.get<string>("cerebrasApiKey", { infer: true }) || "";
  }

  /**
   * Evaluate candidate AI Prompting submission.
   */
  async evaluatePromptingResponse(
    questionContext: string,
    candidatePrompt: string,
  ): Promise<AiEvaluationResult> {
    const systemPrompt = `You are an expert technical evaluator assessing candidate AI Prompting skill.
Evaluate the candidate's prompt based on:
1. Clarity and precision of instructions (40%)
2. Context and constraint handling (30%)
3. Effectiveness for solving the target problem (30%)

Respond ONLY in strict JSON format:
{
  "score": <number 0-100>,
  "reasoning": "<concise explanation>",
  "feedback": "<constructive candidate feedback>"
}`;

    const userContent = `Question Context: ${questionContext}\nCandidate Submitted Prompt:\n${candidatePrompt}`;

    return this.executeLlmEvaluation(systemPrompt, userContent, candidatePrompt);
  }

  /**
   * Evaluate candidate Simulation actions/dialogue.
   */
  async evaluateSimulationResponse(
    scenarioContext: string,
    candidateActions: string,
  ): Promise<AiEvaluationResult> {
    const systemPrompt = `You are an expert recruiter and engineering manager evaluating candidate workplace simulation performance.
Evaluate based on:
1. Technical accuracy and decision quality (40%)
2. Communication and stakeholder management (30%)
3. Problem-solving workflow and issue diagnosis (30%)

Respond ONLY in strict JSON format:
{
  "score": <number 0-100>,
  "reasoning": "<concise explanation>",
  "feedback": "<constructive candidate feedback>"
}`;

    const userContent = `Scenario Context: ${scenarioContext}\nCandidate Simulation Log & Actions:\n${candidateActions}`;

    return this.executeLlmEvaluation(systemPrompt, userContent, candidateActions);
  }

  private getGroqApiKey(): string {
    return (
      this.groqApiKey ||
      this.configService.get<string>("groqApiKey") ||
      process.env.GROQ_API_KEY ||
      ""
    ).trim();
  }

  private getCerebrasApiKey(): string {
    return (
      this.cerebrasApiKey ||
      this.configService.get<string>("cerebrasApiKey") ||
      process.env.CEREBRAS_API_KEY ||
      ""
    ).trim();
  }

  /**
   * Generate an open-ended assistant response without strict JSON parsing.
   * Used for interactive AI prompting modules.
   */
  async generateAssistantResponse(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const groqKey = this.getGroqApiKey();
    const cerebrasKey = this.getCerebrasApiKey();

    this.logger.log(`generateAssistantResponse invoked. GroqKey present: ${!!groqKey}, CerebrasKey present: ${!!cerebrasKey}`);

    // 1. Try Groq API (Primary)
    if (groqKey) {
      try {
        const groqResult = await this.callGroqApiText(systemPrompt, userContent);
        if (groqResult) return groqResult;
      } catch (err: any) {
        this.logger.warn(`Groq API text generation failed: ${err.message}. Falling back to Cerebras...`);
      }
    }

    // 2. Try Cerebras API (Fallback)
    if (cerebrasKey) {
      try {
        const cerebrasResult = await this.callCerebrasApiText(systemPrompt, userContent);
        if (cerebrasResult) return cerebrasResult;
      } catch (err: any) {
        this.logger.warn(`Cerebras API text generation failed: ${err.message}. Using Dev Fallback...`);
      }
    }

    // 3. Dev Fallback
    return "This is a fallback generated response. (No valid API keys or API error occurred).";
  }

  private async executeLlmEvaluation(
    systemPrompt: string,
    userContent: string,
    rawTextForFallback: string,
  ): Promise<AiEvaluationResult> {
    const groqKey = this.getGroqApiKey();
    const cerebrasKey = this.getCerebrasApiKey();

    // 1. Try Groq API (Primary)
    if (groqKey) {
      try {
        const groqResult = await this.callGroqApi(systemPrompt, userContent);
        if (groqResult) return { ...groqResult, providerUsed: "GROQ" };
      } catch (err: any) {
        this.logger.warn(`Groq API evaluation failed: ${err.message}. Falling back to Cerebras...`);
      }
    }

    // 2. Try Cerebras API (Fallback)
    if (cerebrasKey) {
      try {
        const cerebrasResult = await this.callCerebrasApi(systemPrompt, userContent);
        if (cerebrasResult) return { ...cerebrasResult, providerUsed: "CEREBRAS" };
      } catch (err: any) {
        this.logger.warn(`Cerebras API evaluation failed: ${err.message}. Provider unavailable.`);
      }
    }

    // 3. Provider Unavailable Fallback
    this.logger.warn("Both Groq and Cerebras providers failed or are unavailable.");
    return {
      score: null,
      reasoning: "Evaluation Pending — AI evaluation provider unavailable.",
      feedback: "AI evaluation provider unavailable.",
      providerUsed: "UNAVAILABLE",
    };
  }

  private async callGroqApi(systemPrompt: string, userContent: string) {
    const key = this.getGroqApiKey();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return this.parseJsonResponse(content);
  }

  private async callCerebrasApi(systemPrompt: string, userContent: string) {
    const key = this.getCerebrasApiKey();
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.1-70b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cerebras API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    return this.parseJsonResponse(content);
  }

  private async callGroqApiText(systemPrompt: string, userContent: string): Promise<string | null> {
    const key = this.getGroqApiKey();
    this.logger.log(`Executing Groq API call with key length: ${key.length}`);
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Groq API Error HTTP ${res.status}: ${errText}`);
      throw new Error(`Groq API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  }

  private async callCerebrasApiText(systemPrompt: string, userContent: string): Promise<string | null> {
    const key = this.getCerebrasApiKey();
    this.logger.log(`Executing Cerebras API call with key length: ${key.length}`);
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.1-70b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Cerebras API Error HTTP ${res.status}: ${errText}`);
      throw new Error(`Cerebras API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  }

  private parseJsonResponse(content?: string) {
    if (!content) return null;
    try {
      const parsed = JSON.parse(content);
      return {
        score: typeof parsed.score === "number" && !isNaN(parsed.score) ? Math.min(100, Math.max(0, Math.round(parsed.score))) : null,
        reasoning: parsed.reasoning || "AI Evaluation completed.",
        feedback: parsed.feedback || "Good structure and relevant response.",
      };
    } catch (err) {
      this.logger.error("Failed to parse JSON response from LLM", content);
      return null;
    }
  }

  /**
   * Concept-checklist matching for Test Scenarios module.
   * Matches candidate response against expected-concepts list.
   * Score = weighted proportion of concepts matched (partial credit).
   */
  async evaluateTestScenarioConcepts(
    prompt: string,
    expectedConcepts: string[],
    candidateResponse: string,
  ): Promise<{
    score: number | null;
    conceptMatches: Array<{ concept: string; matched: boolean; reasoning: string }>;
    providerUsed: string;
  }> {
    if (!candidateResponse || candidateResponse.trim().length === 0) {
      return {
        score: 0,
        conceptMatches: expectedConcepts.map((c) => ({
          concept: c,
          matched: false,
          reasoning: "No response submitted.",
        })),
        providerUsed: "NONE",
      };
    }

    const systemPrompt = `You are a technical evaluator assessing a candidate's free-text response against a checklist of required concepts for a technical scenario.
Scenario Prompt: "${prompt}"

Required Expected Concepts Checklist:
${JSON.stringify(expectedConcepts, null, 2)}

Instructions:
1. For EACH expected concept in the checklist, determine whether the candidate's response semantically addresses/covers it (true/false).
2. Provide a short line of reasoning per concept.
3. Compute overall score as the percentage of matched concepts (0 to 100).

Respond strictly in JSON format:
{
  "conceptMatches": [
    { "concept": "<exact expected concept string>", "matched": true|false, "reasoning": "<brief explanation>" }
  ],
  "matchedCount": <number>,
  "totalConcepts": <number>,
  "score": <number 0-100>
}`;

    const userContent = `Candidate Response:\n${candidateResponse}`;

    const groqKey = this.getGroqApiKey();
    const cerebrasKey = this.getCerebrasApiKey();

    if (groqKey) {
      try {
        const raw = await this.callGroqApiText(systemPrompt, userContent);
        if (raw) {
          const jsonStart = raw.indexOf("{");
          const jsonEnd = raw.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
            if (parsed && Array.isArray(parsed.conceptMatches)) {
              return {
                score: typeof parsed.score === "number" ? parsed.score : Math.round((parsed.matchedCount / expectedConcepts.length) * 100),
                conceptMatches: parsed.conceptMatches,
                providerUsed: "GROQ",
              };
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Groq concept evaluation failed: ${err.message}`);
      }
    }

    if (cerebrasKey) {
      try {
        const raw = await this.callCerebrasApiText(systemPrompt, userContent);
        if (raw) {
          const jsonStart = raw.indexOf("{");
          const jsonEnd = raw.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1) {
            const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
            if (parsed && Array.isArray(parsed.conceptMatches)) {
              return {
                score: typeof parsed.score === "number" ? parsed.score : Math.round((parsed.matchedCount / expectedConcepts.length) * 100),
                conceptMatches: parsed.conceptMatches,
                providerUsed: "CEREBRAS",
              };
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Cerebras concept evaluation failed: ${err.message}`);
      }
    }

    // Deterministic semantic keyword fallback if LLM providers unavailable
    const matches = expectedConcepts.map((concept) => {
      const keywords = concept.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const respLower = candidateResponse.toLowerCase();
      const matched = keywords.length > 0 && keywords.some((kw) => respLower.includes(kw));
      return {
        concept,
        matched,
        reasoning: matched ? `Semantic keyword match found in response.` : `Concept missing from candidate response.`,
      };
    });

    const matchedCount = matches.filter((m) => m.matched).length;
    const score = Math.round((matchedCount / expectedConcepts.length) * 100);

    return {
      score,
      conceptMatches: matches,
      providerUsed: "DETERMINISTIC_KEYWORD_FALLBACK",
    };
  }
}
