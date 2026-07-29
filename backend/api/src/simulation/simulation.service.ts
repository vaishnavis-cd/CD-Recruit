import { Injectable, BadRequestException, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";
import { SessionLogService, SimulationSession } from "./session-log.service";
import { EventGenerationService } from "./event-generation.service";
import { CompetencyEngine } from "./competency-engine";
import { CorrelationEngineClient } from "../common/correlation-engine.client";
import { CorrelationGradingService } from "./correlation-grading.service";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";
import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import { SandboxOrchestratorService } from "./sandbox/sandbox-orchestrator.service";
import { SimulationTelemetryService, TelemetryEventType } from "./simulation-telemetry.service";
import { ContextSimulationEvaluatorService, FullSimulationEvaluationResult } from "./context-simulation-evaluator.service";
import { execFile } from "child_process";
import * as vm from "vm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { QA_BUG_REPORT_SCENARIO, ContextSimulationScenarioConfig } from "./scenarios/qa-bug-report.config";

export interface SimulationInboxMessage {
  id: number;
  from: string;
  role: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  expectsReply: boolean;
  replyText?: string;
}

@Injectable()
export class SimulationService implements AssessmentModuleEngine {
  readonly moduleType = ModuleType.SIMULATION;
  private readonly logger = new Logger(SimulationService.name);

  // In-memory cache backed by DB simulationSnapshot
  private readonly sessionStates = new Map<
    string,
    {
      initialSayText: string;
      emailReplyText: string;
      emailTriggered: boolean;
      inboxMessages: SimulationInboxMessage[];
    }
  >();

  constructor(
    private prisma: PrismaService,
    private sessionLogService: SessionLogService,
    private eventGenerationService: EventGenerationService,
    private competencyEngine: CompetencyEngine,
    private correlationClient: CorrelationEngineClient,
    private correlationGradingService: CorrelationGradingService,
    private sandboxOrchestrator: SandboxOrchestratorService,
    private telemetryService: SimulationTelemetryService,
    private evaluatorService: ContextSimulationEvaluatorService,
  ) {}

  /**
   * Return scenario configuration (QA Bug Report)
   */
  getScenarioConfig(): ContextSimulationScenarioConfig {
    return QA_BUG_REPORT_SCENARIO;
  }

  /**
   * Helper to fetch or initialize session state with DB hydration
   */
  private getOrCreateSessionState(sessionId: string) {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        initialSayText: "",
        emailReplyText: "",
        emailTriggered: false,
        inboxMessages: [],
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Persist current session snapshot into Prisma DB (session.simulationSnapshot)
   */
  private async persistSessionSnapshot(sessionId: string): Promise<void> {
    const state = this.getOrCreateSessionState(sessionId);
    const telemetry = this.telemetryService.getEventStream(sessionId);

    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          simulationSnapshot: {
            initialSayText: state.initialSayText,
            emailReplyText: state.emailReplyText,
            emailTriggered: state.emailTriggered,
            inboxMessages: state.inboxMessages,
            telemetryCount: telemetry.length,
            lastUpdated: new Date().toISOString(),
          } as any,
        },
      });
    } catch (err: any) {
      this.logger.debug(`simulationSnapshot DB update note for ${sessionId}: ${err.message}`);
    }
  }

  /**
   * Step 2: Save candidate's Initial SAY response
   */
  async saveInitialSay(sessionId: string, initialSayText: string): Promise<{ ok: boolean }> {
    const state = this.getOrCreateSessionState(sessionId);
    state.initialSayText = initialSayText;

    this.telemetryService.recordEvent(sessionId, {
      type: "INITIAL_SAY_SUBMIT",
      metadata: { textLength: initialSayText.length },
    });

    await this.sessionLogService.logAction(
      sessionId,
      QA_BUG_REPORT_SCENARIO.id,
      "INITIAL_SAY_SUBMITTED",
      "Candidate submitted Initial SAY response",
      { initialSayText },
    );

    await this.persistSessionSnapshot(sessionId);
    return { ok: true };
  }

  /**
   * Step 4 & 5: Record Telemetry Event & Backend Email Trigger
   */
  async recordTelemetry(
    sessionId: string,
    event: { type: TelemetryEventType; filepath?: string; metadata?: Record<string, any> },
  ): Promise<{ ok: boolean; emailTriggered: boolean }> {
    const wasEditBefore = this.telemetryService.hasFirstEditOccurred(sessionId);

    // Record telemetry event
    this.telemetryService.recordEvent(sessionId, {
      type: event.type,
      filepath: event.filepath,
      metadata: event.metadata,
    });

    const isEditNow = this.telemetryService.hasFirstEditOccurred(sessionId);
    const state = this.getOrCreateSessionState(sessionId);
    let justTriggered = false;

    // Backend owns email trigger: Trigger manager email on FIRST code edit
    if (!wasEditBefore && isEditNow && !state.emailTriggered) {
      state.emailTriggered = true;
      justTriggered = true;

      const managerEmailMsg: SimulationInboxMessage = {
        id: 101,
        from: `${QA_BUG_REPORT_SCENARIO.managerEmail.fromName}`,
        role: `${QA_BUG_REPORT_SCENARIO.managerEmail.fromRole}`,
        subject: QA_BUG_REPORT_SCENARIO.managerEmail.subject,
        body: QA_BUG_REPORT_SCENARIO.managerEmail.body,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        read: false,
        expectsReply: true,
      };

      state.inboxMessages.push(managerEmailMsg);

      this.logger.log(`[Backend Email Trigger] First code edit detected for session ${sessionId}. Created Manager Email from ${managerEmailMsg.from}`);

      await this.sessionLogService.logAction(
        sessionId,
        QA_BUG_REPORT_SCENARIO.id,
        "MANAGER_EMAIL_TRIGGERED",
        "Manager email automatically generated by backend on first code edit",
        managerEmailMsg,
      );
    }

    await this.persistSessionSnapshot(sessionId);
    return { ok: true, emailTriggered: justTriggered || state.emailTriggered };
  }

  private formatActionLabel(type: string, payload?: Record<string, any>): string {
    const rawType = (type || "").toUpperCase();
    const rawAction = (payload?.action || "").toUpperCase();
    const filepath = payload?.filepath || "login_validation.py";

    if (rawType.includes("FILE_EDIT") || rawAction.includes("FILE_EDIT")) {
      return `Modified ${filepath}`;
    }
    if (rawType.includes("FILE_OPEN") || rawAction.includes("FILE_OPEN")) {
      return `Inspected ${filepath}`;
    }
    if (rawType.includes("TEST_EXECUTE") || rawAction.includes("TEST_EXECUTE")) {
      return `Executed diagnostic test suite`;
    }
    if (rawType.includes("EMAIL_REPLY") || rawAction.includes("EMAIL_REPLY")) {
      return `Submitted manager email reply`;
    }
    if (rawType.includes("INITIAL_SAY") || rawAction.includes("INITIAL_SAY")) {
      return `Submitted Initial SAY plan`;
    }
    if (rawType.includes("MANAGER_EMAIL_TRIGGERED") || rawAction.includes("MANAGER_EMAIL_TRIGGERED")) {
      return `Received incoming email from Manager`;
    }
    if (rawType.includes("SIMULATION_SUBMITTED") || rawAction.includes("SIMULATION_SUBMITTED")) {
      return `Submitted final incident solution`;
    }
    return payload?.action || type || "Candidate action logged";
  }

  /**
   * Get Live Candidate Telemetry Actions Stream (persisted DB + memory)
   */
  async getCandidateActions(sessionId: string) {
    const actionsMap = new Map<string, { timestamp: string; rawTime: number; type: string; label: string }>();

    try {
      const sessionState = await this.sessionLogService.getSession(sessionId);
      if (sessionState && sessionState.eventStates) {
        for (const eventId of Object.keys(sessionState.eventStates)) {
          const ev = sessionState.eventStates[eventId];
          if (Array.isArray(ev.actions)) {
            for (const a of ev.actions) {
              const dt = new Date(a.timestamp);
              const key = `${a.timestamp}_${a.state}`;
              actionsMap.set(key, {
                timestamp: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                rawTime: dt.getTime(),
                type: a.state || "ACTION",
                label: this.formatActionLabel(a.state, a.payload),
              });
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Could not load persistent candidate actions for session ${sessionId}:`, err);
    }

    const memoryStream = this.telemetryService.getEventStream(sessionId);
    for (const e of memoryStream) {
      const dt = new Date(e.timestamp);
      const key = `${e.timestamp}_${e.type}`;
      if (!actionsMap.has(key)) {
        actionsMap.set(key, {
          timestamp: dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          rawTime: dt.getTime(),
          type: e.type,
          label: this.formatActionLabel(e.type, { filepath: e.filepath, ...e.metadata }),
        });
      }
    }

    const sorted = Array.from(actionsMap.values()).sort((a, b) => a.rawTime - b.rawTime);
    return sorted.map(({ timestamp, type, label }) => ({ timestamp, type, label }));
  }

  /**
   * Get Candidate Inbox Messages
   */
  getInbox(sessionId: string): SimulationInboxMessage[] {
    const state = this.getOrCreateSessionState(sessionId);
    return state.inboxMessages;
  }

  /**
   * Mark all inbox messages as read
   */
  markInboxRead(sessionId: string): { ok: boolean } {
    const state = this.getOrCreateSessionState(sessionId);
    state.inboxMessages.forEach((m) => {
      m.read = true;
    });
    this.persistSessionSnapshot(sessionId).catch(() => {});
    return { ok: true };
  }

  /**
   * Step 8: Save Email Reply
   */
  async saveEmailReply(sessionId: string, messageId: number, replyText: string): Promise<{ ok: boolean }> {
    const state = this.getOrCreateSessionState(sessionId);
    state.emailReplyText = replyText;

    const msg = state.inboxMessages.find((m) => m.id === messageId);
    if (msg) {
      msg.replyText = replyText;
      msg.read = true;
    }

    this.telemetryService.recordEvent(sessionId, {
      type: "EMAIL_REPLY_SUBMIT",
      metadata: { messageId, replyLength: replyText.length },
    });

    await this.sessionLogService.logAction(
      sessionId,
      QA_BUG_REPORT_SCENARIO.id,
      "EMAIL_REPLY_SUBMITTED",
      "Candidate submitted email reply to manager",
      { messageId, replyText },
    );

    await this.persistSessionSnapshot(sessionId);
    return { ok: true };
  }

  /**
   * Terminal Command Execution
   */
  async executeTerminalCommand(sessionId: string, command: string) {
    this.telemetryService.recordEvent(sessionId, {
      type: "COMMAND_RUN",
      metadata: { command },
    });

    const result = await this.sandboxOrchestrator.executeCommand(sessionId, command);
    await this.sessionLogService.logAction(
      sessionId,
      QA_BUG_REPORT_SCENARIO.id,
      "terminal_command",
      "EXECUTED",
      { command, result },
    );
    return result;
  }

  /**
   * Final Submission & 4-Part Evaluation Engine
   */
  async submitSimulation(sessionId: string, submissionPayload?: any): Promise<FullSimulationEvaluationResult> {
    const state = this.getOrCreateSessionState(sessionId);
    const telemetryEvents = this.telemetryService.getEventStream(sessionId);

    // Extract test results if present in submission payload
    const testResults = submissionPayload?.testResults || null;

    // Generate 4-part evaluation result via ContextSimulationEvaluatorService
    const evaluation = await this.evaluatorService.generateFullEvaluation(
      state.initialSayText,
      state.emailReplyText,
      telemetryEvents,
      testResults,
      QA_BUG_REPORT_SCENARIO,
    );

    // Log evaluation completion
    await this.sessionLogService.logAction(
      sessionId,
      QA_BUG_REPORT_SCENARIO.id,
      "SIMULATION_SUBMITTED_AND_EVALUATED",
      "Final Context Simulation Phase 1 MVP evaluation completed",
      evaluation,
    );

    // Find seeded SIMULATION question in DB to map ModuleResponse
    const question = await this.prisma.question.findFirst({
      where: { moduleType: ModuleType.SIMULATION },
    });

    const questionId = question?.id || QA_BUG_REPORT_SCENARIO.id;

    // Save ModuleResponse in DB
    await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId,
        },
      },
      create: {
        sessionId,
        questionId,
        responsePayload: evaluation as any,
        isDraft: false,
        timeSpentSeconds: 300,
      },
      update: {
        responsePayload: evaluation as any,
        isDraft: false,
      },
    });

    // Update Score model in DB
    const normalizedScore = evaluation.overallScore / 100;
    await this.prisma.score.upsert({
      where: { sessionId },
      create: {
        sessionId,
        compositeScore: normalizedScore,
        moduleScores: {
          SIMULATION: normalizedScore,
        },
        sayDoConsistencyScore: evaluation.sayDoCorrelation.score / 100,
        aiConfidence: 0.9,
        humanReviewed: false,
        sayDoRationale: evaluation.sayDoCorrelation.reasoning,
        gradingSource: "deterministic",
      },
      update: {
        compositeScore: normalizedScore,
        moduleScores: {
          SIMULATION: normalizedScore,
        },
        sayDoConsistencyScore: evaluation.sayDoCorrelation.score / 100,
        sayDoRationale: evaluation.sayDoCorrelation.reasoning,
      },
    });

    await this.persistSessionSnapshot(sessionId);
    return evaluation;
  }

  // --- AssessmentModuleEngine interface compliance ---
  async validateSubmission(submission: any): Promise<boolean> {
    return true;
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult> {
    const evalRes = await this.submitSimulation(sessionId, submission);
    return {
      status: ExecutionStatus.COMPLETED as any,
      score: evalRes.overallScore / 100,
      scoreDetail: evalRes,
      evaluatedAt: new Date(),
    };
  }

  async startSimulation(sessionId: string): Promise<any> {
    return {
      status: "IN_PROGRESS",
      scenario: QA_BUG_REPORT_SCENARIO,
    };
  }

  async getCurrentEvent(sessionId: string): Promise<any> {
    const state = this.getOrCreateSessionState(sessionId);
    return {
      event: {
        id: QA_BUG_REPORT_SCENARIO.id,
        title: QA_BUG_REPORT_SCENARIO.title,
        description: QA_BUG_REPORT_SCENARIO.description,
        workspaceType: "coding",
        timerSeconds: 900,
      },
      scenario: QA_BUG_REPORT_SCENARIO,
      initialSayText: state.initialSayText,
      emailReplyText: state.emailReplyText,
      inbox: state.inboxMessages,
    };
  }

  async logEventState(sessionId: string, state: string, action: string, payload?: any): Promise<void> {
    await this.sessionLogService.logAction(sessionId, QA_BUG_REPORT_SCENARIO.id, state, action, payload);
  }

  async submitEvent(sessionId: string, response: any): Promise<any> {
    return this.submitSimulation(sessionId, response);
  }

  async skipEvent(sessionId: string): Promise<any> {
    return this.submitSimulation(sessionId, { skipped: true });
  }

  async getSessionSummary(sessionId: string): Promise<any> {
    const state = this.getOrCreateSessionState(sessionId);
    return {
      module: "context_simulation",
      scenarioId: QA_BUG_REPORT_SCENARIO.id,
      hasInitialSay: !!state.initialSayText,
      hasEmailReply: !!state.emailReplyText,
    };
  }

  /**
   * Run Simulation Code against reproduction test cases in native Python/Node sandbox
   */
  async runSimulationCode(
    sessionId: string,
    dto: { code: string; language: "python" | "javascript"; testCases?: any[] },
  ) {
    const cases = dto.testCases || QA_BUG_REPORT_SCENARIO.testCases;
    const language = dto.language || "python";
    const sourceCode = dto.code || "";

    this.logger.log(`Executing ${language} simulation diagnostics for session ${sessionId}...`);

    if (language === "javascript") {
      return this.runJsCode(sourceCode, cases);
    } else {
      return this.runPythonCode(sourceCode, cases);
    }
  }

  private async runPythonCode(sourceCode: string, testCases: any[]) {
    const payloadB64 = Buffer.from(JSON.stringify({ code: sourceCode, testCases })).toString("base64");
    const tempFile = path.join(os.tmpdir(), `py_runner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.py`);

    const runnerContent = `import json, sys, base64

raw_payload = """${payloadB64}"""
payload = json.loads(base64.b64decode(raw_payload).decode('utf-8'))
source_code = payload.get('code', '')
test_cases = payload.get('testCases', [])

try:
    exec_globals = {}
    exec(source_code, exec_globals)
    fn = exec_globals.get('validate_username') or exec_globals.get('validateUsername')
    
    results = []
    for tc in test_cases:
        raw_input = tc.get('input', '')
        expected_norm = str(tc.get('expectedOutput', '')).strip().lower()
        clean_arg = raw_input.strip('"\\'')
        
        if not fn:
            results.append({
                "label": tc.get("label", "Test Case"),
                "passed": False,
                "actual": "Error: Function validate_username not defined",
                "expected": tc.get("expectedOutput", "true")
            })
            continue

        try:
            res = fn(clean_arg)
            actual = str(bool(res)).lower()
            passed = (actual == expected_norm)
            results.append({
                "label": tc.get("label", "Test Case"),
                "passed": passed,
                "actual": actual,
                "expected": tc.get("expectedOutput", "true")
            })
        except Exception as e:
            results.append({
                "label": tc.get("label", "Test Case"),
                "passed": False,
                "actual": f"RuntimeError: {e}",
                "expected": tc.get("expectedOutput", "true")
            })
            
    print(json.dumps(results))
except Exception as global_err:
    print(json.dumps([{
        "label": tc.get("label", "Test Case"),
        "passed": False,
        "actual": f"SyntaxError: {global_err}",
        "expected": tc.get("expectedOutput", "true")
    } for tc in test_cases]))
`;

    try {
      fs.writeFileSync(tempFile, runnerContent, "utf-8");
    } catch (err: any) {
      this.logger.error(`Failed writing Python runner temp file: ${err.message}`);
    }

    return new Promise((resolve) => {
      const pyCmd = process.platform === "win32" ? "py" : "python3";
      const args = process.platform === "win32" ? ["-3", tempFile] : [tempFile];

      execFile(pyCmd, args, { timeout: 4000 }, (error, stdout, stderr) => {
        // Clean up temp file
        try {
          if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch {}

        if (error || !stdout.trim()) {
          const errOutput = stderr || error?.message || "Execution error";
          resolve(
            testCases.map((tc) => ({
              label: tc.label || "Test Case",
              passed: false,
              actual: `SyntaxError: ${errOutput.slice(0, 100)}`,
              expected: tc.expectedOutput || "true",
            })),
          );
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch {
          resolve(
            testCases.map((tc) => ({
              label: tc.label || "Test Case",
              passed: false,
              actual: "Error parsing Python output",
              expected: tc.expectedOutput || "true",
            })),
          );
        }
      });
    });
  }

  private runJsCode(sourceCode: string, testCases: any[]) {
    return new Promise((resolve) => {
      try {
        const cleanCode = sourceCode.replace(/module\.exports\s*=\s*{[^}]*};?/g, "");
        const context = vm.createContext({});
        vm.runInContext(cleanCode, context);
        const fn = (context as any).validateUsername || (context as any).validate_username;

        const results = testCases.map((tc) => {
          const rawInput = tc.input || "";
          const expectedNorm = String(tc.expectedOutput || "").trim().toLowerCase();
          const cleanArg = rawInput.replace(/^"|"$/g, "").replace(/^'|'$/g, "");

          if (typeof fn !== "function") {
            return {
              label: tc.label || "Test Case",
              passed: false,
              actual: "Error: function validateUsername not found",
              expected: tc.expectedOutput || "true",
            };
          }

          try {
            const res = fn(cleanArg);
            const actual = String(Boolean(res)).toLowerCase();
            const passed = actual === expectedNorm;
            return {
              label: tc.label || "Test Case",
              passed,
              actual,
              expected: tc.expectedOutput || "true",
            };
          } catch (err: any) {
            return {
              label: tc.label || "Test Case",
              passed: false,
              actual: `RuntimeError: ${err.message}`,
              expected: tc.expectedOutput || "true",
            };
          }
        });

        resolve(results);
      } catch (err: any) {
        resolve(
          testCases.map((tc) => ({
            label: tc.label || "Test Case",
            passed: false,
            actual: `SyntaxError: ${err.message}`,
            expected: tc.expectedOutput || "true",
          })),
        );
      }
    });
  }
}
