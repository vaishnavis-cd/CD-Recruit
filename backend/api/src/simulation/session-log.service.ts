import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";

export interface EventLogAction {
  timestamp: string;
  state: string;
  action: string;
  payload?: any;
}

export interface SimulationEventState {
  eventId: string;
  eventName: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  state:
    | "LOADED"
    | "ARTIFACT_VIEWED"
    | "INVESTIGATING"
    | "ACTING"
    | "SUBMITTED"
    | "EVALUATED"
    | "COMPLETED";
  actions: EventLogAction[];
  response?: any;
  resolutionSubmitted?: string;
  outcome?: string;
  competenciesImpacted: string[];
}

export interface SimulationSession {
  sessionId: string;
  candidateId: string;
  track: "fresher" | "experienced";
  currentEventIndex: number;
  eventsList: string[]; // event template IDs
  eventStates: Record<string, SimulationEventState>;
  overallScore?: number;
  competencyScores?: Record<string, number>;
  status: "IN_PROGRESS" | "COMPLETED";
  createdAt: string;
  completedAt?: string;
}

export interface SimulationSessionRepository {
  getSession(sessionId: string): Promise<SimulationSession | null>;
  saveSession(sessionId: string, session: SimulationSession): Promise<void>;
}

export interface SimulationEventLogRepository {
  logAction(
    sessionId: string,
    eventId: string,
    state: string,
    action: string,
    payload?: any,
  ): Promise<void>;
  getTimeline(sessionId: string): Promise<any[]>;
}

@Injectable()
export class SessionLogService
  implements SimulationSessionRepository, SimulationEventLogRepository
{
  constructor(private prisma: PrismaService) {}

  /**
   * Helper to find the SIMULATION question associated with the session's role template.
   */
  private async getSimulationQuestion(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        roleTemplate: true,
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

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const driveQuestion = session.drive?.questions[0];
    const question = driveQuestion?.question;

    if (!question) {
      // Fallback: If no simulation question is assigned to the template/drive, find any simulation question
      const fallbackQuestion = await this.prisma.question.findFirst({
        where: { moduleType: "SIMULATION" },
      });
      if (!fallbackQuestion) {
        throw new NotFoundException(
          "No questions of type SIMULATION exist in the database. Please run the DB seed first.",
        );
      }
      return { question: fallbackQuestion, session };
    }

    return { question, session };
  }

  async getSession(sessionId: string): Promise<SimulationSession | null> {
    const { question, session } = await this.getSimulationQuestion(sessionId);

    // Look for existing ModuleResponse
    const response = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId: question.id,
        },
      },
    });

    if (response && response.responsePayload) {
      return response.responsePayload as unknown as SimulationSession;
    }

    // Determine track automatically from roleName metadata and template level
    const roleName = session.roleTemplate.roleName.toLowerCase();
    const track =
      session.roleTemplate.level === "EXPERIENCED" ||
      roleName.includes("senior") ||
      roleName.includes("lead") ||
      roleName.includes("experienced") ||
      roleName.includes("sde 2") ||
      roleName.includes("sde-2")
        ? "experienced"
        : "fresher";

    // Fetch all simulation questions linked to this drive
    const driveQuestions = session.drive?.questions || [];
    let eventsList = driveQuestions.map((dq) => dq.questionId);

    if (eventsList.length === 0) {
      // Define fixed event lists
      eventsList =
        track === "experienced"
          ? [
              "experienced_prod_incident",
              "experienced_pipeline_failure",
              "experienced_security_alert",
              "experienced_customer_escalation",
              "experienced_priority_conflict",
            ]
          : [
              "fresher_manager_eta",
              "fresher_req_clarify",
              "fresher_qa_bug",
              "fresher_code_review",
              "fresher_teammate_question",
            ];
    }

    // Initialize new session state
    const newSession: SimulationSession = {
      sessionId,
      candidateId: session.candidateId,
      track,
      currentEventIndex: 0,
      eventsList,
      eventStates: {},
      status: "IN_PROGRESS",
      createdAt: new Date().toISOString(),
    };

    // Save initialized session
    await this.saveSession(sessionId, newSession);
    return newSession;
  }

  async saveSession(
    sessionId: string,
    session: SimulationSession,
  ): Promise<void> {
    const { question } = await this.getSimulationQuestion(sessionId);

    await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId: question.id,
        },
      },
      create: {
        sessionId,
        questionId: question.id,
        responsePayload: session as any,
        isDraft: session.status !== "COMPLETED",
        lastAutosavedAt: new Date(),
      },
      update: {
        responsePayload: session as any,
        isDraft: session.status !== "COMPLETED",
        lastAutosavedAt: new Date(),
      },
    });
  }

  async logAction(
    sessionId: string,
    eventId: string,
    state: string,
    action: string,
    payload?: any,
  ): Promise<void> {
    const sessionState = await this.getSession(sessionId);
    if (!sessionState) return;

    if (!sessionState.eventStates) {
      sessionState.eventStates = {};
    }
    if (!sessionState.eventStates[eventId]) {
      // Initialize event log if not present
      sessionState.eventStates[eventId] = {
        eventId,
        eventName: eventId
          .split("_")
          .slice(1)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        startTime: new Date().toISOString(),
        state: "LOADED",
        actions: [],
        competenciesImpacted: [],
      };
    }

    const eventState = sessionState.eventStates[eventId];
    eventState.state = state as any;
    eventState.actions.push({
      timestamp: new Date().toISOString(),
      state,
      action,
      payload,
    });

    await this.saveSession(sessionId, sessionState);
  }

  async getTimeline(sessionId: string): Promise<any[]> {
    const sessionState = await this.getSession(sessionId);
    if (!sessionState) return [];

    return Object.values(sessionState.eventStates).map((event) => {
      const durationSeconds = event.endTime
        ? Math.round(
            (new Date(event.endTime).getTime() -
              new Date(event.startTime).getTime()) /
              1000,
          )
        : 0;

      return {
        eventName: event.eventName,
        startTime: event.startTime,
        endTime: event.endTime || null,
        durationSeconds,
        outcome: event.outcome || "Pending",
        competenciesImpacted: event.competenciesImpacted,
      };
    });
  }
}
