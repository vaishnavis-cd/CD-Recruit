import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import {
  SessionLogService,
  SimulationSession,
  SimulationEventState,
} from "./session-log.service";
import { eventTemplates, EventTemplate } from "./event-template-library";
import { EventGenerationService } from "./event-generation.service";
import { CompetencyEngine, EventScoreDetail } from "./competency-engine";
import { CorrelationEngineClient } from "../common/correlation-engine.client";
import { CorrelationGradingService } from "./correlation-grading.service";

import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";
import { ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";

@Injectable()
export class SimulationService implements AssessmentModuleEngine {
  readonly moduleType = ModuleType.SIMULATION;

  constructor(
    private prisma: PrismaService,
    private sessionLogService: SessionLogService,
    private eventGenerationService: EventGenerationService,
    private competencyEngine: CompetencyEngine,
    private correlationClient: CorrelationEngineClient,
    private correlationGradingService: CorrelationGradingService,
  ) {}

  async validateSubmission(submission: any): Promise<boolean> {
    return !!(submission && submission.eventId && submission.action);
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult> {
    const res = await this.submitEvent(sessionId, submission);
    return {
      status: ExecutionStatus.COMPLETED as any,
      score: 0.8,
      scoreDetail: res,
      evaluatedAt: new Date(),
    };
  }

  async startSimulation(sessionId: string): Promise<SimulationSession> {
    let session = await this.sessionLogService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException(
        "Simulation session could not be retrieved",
      );
    }

    if (
      Object.keys(session.eventStates).length === 0 &&
      session.eventsList.length > 0
    ) {
      // Initialize the first event state as LOADED
      const firstEventId = session.eventsList[0];
      await this.sessionLogService.logAction(
        sessionId,
        firstEventId,
        "LOADED",
        "Simulation Started",
      );
    }

    session = await this.sessionLogService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Simulation session not found for ID ${sessionId}`);
    }
    return session;
  }

  async getCurrentEvent(sessionId: string): Promise<{
    event: EventTemplate & { enrichedContent?: any };
    index: number;
    total: number;
    state: string;
    timerSeconds: number;
  }> {
    const session = await this.sessionLogService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException("Session not found");
    }

    if (session.status === "COMPLETED") {
      throw new BadRequestException("Context Simulation is already completed");
    }

    const index = session.currentEventIndex;
    const total = session.eventsList.length;

    if (index >= total) {
      throw new BadRequestException(
        "All events in this track have been completed",
      );
    }

    const eventId = session.eventsList[index];

    // Initialize event state if it doesn't exist
    let eventState = session.eventStates[eventId];
    if (!eventState) {
      await this.sessionLogService.logAction(
        sessionId,
        eventId,
        "LOADED",
        "Event Loaded",
      );
      const freshSession = await this.sessionLogService.getSession(sessionId);
      if (!freshSession) {
        throw new NotFoundException(`Simulation session not found`);
      }
      eventState = freshSession.eventStates[eventId];
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId);
    const question = isUuid
      ? await this.prisma.question.findUnique({ where: { id: eventId } })
      : null;

    if (question) {
      const content = question.content as any;
      const enrichedContent: any = {
        context: content.description || content.title || "Pre-approved scenario",
      };

      if (content.triggers && Array.isArray(content.triggers)) {
        for (const t of content.triggers) {
          if (t.type === "slack" || t.type === "chat") {
            enrichedContent.messages = (enrichedContent.messages || "") + `${t.from}: ${t.body}\n`;
          } else if (t.type === "ticket" || t.type === "jira") {
            enrichedContent.tickets = (enrichedContent.tickets || "") + `${t.from}: ${t.body}\n`;
          } else if (t.type === "email") {
            enrichedContent.emails = (enrichedContent.emails || "") + `${t.from}: ${t.body}\n`;
          } else if (t.type === "logs") {
            enrichedContent.logs = (enrichedContent.logs || "") + `${t.from}: ${t.body}\n`;
          } else if (t.type === "alerts") {
            enrichedContent.alerts = (enrichedContent.alerts || "") + `${t.from}: ${t.body}\n`;
          }
        }
      }

      const workspaceType = content.workspaceType || 
        (content.triggers?.[0]?.type === "ticket" ? "jira" : 
         content.triggers?.[0]?.type === "slack" ? "chat" : "incident");

      const eventTemplate = {
        id: question.id,
        title: content.title || "Simulation Scenario",
        description: content.description || "",
        track: (question.difficulty === "hard" ? "experienced" : "fresher") as "fresher" | "experienced",
        workspaceType: workspaceType as any,
        timerSeconds: content.timerSeconds || 120,
        competencies: question.tags || ["Technical"],
        artifactIds: [],
        supportedActions: ["respond"],
        eventDepth: "medium" as const,
      };

      return {
        event: {
          ...eventTemplate,
          enrichedContent,
        },
        index,
        total,
        state: eventState.state,
        timerSeconds: eventTemplate.timerSeconds,
      };
    }

    const template = eventTemplates.find((t) => t.id === eventId);
    if (!template) {
      throw new Error(`Event template ${eventId} not found`);
    }

    // Call LLM generator service (with static fallback) to get enriched content
    // Determine candidate role based on Prisma role template
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { roleTemplate: true },
    });
    const role = dbSession?.roleTemplate?.roleName || "Software Developer";

    const enrichedContent = await this.eventGenerationService.generateScenario({
      role,
      track: session.track,
      difficulty: "medium",
      eventTemplateId: eventId,
    });

    return {
      event: {
        ...template,
        enrichedContent,
      },
      index,
      total,
      state: eventState.state,
      timerSeconds: template.timerSeconds,
    };
  }

  async logEventState(
    sessionId: string,
    state: string,
    action: string,
    payload?: any,
  ): Promise<void> {
    const session = await this.sessionLogService.getSession(sessionId);
    if (!session || session.status === "COMPLETED") return;

    const index = session.currentEventIndex;
    if (index >= session.eventsList.length) return;

    const eventId = session.eventsList[index];
    await this.sessionLogService.logAction(
      sessionId,
      eventId,
      state,
      action,
      payload,
    );
  }

  async submitEvent(
    sessionId: string,
    response: any,
  ): Promise<SimulationSession> {
    const session = await this.sessionLogService.getSession(sessionId);
    if (!session || session.status === "COMPLETED") {
      throw new BadRequestException("Session is completed or not found");
    }

    const index = session.currentEventIndex;
    if (index >= session.eventsList.length) {
      throw new BadRequestException("All events are already completed");
    }

    const eventId = session.eventsList[index];
    const template = eventTemplates.find((t) => t.id === eventId);
    if (!template) {
      throw new Error(`Template ${eventId} not found`);
    }

    // Transition state from ACTING/INVESTIGATING to SUBMITTED
    await this.sessionLogService.logAction(
      sessionId,
      eventId,
      "SUBMITTED",
      "Response Submitted",
      response,
    );

    // Evaluate outcome deterministically via CompetencyEngine
    const outcome = this.competencyEngine.evaluateResponse(eventId, response);
    await this.sessionLogService.logAction(
      sessionId,
      eventId,
      "EVALUATED",
      `Outcome evaluated as: ${outcome}`,
    );

    // Update event final logs
    const updatedSession = await this.sessionLogService.getSession(sessionId);
    if (!updatedSession) {
      throw new NotFoundException(`Simulation session not found`);
    }
    const eventState = updatedSession.eventStates[eventId];
    eventState.endTime = new Date().toISOString();
    eventState.durationSeconds = Math.round(
      (new Date(eventState.endTime).getTime() -
        new Date(eventState.startTime).getTime()) /
        1000,
    );
    eventState.outcome = outcome;
    eventState.response = response;
    eventState.resolutionSubmitted =
      typeof response === "string" ? response : JSON.stringify(response);
    eventState.competenciesImpacted = template.competencies;
    eventState.state = "COMPLETED";

    // Advance event index
    updatedSession.currentEventIndex += 1;

    // Check if simulation is fully complete
    if (updatedSession.currentEventIndex >= updatedSession.eventsList.length) {
      updatedSession.status = "COMPLETED";
      updatedSession.completedAt = new Date().toISOString();

      // Aggregate all competency scores and compile final score
      const eventDetails: EventScoreDetail[] = Object.values(
        updatedSession.eventStates,
      ).map((e) => ({
        eventId: e.eventId,
        outcome: e.outcome as any,
        weightedScore: this.competencyEngine.calculateEventScore(
          e.outcome as any,
        ),
        durationSeconds: e.durationSeconds || 0,
        competenciesImpacted: e.competenciesImpacted,
      }));

      const grading = this.competencyEngine.generateFinalScore(eventDetails);
      updatedSession.overallScore = grading.finalScore;
      updatedSession.competencyScores = grading.competencyBreakdown;

      // Integrate with the Assessment Engine by upserting the Score model in Prisma
      await this.prisma.score.upsert({
        where: { sessionId },
        create: {
          sessionId,
          compositeScore: grading.finalScore,
          moduleScores: {
            SIMULATION: grading.finalScore,
          },
          sayDoConsistencyScore: -1.0, // Sentinel value for uncomputed score
          aiConfidence: -1.0,          // Sentinel value for uncomputed confidence
          humanReviewed: false,
          sayDoRationale: null,
          gradingSource: "deterministic",
        },
        update: {
          compositeScore: grading.finalScore,
          moduleScores: {
            SIMULATION: grading.finalScore,
          },
        },
      });
      
      // Enqueue Say-Do correlation scoring via BullMQ (3 retries, exponential backoff)
      // Falls back to local retry in non-full infra mode.
      // On final failure, ORPHANED_UNSCORED_SESSION is logged — session stays at -1.0 sentinel.
      await this.correlationGradingService.enqueue(sessionId);
    }

    // Save final state
    await this.sessionLogService.saveSession(sessionId, updatedSession);
    return updatedSession;
  }

  async skipEvent(sessionId: string): Promise<SimulationSession> {
    const session = await this.sessionLogService.getSession(sessionId);
    if (!session || session.status === "COMPLETED") {
      throw new BadRequestException("Session is completed or not found");
    }

    const index = session.currentEventIndex;
    if (index >= session.eventsList.length) {
      throw new BadRequestException("All events are already completed");
    }

    const eventId = session.eventsList[index];

    // Log the skip action and transition to ignored outcome
    await this.sessionLogService.logAction(
      sessionId,
      eventId,
      "SUBMITTED",
      "Event Skipped",
    );
    return this.submitEvent(sessionId, {
      response: "Skipped by candidate",
      action: "skip",
      actionLog: [],
    });
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.sessionLogService.getSession(sessionId);
    if (!session) {
      throw new BadRequestException("Session not found");
    }

    const outcomes = Object.values(session.eventStates).map((e) => ({
      event: e.eventName,
      outcome: e.outcome || "ignored",
    }));

    return {
      module: "context_simulation",
      score: session.overallScore || 0,
      competencies: session.competencyScores || {},
      event_outcomes: outcomes,
    };
  }
}
