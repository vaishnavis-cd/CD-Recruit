import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { artifactLibrary, Artifact } from "./artifact-library";

export interface ScenarioRequest {
  role: string;
  track: "fresher" | "experienced";
  difficulty: "easy" | "medium" | "hard";
  eventTemplateId: string;
}

export interface ScenarioResponse {
  context: string;
  messages?: string;
  logs?: string;
  alerts?: string;
  tickets?: string;
  emails?: string;
}

export interface LLMProvider {
  generateScenario(
    input: ScenarioRequest,
    systemPrompt: string,
  ): Promise<ScenarioResponse>;
}

@Injectable()
export class EventGenerationService {
  private provider: LLMProvider | null = null;
  private providerName: string = "fallback";

  constructor(private configService: ConfigService) {
    const selectedProvider =
      this.configService.get<string>("LLM_PROVIDER") || "fallback";
    this.providerName = selectedProvider.toLowerCase();
    this.initializeProvider();
  }

  private initializeProvider() {
    if (this.providerName === "claude") {
      const apiKey = this.configService.get<string>("ANTHROPIC_API_KEY");
      if (apiKey && !apiKey.startsWith("sk-ant-changeme")) {
        this.provider = new ClaudeProvider(apiKey);
      }
    } else if (this.providerName === "gemini") {
      const apiKey = this.configService.get<string>("GEMINI_API_KEY");
      if (apiKey) {
        this.provider = new GeminiProvider(apiKey);
      }
    }
  }

  async generateScenario(request: ScenarioRequest): Promise<ScenarioResponse> {
    const templateId = request.eventTemplateId;

    const systemPrompt = `You are a technical scenario generator for CD Recruit.
Your job is to enrich the context and text assets of a simulated engineering event.
Return ONLY a valid JSON object matching the requested schema. Do not add markdown backticks or extra text outside JSON.
JSON Schema:
{
  "context": "Main detailed description of what happened",
  "messages": "Simulated chat or messages log if relevant",
  "logs": "Simulated terminal/app logs if relevant",
  "alerts": "Simulated monitoring alert alerts if relevant",
  "tickets": "Simulated Jira ticket payload if relevant",
  "emails": "Simulated customer/support email text if relevant"
}`;

    if (this.provider) {
      try {
        return await this.provider.generateScenario(request, systemPrompt);
      } catch (error) {
        console.warn(
          `LLM provider (${this.providerName}) failed, falling back to static artifacts:`,
          error,
        );
      }
    }

    // Static fallback strategy using predefined templates
    return this.getStaticFallback(templateId);
  }

  private getStaticFallback(templateId: string): ScenarioResponse {
    const response: ScenarioResponse = {
      context: "Predefined scenario load completed successfully.",
    };

    // Populate context from template information and matching library artifacts
    if (templateId === "fresher_manager_eta") {
      response.context =
        "Sarah asks for your task status because the customer demo is scheduled for tomorrow morning.";
      response.messages = artifactLibrary.fresher_eta_request_slack.content;
    } else if (templateId === "fresher_req_clarify") {
      response.context =
        "You have been assigned a ticket to add profile search, but the spec has no constraints or clear scope.";
      response.tickets = artifactLibrary.fresher_requirement_jira.content;
    } else if (templateId === "fresher_qa_bug") {
      response.context =
        "QA has rejected the profile validation commit. They report that typing only spaces allows blank names to pass.";
      response.tickets = artifactLibrary.fresher_bug_report_jira.content;
      response.logs = artifactLibrary.fresher_bug_code.content;
    } else if (templateId === "fresher_code_review") {
      response.context =
        "Review Leo's cache layer refactor Pull Request. Look for memory leaks, console logs, or performance issues.";
      response.tickets = "PR #124 - Cache Refactoring Review Task";
      response.logs = artifactLibrary.fresher_code_review_pr.content;
    } else if (templateId === "fresher_teammate_question") {
      response.context =
        "Raj, a junior developer, sends you a DM asking for help understanding when to use database indexes.";
      response.messages =
        artifactLibrary.fresher_teammate_question_slack.content;
    } else if (templateId === "experienced_prod_incident") {
      response.context =
        "Production CPU spiked to 98% shortly after deploy. Dashboard connection limits have been exceeded.";
      response.alerts = artifactLibrary.experienced_incident_dashboard.content;
      response.logs = artifactLibrary.experienced_incident_logs.content;
      response.tickets = artifactLibrary.experienced_incident_timeline.content;
    } else if (templateId === "experienced_pipeline_failure") {
      response.context =
        "The build pipeline fails during the npm install step due to a missing directory for the husky prepare script.";
      response.logs = artifactLibrary.experienced_pipeline_logs.content;
      response.tickets = artifactLibrary.experienced_pipeline_config.content;
    } else if (templateId === "experienced_security_alert") {
      response.context =
        "A GitHub automated scanner warns that AWS credentials have been pushed to a public repository.";
      response.alerts = artifactLibrary.experienced_security_alert.content;
      response.logs = artifactLibrary.experienced_security_code.content;
    } else if (templateId === "experienced_customer_escalation") {
      response.context =
        "An Account Manager escalates payment issues for a premium client: Stripe validations are failing in Europe.";
      response.emails =
        artifactLibrary.experienced_customer_escalation_email.content;
    } else if (templateId === "experienced_priority_conflict") {
      response.context =
        "A meeting is called. Clara wants the customer payment bug fixed immediately, while Dave wants the cache memory leak patched.";
      response.messages =
        artifactLibrary.experienced_priority_conflict_slack.content;
    }

    return response;
  }
}

class ClaudeProvider implements LLMProvider {
  constructor(private apiKey: string) {}

  async generateScenario(
    input: ScenarioRequest,
    systemPrompt: string,
  ): Promise<ScenarioResponse> {
    // Simulated/Mock implementation or call to Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Enrich this scenario template: role=${input.role}, track=${input.track}, difficulty=${input.difficulty}, template=${input.eventTemplateId}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API responded with status ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    return JSON.parse(text.trim());
  }
}

class GeminiProvider implements LLMProvider {
  constructor(private apiKey: string) {}

  async generateScenario(
    input: ScenarioRequest,
    systemPrompt: string,
  ): Promise<ScenarioResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\nEnrich this scenario: role=${input.role}, track=${input.track}, difficulty=${input.difficulty}, template=${input.eventTemplateId}`,
                },
              ],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini API responded with status ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text.trim());
  }
}
