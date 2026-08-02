import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface AiEvaluationResult {
  score: number; // 0 to 100
  reasoning: string;
  feedback: string;
  providerUsed: "GROQ" | "CEREBRAS" | "DEV_FALLBACK";
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
        this.logger.warn(`Cerebras API evaluation failed: ${err.message}. Using Dev Fallback...`);
      }
    }

    // 3. Heuristic Dev Fallback
    return this.devFallbackEvaluation(rawTextForFallback);
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
      throw new Error(`Groq API HTTP ${res.status}`);
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
      throw new Error(`Cerebras API HTTP ${res.status}`);
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
        score: Math.min(100, Math.max(0, Number(parsed.score) || 75)),
        reasoning: parsed.reasoning || "AI Evaluation completed.",
        feedback: parsed.feedback || "Good structure and relevant response.",
      };
    } catch (err) {
      this.logger.error("Failed to parse JSON response from LLM", content);
      return null;
    }
  }

  private devFallbackEvaluation(rawText: string): AiEvaluationResult {
    const length = (rawText || "").trim().length;
    let score = 75;
    if (length > 200) score = 88;
    else if (length > 80) score = 78;
    else if (length > 20) score = 65;
    else score = 45;

    return {
      score,
      reasoning: "Rule-based dev fallback evaluation (length & structure check).",
      feedback: "Candidate answer provided sufficient technical structure.",
      providerUsed: "DEV_FALLBACK",
    };
  }
}
