import { Injectable, Logger } from "@nestjs/common";
import { AIScenarioNarrative } from "./scenarios/scenario-type.interface";
import { QA_BUG_REPORT_SCENARIO } from "./scenarios/qa-bug-report.config";

@Injectable()
export class AIScenarioGeneratorService {
  private readonly logger = new Logger(AIScenarioGeneratorService.name);

  /**
   * Generates business story context (Company Name, Manager Persona, QA Ticket Details, Email Body)
   * while keeping the sandbox environment, codebase, and unit test suites deterministic.
   */
  async generateScenarioNarrative(scenarioId: string = "qa-bug-login-validation"): Promise<AIScenarioNarrative> {
    this.logger.log(`Generating AI Scenario Narrative for ${scenarioId}...`);

    // In production, this can call OpenAI / Gemini to parameterize company name & manager persona.
    // Default high-reliability enterprise narrative for QA Bug scenario:
    return {
      companyName: "Acme Logistics & E-Commerce",
      projectName: "cdrecruit/login-service",
      qaTicketId: "QA-2026",
      qaTicketTitle: QA_BUG_REPORT_SCENARIO.title,
      qaTicketDescription: QA_BUG_REPORT_SCENARIO.description,
      managerPersona: {
        name: QA_BUG_REPORT_SCENARIO.managerEmail.fromName,
        role: QA_BUG_REPORT_SCENARIO.managerEmail.fromRole,
        email: QA_BUG_REPORT_SCENARIO.managerEmail.fromEmail,
      },
      initialSlackPrompt: QA_BUG_REPORT_SCENARIO.initialSayPrompt,
      managerEmailBody: QA_BUG_REPORT_SCENARIO.managerEmail.body,
    };
  }
}
