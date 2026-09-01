import { Injectable, BadRequestException, NotFoundException, Logger, Optional, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";
import { SessionLogService, SimulationSession } from "./session-log.service";
import { EventGenerationService } from "./event-generation.service";
import { CompetencyEngine } from "./competency-engine";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";
import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import { SandboxOrchestratorService } from "./sandbox/sandbox-orchestrator.service";
import { SimulationTelemetryService, TelemetryEventType, TelemetryEvent } from "./simulation-telemetry.service";
import { ContextSimulationEvaluatorService, FullSimulationEvaluationResult } from "./context-simulation-evaluator.service";
import { MinioService } from "../integrations/minio/minio.service";
import { execFile } from "child_process";
import * as vm from "vm";
import * as fs from "fs"; 
import * as path from "path";
import * as os from "os";
import { getScenarioById, SCENARIO_REGISTRY } from "./scenarios";
import { ContextSimulationScenarioConfig } from "./scenarios/scenario-type.interface";

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
export class SimulationService implements AssessmentModuleEngine, OnModuleInit {
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
    private sandboxOrchestrator: SandboxOrchestratorService,
    private telemetryService: SimulationTelemetryService,
    private evaluatorService: ContextSimulationEvaluatorService,
    @Optional() private minioService?: MinioService,
    @Optional() private engineRegistry?: AssessmentEngineRegistry,
  ) {}

  onModuleInit() {
    this.engineRegistry?.registerEngine(this);
  }

  async validateSubmission(submission: any): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    return !!(
      submission.code ||
      submission.fixedCode ||
      submission.initialSayText ||
      submission.emailReplyText ||
      submission.testResults ||
      submission.responses
    );
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult<FullSimulationEvaluationResult>> {
    const evalResult = await this.submitSimulation(sessionId, submission);
    const score = Math.max(0.0, Math.min(1.0, (evalResult.overallScore || 0) / 100));

    return {
      status: ExecutionStatus.COMPLETED,
      score,
      scoreDetail: evalResult,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Return scenario configuration dynamically from DB or fallback
   */
  async getScenarioConfig(sessionId?: string): Promise<ContextSimulationScenarioConfig> {
    try {
      if (sessionId) {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            drive: {
              include: {
                questions: {
                  where: { moduleType: "SIMULATION" },
                  include: { question: true },
                },
              },
            },
          },
        });

        const driveSimQuestion = session?.drive?.questions?.[0]?.question;
        if (driveSimQuestion && driveSimQuestion.content) {
          const content = driveSimQuestion.content as any;
          const scId = content.id || content.title || "";
          return getScenarioById(scId);
        }
      }

      // Query any published SIMULATION question from DB
      const dbSimQuestion = await this.prisma.question.findFirst({
        where: { moduleType: "SIMULATION", status: "PUBLISHED" },
      });

      if (dbSimQuestion && dbSimQuestion.content) {
        const content = dbSimQuestion.content as any;
        const scId = content.id || content.title || "";
        return getScenarioById(scId);
      }
    } catch (err: any) {
      this.logger.warn(`Could not load simulation question from DB: ${err.message}. Using default scenario.`);
    }

    return getScenarioById("qa-bug-login-validation");
  }

  /**
   * Return candidate-safe scenario configuration (removes grading schema and hidden tests)
   */
  async getSanitizedScenarioConfig(sessionId?: string): Promise<any> {
    const config = await this.getScenarioConfig(sessionId);
    return {
      id: config.id,
      title: config.title,
      description: config.description,
      track: config.track,
      initialSayPrompt: config.initialSayPrompt,
      managerEmail: config.managerEmail,
      starterCode: config.starterCode,
      testCases: (config.testCases || [])
        .filter((tc) => !tc.isHidden)
        .map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          label: tc.label,
        })),
      readonlyFiles: config.readonlyFiles,
      checklist: config.checklist,
      slackMessages: config.slackMessages,
      jiraTicket: config.jiraTicket,
      prComments: config.prComments,
      defaultFile: config.defaultFile,
      terminalInfo: config.terminalInfo,
    };
  }

  /**
   * Helper to fetch or initialize session state with DB hydration
   */
  private async getOrCreateSessionState(sessionId: string) {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      let snapshot: any = null;
      try {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
          select: { simulationSnapshot: true },
        });
        snapshot = session?.simulationSnapshot;
      } catch (err: any) {
        this.logger.warn(`Could not read simulationSnapshot from DB for session ${sessionId}: ${err.message}`);
      }

      state = {
        initialSayText: snapshot?.initialSayText || "",
        emailReplyText: snapshot?.emailReplyText || "",
        emailTriggered: Boolean(snapshot?.emailTriggered),
        inboxMessages: Array.isArray(snapshot?.inboxMessages) ? snapshot.inboxMessages : [],
      };
      this.sessionStates.set(sessionId, state);
    }

    // Ensure inboxMessages has the default Manager Email ONLY if emailTriggered is true
    if (state.emailTriggered && state.inboxMessages.length === 0) {
      const scenario = await this.getScenarioConfig(sessionId);
      const managerEmailMsg: SimulationInboxMessage = {
        id: 101,
        from: `${scenario.managerEmail.fromName}`,
        role: `${scenario.managerEmail.fromRole}`,
        subject: scenario.managerEmail.subject,
        body: scenario.managerEmail.body,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        read: false,
        expectsReply: true,
      };
      state.inboxMessages.push(managerEmailMsg);
    }

    return state;
  }

  /**
   * Persist current session snapshot into Prisma DB (session.simulationSnapshot)
   */
  private async persistSessionSnapshot(sessionId: string): Promise<void> {
    const state = await this.getOrCreateSessionState(sessionId);
    const telemetry = await this.getUnifiedTelemetryEvents(sessionId);
    const actions = await this.getCandidateActions(sessionId);

    try {
      const existingSession = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { simulationSnapshot: true },
      });
      const existingSnapshot = (existingSession?.simulationSnapshot as any) || {};

      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          simulationSnapshot: {
            ...existingSnapshot,
            initialSayText: state.initialSayText || existingSnapshot.initialSayText || null,
            emailReplyText: state.emailReplyText || existingSnapshot.emailReplyText || null,
            emailTriggered: state.emailTriggered ?? existingSnapshot.emailTriggered ?? false,
            inboxMessages: state.inboxMessages || existingSnapshot.inboxMessages || [],
            telemetryCount: Math.max(telemetry.length, actions.length, existingSnapshot.telemetryCount || 0),
            telemetryActions: actions.length > 0 ? actions : existingSnapshot.telemetryActions || [],
            rawTelemetryEvents: telemetry,
            lastUpdated: new Date().toISOString(),
          } as any,
        },
      });
    } catch (err: any) {
      this.logger.warn(`simulationSnapshot DB update failed for session ${sessionId}: ${err.message}`);
    }
  }

  /**
   * Step 2: Save candidate's Initial SAY response
   */
  async saveInitialSay(sessionId: string, initialSayText: string): Promise<{ ok: boolean }> {
    const state = await this.getOrCreateSessionState(sessionId);
    state.initialSayText = initialSayText;

    this.telemetryService.recordEvent(sessionId, {
      type: "INITIAL_SAY_SUBMIT",
      metadata: { textLength: initialSayText.length },
    });

    const scenario = await this.getScenarioConfig(sessionId);

    await this.sessionLogService.logAction(
      sessionId,
      scenario.id,
      "INITIAL_SAY_SUBMITTED",
      "Candidate submitted Initial SAY response",
      { initialSayText },
    );

    // Save ModuleResponse in DB
    const questionId = scenario?.id || "qa-bug-login-validation";

    try {
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
          responsePayload: {
            initialSayText,
            sayText: initialSayText,
            status: "INITIAL_SAY_SUBMITTED",
            moduleType: ModuleType.SIMULATION,
          } as any,
          isDraft: false,
          timeSpentSeconds: 60,
        },
        update: {
          responsePayload: {
            initialSayText,
            sayText: initialSayText,
            status: "INITIAL_SAY_SUBMITTED",
            moduleType: ModuleType.SIMULATION,
          } as any,
          isDraft: false,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to upsert Initial SAY ModuleResponse: ${err.message}`);
    }

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
    const state = await this.getOrCreateSessionState(sessionId);
    let justTriggered = false;

    // Backend owns email trigger: Trigger manager email on code edit or test execution if not triggered yet
    const isCodeAction = event.type === "FILE_EDIT" || event.type === "TEST_EXECUTE" || isEditNow;
    if (isCodeAction && !state.emailTriggered) {
      state.emailTriggered = true;
      justTriggered = true;

      const scenarioConfig = await this.getScenarioConfig(sessionId);

      const managerEmailMsg: SimulationInboxMessage = {
        id: 101,
        from: `${scenarioConfig.managerEmail.fromName}`,
        role: `${scenarioConfig.managerEmail.fromRole}`,
        subject: scenarioConfig.managerEmail.subject,
        body: scenarioConfig.managerEmail.body,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        read: false,
        expectsReply: true,
      };

      // Check if message is already in inbox
      if (!state.inboxMessages.some((m) => m.id === 101)) {
        state.inboxMessages.push(managerEmailMsg);
      }

      this.logger.log(`[Backend Email Trigger] Code edit/action detected for session ${sessionId}. Created Manager Email from ${managerEmailMsg.from}`);

      await this.sessionLogService.logAction(
        sessionId,
        scenarioConfig.id,
        "MANAGER_EMAIL_TRIGGERED",
        "Manager email automatically generated by backend on first code edit",
        managerEmailMsg,
      );
    }

    await this.persistSessionSnapshot(sessionId);
    return { ok: true, emailTriggered: justTriggered };
  }

  private formatActionLabel(type: string, payload?: Record<string, any>): string {
    const rawType = (type || "").toUpperCase();
    const rawAction = (payload?.action || "").toUpperCase();
    const filepath = payload?.filepath || payload?.metadata?.filepath || "code_workspace";

    if (rawType.includes("FILE_EDIT") || rawAction.includes("FILE_EDIT")) {
      return `Modified ${filepath}`;
    }
    if (rawType.includes("FILE_OPEN") || rawAction.includes("FILE_OPEN")) {
      return `Inspected ${filepath}`;
    }
    if (rawType.includes("TEST_EXECUTE") || rawAction.includes("TEST_EXECUTE") || rawType.includes("RUN_CODE")) {
      const passCount = payload?.passCount ?? payload?.metadata?.passCount;
      const totalCount = payload?.totalCount ?? payload?.metadata?.totalCount;
      if (passCount !== undefined && totalCount !== undefined) {
        return `Executed diagnostic test suite (${passCount}/${totalCount} passed)`;
      }
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
    if (rawType.includes("COMMAND_RUN") || rawAction.includes("COMMAND_RUN") || rawType.includes("TERMINAL_COMMAND")) {
      const cmd = payload?.command || payload?.metadata?.command || "";
      return cmd ? `Executed terminal command: ${cmd}` : `Executed terminal command`;
    }
    return payload?.label || payload?.action || type || "Candidate action logged";
  }

  /**
   * Reconstruct unified TelemetryEvent stream combining memory, DB eventLogs, DB snapshot, and ModuleResponses
   */
  async getUnifiedTelemetryEvents(sessionId: string): Promise<TelemetryEvent[]> {
    const eventsMap = new Map<string, TelemetryEvent>();

    // 1. In-memory stream
    const memoryEvents = this.telemetryService.getEventStream(sessionId);
    for (const evt of memoryEvents) {
      eventsMap.set(`${evt.timestamp}_${evt.type}_${evt.filepath || ""}`, evt);
    }

    // 2. Fetch DB session with eventLogs and moduleResponses
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: { eventLogs: true, moduleResponses: true } as any,
      });

      const logs = (session as any)?.eventLogs || [];
      for (const log of logs) {
        const payload = (log.payload as any) || {};
        const timestamp = log.occurredAt ? new Date(log.occurredAt).toISOString() : log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString();
        let evtType: TelemetryEventType = "FILE_OPEN";

        if (log.eventType.includes("INITIAL_SAY")) evtType = "INITIAL_SAY_SUBMIT";
        else if (log.eventType.includes("EMAIL_REPLY")) evtType = "EMAIL_REPLY_SUBMIT";
        else if (log.eventType.includes("TEST_EXECUTE") || log.eventType.includes("run_code")) evtType = "TEST_EXECUTE";
        else if (log.eventType.includes("FILE_EDIT")) evtType = "FILE_EDIT";
        else if (log.eventType.includes("FILE_OPEN")) evtType = "FILE_OPEN";
        else if (log.eventType.includes("COMMAND") || log.eventType.includes("terminal")) evtType = "COMMAND_RUN";
        else continue;

        const key = `${timestamp}_${evtType}_${payload.filepath || ""}`;
        if (!eventsMap.has(key)) {
          eventsMap.set(key, {
            id: `evt_db_${log.id}`,
            sessionId,
            type: evtType,
            filepath: payload.filepath || "workspace_file",
            timestamp,
            metadata: payload,
          });
        }
      }

      // 3. Fallback from moduleResponses if specific phases occurred
      const responses = (session as any)?.moduleResponses || [];
      for (const res of responses) {
        const payload = (res.responsePayload as any) || {};
        const timestamp = res.lastAutosavedAt ? new Date(res.lastAutosavedAt).toISOString() : new Date().toISOString();

        if (payload.initialSayText || payload.sayText) {
          if (!Array.from(eventsMap.values()).some((e) => e.type === "INITIAL_SAY_SUBMIT")) {
            eventsMap.set(`synth_say_${sessionId}`, {
              id: `evt_synth_say`,
              sessionId,
              type: "INITIAL_SAY_SUBMIT",
              timestamp,
              metadata: { textLength: (payload.initialSayText || payload.sayText || "").length },
            });
          }
        }

        if (payload.emailReplyText || payload.ticketReply) {
          if (!Array.from(eventsMap.values()).some((e) => e.type === "EMAIL_REPLY_SUBMIT")) {
            eventsMap.set(`synth_email_${sessionId}`, {
              id: `evt_synth_email`,
              sessionId,
              type: "EMAIL_REPLY_SUBMIT",
              timestamp,
              metadata: { replyLength: (payload.emailReplyText || payload.ticketReply || "").length },
            });
          }
        }

        if (payload.fixedCode || payload.isCorrect !== undefined || payload.passedTests !== undefined) {
          if (!Array.from(eventsMap.values()).some((e) => e.type === "TEST_EXECUTE")) {
            eventsMap.set(`synth_test_${sessionId}`, {
              id: `evt_synth_test`,
              sessionId,
              type: "TEST_EXECUTE",
              filepath: "workspace_file",
              timestamp,
              metadata: { passCount: payload.passedTests ?? 3, totalCount: payload.totalTests ?? 3 },
            });
          }
          if (!Array.from(eventsMap.values()).some((e) => e.type === "FILE_EDIT")) {
            eventsMap.set(`synth_edit_${sessionId}`, {
              id: `evt_synth_edit`,
              sessionId,
              type: "FILE_EDIT",
              filepath: "workspace_file",
              timestamp,
              metadata: { codeLength: (payload.fixedCode || payload.code || "").length },
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not construct unified telemetry events for session ${sessionId}: ${err.message}`);
    }

    return Array.from(eventsMap.values());
  }

  /**
   * Get Live Candidate Telemetry Actions Stream (persisted DB + memory + SessionLog)
   */
  async getCandidateActions(sessionId: string): Promise<Array<{ timestamp: string; type: string; label: string }>> {
    const actionsMap = new Map<string, { timestamp: string; rawTime: number; type: string; label: string }>();

    // 1. Read existing telemetryActions from DB simulationSnapshot
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { simulationSnapshot: true },
      });
      const snapActions = (session?.simulationSnapshot as any)?.telemetryActions;
      if (Array.isArray(snapActions)) {
        for (const act of snapActions) {
          if (act && act.label) {
            const timeStr = act.timestamp || "00:00:00";
            const key = `${timeStr}_${act.label}`;
            actionsMap.set(key, {
              timestamp: timeStr,
              rawTime: Date.parse(act.timestamp) || Date.now(),
              type: act.type || "ACTION",
              label: act.label,
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not read snapshot telemetryActions for session ${sessionId}: ${err.message}`);
    }

    // 2. Add memoryStream events
    const memoryStream = this.telemetryService.getEventStream(sessionId);
    for (const e of memoryStream) {
      const dt = new Date(e.timestamp);
      const label = this.formatActionLabel(e.type, { filepath: e.filepath, ...e.metadata });
      const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const key = `${timeStr}_${label}`;
      if (!actionsMap.has(key)) {
        actionsMap.set(key, {
          timestamp: timeStr,
          rawTime: dt.getTime(),
          type: e.type,
          label,
        });
      }
    }

    // 3. Fallback/Supplement from eventLogs and moduleResponses in DB
    try {
      const sessionWithLogs = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: { eventLogs: true, moduleResponses: true } as any,
      });
      const logs = (sessionWithLogs as any)?.eventLogs || [];
      for (const log of logs) {
        const dt = log.occurredAt ? new Date(log.occurredAt) : log.createdAt ? new Date(log.createdAt) : new Date();
        const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const payload = (log.payload as any) || {};
        const label = this.formatActionLabel(log.eventType, payload);
        const key = `${timeStr}_${label}`;
        if (!actionsMap.has(key)) {
          actionsMap.set(key, {
            timestamp: timeStr,
            rawTime: dt.getTime(),
            type: log.eventType || "LOG",
            label,
          });
        }
      }

      const responses = (sessionWithLogs as any)?.moduleResponses || [];
      for (const res of responses) {
        const payload = (res.responsePayload as any) || {};
        const dt = res.lastAutosavedAt ? new Date(res.lastAutosavedAt) : new Date();
        const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        if (payload.initialSayText || payload.sayText) {
          const label = "Submitted Initial SAY plan";
          if (!Array.from(actionsMap.values()).some((a) => a.label.includes("Initial SAY"))) {
            actionsMap.set(`${timeStr}_${label}`, {
              timestamp: timeStr,
              rawTime: dt.getTime() - 300000,
              type: "INITIAL_SAY_SUBMIT",
              label,
            });
          }
        }

        if (payload.emailReplyText || payload.ticketReply) {
          const label = "Submitted manager email reply";
          if (!Array.from(actionsMap.values()).some((a) => a.label.includes("manager email reply"))) {
            actionsMap.set(`${timeStr}_${label}`, {
              timestamp: timeStr,
              rawTime: dt.getTime() - 60000,
              type: "EMAIL_REPLY_SUBMIT",
              label,
            });
          }
        }

        if (payload.fixedCode || payload.isCorrect !== undefined || payload.passedTests !== undefined) {
          const passCount = payload.passedTests !== undefined ? payload.passedTests : 3;
          const totalCount = payload.totalTests !== undefined ? payload.totalTests : 3;
          const label = `Executed diagnostic test suite (${passCount}/${totalCount} passed)`;
          if (!Array.from(actionsMap.values()).some((a) => a.label.includes("diagnostic test suite"))) {
            actionsMap.set(`${timeStr}_${label}`, {
              timestamp: timeStr,
              rawTime: dt.getTime() - 3000,
              type: "TEST_EXECUTE",
              label,
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not supplement eventLogs for session ${sessionId}: ${err.message}`);
    }

    const sorted = Array.from(actionsMap.values()).sort((a, b) => a.rawTime - b.rawTime);
    return sorted.map(({ timestamp, type, label }) => ({ timestamp, type, label }));
  }

  /**
   * Get Candidate Inbox Messages
   */
  async getInbox(sessionId: string): Promise<SimulationInboxMessage[]> {
    const state = await this.getOrCreateSessionState(sessionId);
    return state.inboxMessages;
  }

  /**
   * Mark all inbox messages as read
   */
  async markInboxRead(sessionId: string): Promise<{ ok: boolean }> {
    const state = await this.getOrCreateSessionState(sessionId);
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
    const state = await this.getOrCreateSessionState(sessionId);
    state.emailReplyText = replyText;

    const scenario = await this.getScenarioConfig(sessionId);

    let msg = state.inboxMessages.find((m) => m.id === messageId);
    if (!msg && state.inboxMessages.length > 0) {
      msg = state.inboxMessages[0];
    }
    if (msg) {
      msg.replyText = replyText;
      msg.read = true;
    } else {
      state.inboxMessages.push({
        id: messageId || 101,
        from: `${scenario.managerEmail.fromName}`,
        role: `${scenario.managerEmail.fromRole}`,
        subject: scenario.managerEmail.subject,
        body: scenario.managerEmail.body,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        read: true,
        expectsReply: true,
        replyText,
      });
    }

    this.telemetryService.recordEvent(sessionId, {
      type: "EMAIL_REPLY_SUBMIT",
      metadata: { messageId, replyLength: replyText.length },
    });

    await this.sessionLogService.logAction(
      sessionId,
      scenario.id,
      "EMAIL_REPLY_SUBMITTED",
      "Candidate submitted email reply to manager",
      { messageId, replyText },
    );

    // Save ModuleResponse in DB for manager email reply
    const questionId = scenario?.id || "qa-bug-login-validation";

    try {
      const existingResp = await this.prisma.moduleResponse.findUnique({
        where: {
          sessionId_questionId: {
            sessionId,
            questionId,
          },
        },
      });
      const currentPayload = (existingResp?.responsePayload as any) || {};

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
          responsePayload: {
            ...currentPayload,
            initialSayText: state.initialSayText || currentPayload.initialSayText || "",
            emailReplyText: replyText,
            ticketReply: replyText,
            status: "EMAIL_REPLIED",
            moduleType: ModuleType.SIMULATION,
          } as any,
          isDraft: false,
          timeSpentSeconds: 120,
        },
        update: {
          responsePayload: {
            ...currentPayload,
            initialSayText: state.initialSayText || currentPayload.initialSayText || "",
            emailReplyText: replyText,
            ticketReply: replyText,
            status: "EMAIL_REPLIED",
            moduleType: ModuleType.SIMULATION,
          } as any,
          isDraft: false,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to upsert Email Reply ModuleResponse: ${err.message}`);
    }

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

    const scenario = await this.getScenarioConfig(sessionId);
    const result = await this.sandboxOrchestrator.executeCommand(sessionId, command);
    await this.sessionLogService.logAction(
      sessionId,
      scenario.id,
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
    const state = await this.getOrCreateSessionState(sessionId);
    const telemetryEvents = await this.getUnifiedTelemetryEvents(sessionId);
    const candidateActions = await this.getCandidateActions(sessionId);

    // Resolve scenario config and questionId consistently across all sources
    const scenarioConfig = await this.getScenarioConfig(sessionId);
    const questionId = scenarioConfig?.id || "qa-bug-login-validation";

    // Ensure state captures email reply and say text passed in signoffData
    if (submissionPayload?.emailReplyText && !state.emailReplyText) {
      state.emailReplyText = submissionPayload.emailReplyText;
    }
    if (submissionPayload?.initialSayText && !state.initialSayText) {
      state.initialSayText = submissionPayload.initialSayText;
    }

    // Extract test results if present in submission payload
    const testResults = submissionPayload?.testResults || null;

    // Generate 4-part evaluation result via ContextSimulationEvaluatorService
    let evaluation: FullSimulationEvaluationResult;
    try {
      evaluation = await this.evaluatorService.generateFullEvaluation(
        state.initialSayText,
        state.emailReplyText,
        telemetryEvents,
        testResults,
        scenarioConfig,
      );
    } catch (evalErr: any) {
      this.logger.warn(`[submitSimulation] Evaluation service failed for session ${sessionId}: ${evalErr.message}. Using deterministic fallback.`);
      // Graceful deterministic fallback — never throw 500
      const baseScore = testResults?.isCorrect ? 75 : testResults?.passedTests && testResults?.totalTests ? Math.round((testResults.passedTests / testResults.totalTests) * 70) : 40;
      evaluation = {
        overallScore: baseScore,
        rubricVersion: scenarioConfig.rubricVersion,
        initialSay: { score: state.initialSayText ? 60 : 0, reasoning: 'Evaluated offline', strengths: [], weaknesses: [] },
        emailSay: { score: state.emailReplyText ? 60 : 0, reasoning: 'Evaluated offline', strengths: [], weaknesses: [] },
        doEvaluation: {
          behaviourScore: telemetryEvents.length > 0 ? 60 : 20,
          technicalScore: testResults?.isCorrect ? 100 : 40,
          compositeDoScore: baseScore,
          reasoning: 'Evaluated offline',
          strengths: [],
          weaknesses: [],
        },
        sayDoCorrelation: { score: 50, reasoning: 'Offline evaluation', strengths: [], weaknesses: [] },
        categoryBreakdown: { INITIAL_SAY: 60, EMAIL_SAY: 60, DO_BEHAVIOUR: 60, DO_TECHNICAL: 40, DO_COMPOSITE: baseScore, SAY_DO_CORRELATION: 50 },
        competencyBreakdown: { problemSolving: 60, debugging: 60, communication: 60, technicalExecution: 40, sayDoConsistency: 50 },
        recommendation: baseScore >= 70 ? 'Recommended' : baseScore >= 50 ? 'Needs Further Evaluation' : 'Not Recommended',
        recommendationReason: 'Evaluated using deterministic offline scoring.',
        strengths: ['Attempted the diagnostic scenario'],
        areasForImprovement: ['AI evaluation unavailable; manual review recommended'],
        actionTimeline: telemetryEvents.map(e => ({ timestamp: e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '00:00', action: String(e.type) })),
        summaryReasoning: `Offline evaluation: ${baseScore}/100.`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // Log evaluation completion
    await this.sessionLogService.logAction(
      sessionId,
      scenarioConfig.id,
      "SIMULATION_SUBMITTED_AND_EVALUATED",
      "Final Context Simulation evaluation completed",
      evaluation,
    );

    const payloadWithModule = {
      ...(typeof evaluation === "object" ? evaluation : {}),
      initialSayText: state.initialSayText,
      emailReplyText: state.emailReplyText,
      ticketReply: state.emailReplyText,
      moduleType: ModuleType.SIMULATION,
    };

    // Save ModuleResponse in DB
    try {
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
          responsePayload: payloadWithModule as any,
          isDraft: false,
          timeSpentSeconds: 300,
        },
        update: {
          responsePayload: payloadWithModule as any,
          isDraft: false,
        },
      });
    } catch (dbErr: any) {
      this.logger.warn(`[submitSimulation] ModuleResponse upsert failed: ${dbErr.message}`);
    }

    // Update Score model in DB
    try {
      const hasCompleteAiEval = evaluation.initialSay?.score !== null && evaluation.emailSay?.score !== null && evaluation.sayDoCorrelation?.score !== null;
      const normalizedScore = hasCompleteAiEval ? evaluation.overallScore / 100 : null;
      const coreScoreVal = hasCompleteAiEval && evaluation.overallScore !== null ? Math.round(evaluation.overallScore) : 0;
      const totalScoreVal = coreScoreVal;
      const moduleScoresJson = hasCompleteAiEval && normalizedScore !== null ? { SIMULATION: normalizedScore } : {};
      const sayDoScoreVal = hasCompleteAiEval && evaluation.sayDoCorrelation?.score !== null ? evaluation.sayDoCorrelation.score / 100 : null;

      // Calculate dynamic AI confidence based on evidence volume
      const telemetryCount = telemetryEvents.length;
      let dynamicAiConfidence: number | null = null;
      if (hasCompleteAiEval) {
        if (telemetryCount <= 2 && (!testResults || testResults.totalTests === 0)) {
          dynamicAiConfidence = 0.20; // minimal evidence / candidate didn't work in workspace
        } else if (telemetryCount <= 6) {
          dynamicAiConfidence = 0.65;
        } else {
          dynamicAiConfidence = Math.min(0.95, 0.70 + (telemetryCount * 0.01) + (testResults?.isCorrect ? 0.15 : 0));
        }
      }

      await this.prisma.score.upsert({
        where: { sessionId },
        create: {
          sessionId,
          compositeScore: coreScoreVal,
          coreScore: coreScoreVal,
          bonusScore: 0,
          totalScore: totalScoreVal,
          moduleScores: moduleScoresJson,
          sayDoConsistencyScore: sayDoScoreVal,
          aiConfidence: dynamicAiConfidence,
          humanReviewed: false,
          sayDoRationale: hasCompleteAiEval ? evaluation.sayDoCorrelation?.reasoning : "Evaluation Pending — AI evaluation provider unavailable.",
          gradingSource: hasCompleteAiEval ? "deterministic" : "pending",
        },
        update: {
          compositeScore: coreScoreVal,
          coreScore: coreScoreVal,
          totalScore: totalScoreVal,
          moduleScores: moduleScoresJson,
          sayDoConsistencyScore: sayDoScoreVal,
          aiConfidence: dynamicAiConfidence,
          sayDoRationale: hasCompleteAiEval ? evaluation.sayDoCorrelation?.reasoning : "Evaluation Pending — AI evaluation provider unavailable.",
          gradingSource: hasCompleteAiEval ? "deterministic" : "pending",
        },
      });
    } catch (scoreErr: any) {
      this.logger.warn(`[submitSimulation] Score upsert failed: ${scoreErr.message}`);
    }

    // Archive session telemetry & evaluation log bundle to MinIO if object storage is enabled
    if (this.minioService) {
      try {
        const logBundle = {
          sessionId,
          evaluatedAt: evaluation.evaluatedAt,
          initialSayText: state.initialSayText,
          emailReplyText: state.emailReplyText,
          evaluation,
          telemetryEvents,
          actionTimeline: evaluation.actionTimeline,
        };
        const buffer = Buffer.from(JSON.stringify(logBundle, null, 2), "utf8");
        await this.minioService.putObject(
          "cd-recruit-general",
          `logs/simulation/session-log-${sessionId}.json`,
          buffer,
          { "Content-Type": "application/json" } as any,
        );
        this.logger.log(`[MinIO Log Archive] Successfully stored logs/simulation/session-log-${sessionId}.json`);
      } catch (minioErr: any) {
        this.logger.warn(`[MinIO Log Archive] Warning: could not archive session log: ${minioErr.message}`);
      }
    }

    await this.persistSessionSnapshot(sessionId);
    return evaluation;
  }


  async startSimulation(sessionId: string): Promise<any> {
    const scenario = await this.getScenarioConfig(sessionId);
    return {
      status: "IN_PROGRESS",
      scenario: await this.getSanitizedScenarioConfig(sessionId),
    };
  }

  async getCurrentEvent(sessionId: string): Promise<any> {
    const state = await this.getOrCreateSessionState(sessionId);
    const scenario = await this.getScenarioConfig(sessionId);
    const sanitizedScenario = await this.getSanitizedScenarioConfig(sessionId);
    return {
      event: {
        id: scenario.id,
        title: scenario.title,
        description: scenario.description,
        workspaceType: "coding",
        timerSeconds: 900,
      },
      scenario: sanitizedScenario,
      initialSayText: state.initialSayText,
      emailReplyText: state.emailReplyText,
      inbox: state.inboxMessages,
    };
  }

  async logEventState(sessionId: string, state: string, action: string, payload?: any): Promise<void> {
    const scenario = await this.getScenarioConfig(sessionId);
    await this.sessionLogService.logAction(sessionId, scenario.id, state, action, payload);
  }

  async submitEvent(sessionId: string, response: any): Promise<any> {
    return this.submitSimulation(sessionId, response);
  }

  async skipEvent(sessionId: string): Promise<any> {
    return this.submitSimulation(sessionId, { skipped: true });
  }

  async getSessionSummary(sessionId: string): Promise<any> {
    const state = await this.getOrCreateSessionState(sessionId);
    const scenario = await this.getScenarioConfig(sessionId);
    return {
      module: "context_simulation",
      scenarioId: scenario.id,
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
    const scenario = await this.getScenarioConfig(sessionId);
    const cases = dto.testCases || scenario.testCases;
    const language = dto.language || "python";
    const sourceCode = dto.code || "";

    const state = await this.getOrCreateSessionState(sessionId);
    if (!state.emailTriggered) {
      await this.recordTelemetry(sessionId, { type: "TEST_EXECUTE" });
    }

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
    
    # Generic Scenario function resolver
    fn = None
    for name in ['validate_username', 'validateUsername', 'get_connection_pool_settings', 'getConnectionPoolSettings', 'should_skip_husky', 'shouldSkipHusky', 'load_credentials', 'loadCredentials', 'prioritize_incident', 'prioritizeIncident', 'LocalCache']:
        if name in exec_globals:
            fn = exec_globals[name]
            break
            
    if not fn:
        for k, v in exec_globals.items():
            if callable(v) and not k.startswith('__'):
                fn = v
                break

    results = []
    for tc in test_cases:
        raw_input = tc.get('input', '')
        expected_norm = str(tc.get('expectedOutput', '')).strip().lower()
        clean_arg = raw_input.strip('"\\'')
        
        if not fn:
            results.append({
                "label": tc.get("label", "Test Case"),
                "passed": False,
                "actual": "Error: Target function/class not defined",
                "expected": tc.get("expectedOutput", "true")
            })
            continue

        try:
            # Scenario-specific runner mapping
            if fn.__name__ in ['validate_username', 'validateUsername']:
                res = fn(clean_arg)
                actual = str(bool(res)).lower()
            elif fn.__name__ in ['get_connection_pool_settings', 'getConnectionPoolSettings']:
                cfg = fn(clean_arg)
                if clean_arg == "poolSize":
                    actual = str(cfg.get("pool_size", 0) >= 15 or cfg.get("poolSize", 0) >= 15).lower()
                elif clean_arg == "maxOverflow":
                    actual = str(cfg.get("max_overflow", 0) >= 15 or cfg.get("maxOverflow", 0) >= 15).lower()
                else:
                    actual = str(isinstance(cfg, dict)).lower()
            elif fn.__name__ in ['should_skip_husky', 'shouldSkipHusky']:
                if clean_arg == "CI":
                    res = fn({"CI": "true"})
                elif clean_arg == "headless":
                    res = fn({"env": "headless"})
                else:
                    res = fn({})
                actual = str(bool(res)).lower()
            elif fn.__name__ in ['load_credentials', 'loadCredentials']:
                creds = fn({})
                if clean_arg == "env":
                    actual = "true"
                elif clean_arg == "no_secrets":
                    actual = str("AKIAIOS" not in str(creds.values()) and "wJalr" not in str(creds.values())).lower()
                else:
                    actual = "true"
            elif fn.__name__ == 'LocalCache':
                cache = fn
                if clean_arg == "limitsize":
                    cache.store = {}
                    for i in range(10):
                        cache.set(f"key{i}", i)
                    count = len(cache.store) if hasattr(cache, 'store') else 0
                    actual = str(count <= 5).lower()
                elif clean_arg == "eviction":
                    cache.store = {}
                    cache.keys_order = []
                    for i in range(6):
                        cache.set(f"key{i}", i)
                    actual = str(cache.get("key0") is None and cache.get("key5") is not None).lower()
                else:
                    actual = "true"
            elif fn.__name__ in ['prioritize_incident', 'prioritizeIncident']:
                res = fn(5, 4)
                if clean_arg == "impact" or clean_arg == "mitigation":
                    actual = str(isinstance(res, (str, dict)) and res != "no_strategy").lower()
                else:
                    actual = "true"
            else:
                # Default calling fallback
                res = fn(clean_arg)
                actual = str(res).lower()
                
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
      const pyCmd = process.platform === "win32" ? "python" : "python3";
      const args = [tempFile];

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
        
        // Generic JS Scenario resolver
        let fn = (context as any).validateUsername || (context as any).validate_username ||
                 (context as any).getConnectionPoolSettings || (context as any).get_connection_pool_settings ||
                 (context as any).shouldSkipHusky || (context as any).should_skip_husky ||
                 (context as any).loadCredentials || (context as any).load_credentials ||
                 (context as any).prioritizeIncident || (context as any).prioritize_incident ||
                 (context as any).LocalCache;

        const results = testCases.map((tc) => {
          const rawInput = tc.input || "";
          const expectedNorm = String(tc.expectedOutput || "").trim().toLowerCase();
          const cleanArg = rawInput.replace(/^"|"$/g, "").replace(/^'|'$/g, "");

          if (!fn) {
            return {
              label: tc.label || "Test Case",
              passed: false,
              actual: "Error: Target function/class not found",
              expected: tc.expectedOutput || "true",
            };
          }

          try {
            let actual = "";
            
            // Check matching target function calls
            if (fn.name === "validateUsername" || fn.name === "validate_username") {
              const res = fn(cleanArg);
              actual = String(Boolean(res)).toLowerCase();
            } else if (fn.name === "getConnectionPoolSettings" || fn.name === "get_connection_pool_settings") {
              const cfg = fn(cleanArg);
              if (cleanArg === "poolSize") {
                actual = String((cfg.poolSize || cfg.pool_size || 0) >= 15).toLowerCase();
              } else if (cleanArg === "maxOverflow") {
                actual = String((cfg.maxOverflow || cfg.max_overflow || 0) >= 15).toLowerCase();
              } else {
                actual = String(typeof cfg === "object").toLowerCase();
              }
            } else if (fn.name === "shouldSkipHusky" || fn.name === "should_skip_husky") {
              let res = false;
              if (cleanArg === "CI") {
                res = fn({ CI: "true" });
              } else if (cleanArg === "headless") {
                res = fn({ env: "headless" });
              } else {
                res = fn({});
              }
              actual = String(Boolean(res)).toLowerCase();
            } else if (fn.name === "loadCredentials" || fn.name === "load_credentials") {
              const creds = fn({});
              if (cleanArg === "env") {
                actual = "true";
              } else if (cleanArg === "no_secrets") {
                const vals = Object.values(creds || {});
                actual = String(!vals.some(v => String(v).includes("AKIAIOS") || String(v).includes("wJalr"))).toLowerCase();
              } else {
                actual = "true";
              }
            } else if (fn.name === "prioritizeIncident" || fn.name === "prioritize_incident") {
              const res = fn(5, 4);
              if (cleanArg === "impact" || cleanArg === "mitigation") {
                actual = String(typeof res === "string" && res !== "no_strategy" || typeof res === "object").toLowerCase();
              } else {
                actual = "true";
              }
            } else if (fn.name === "LocalCache" || typeof fn === "function" && fn.set) {
              const cache = fn;
              if (cleanArg === "limitsize") {
                cache.store = new Map();
                for (let i = 0; i < 10; i++) {
                  cache.set(`key${i}`, i);
                }
                const count = cache.store.size || cache.store.length || 0;
                actual = String(count <= 5).toLowerCase();
              } else if (cleanArg === "eviction") {
                cache.store = new Map();
                cache.keys_order = [];
                for (let i = 0; i < 6; i++) {
                  cache.set(`key${i}`, i);
                }
                actual = String(cache.get("key0") === undefined && cache.get("key5") !== undefined).toLowerCase();
              } else {
                actual = "true";
              }
            } else {
              actual = String(fn(cleanArg)).toLowerCase();
            }

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
