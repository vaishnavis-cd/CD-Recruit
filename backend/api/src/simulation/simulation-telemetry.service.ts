import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";

export type TelemetryEventType =
  | "FILE_OPEN"
  | "FILE_EDIT"
  | "FILE_SWITCH"
  | "TEST_EXECUTE"
  | "COMMAND_RUN"
  | "INITIAL_SAY_SUBMIT"
  | "EMAIL_REPLY_SUBMIT";

export interface TelemetryEvent {
  id: string;
  sessionId: string;
  type: TelemetryEventType;
  filepath?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class SimulationTelemetryService {
  private readonly logger = new Logger(SimulationTelemetryService.name);
  // Memory cache of telemetry events per session (backed by event logs in session)
  private readonly eventsBySession = new Map<string, TelemetryEvent[]>();

  constructor(@Optional() private prisma?: PrismaService) {}

  recordEvent(sessionId: string, event: Omit<TelemetryEvent, "id" | "sessionId" | "timestamp">): TelemetryEvent {
    const fullEvent: TelemetryEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      timestamp: new Date().toISOString(),
      ...event,
    };

    const sessionEvents = this.eventsBySession.get(sessionId) || [];
    sessionEvents.push(fullEvent);
    this.eventsBySession.set(sessionId, sessionEvents);

    this.logger.debug(`Recorded telemetry [${fullEvent.type}] for session ${sessionId}: ${fullEvent.filepath || ""}`);
    return fullEvent;
  }

  setEvents(sessionId: string, events: TelemetryEvent[]): void {
    this.eventsBySession.set(sessionId, events);
  }

  getEventStream(sessionId: string): TelemetryEvent[] {
    return this.eventsBySession.get(sessionId) || [];
  }

  /**
   * Async event stream fetch with fallback DB hydration if memory cache is empty
   */
  async getEventStreamAsync(sessionId: string): Promise<TelemetryEvent[]> {
    const memoryEvents = this.eventsBySession.get(sessionId);
    if (memoryEvents && memoryEvents.length > 0) {
      return memoryEvents;
    }

    if (this.prisma) {
      try {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
          select: { simulationSnapshot: true },
        });
        const snapEvents = (session?.simulationSnapshot as any)?.rawTelemetryEvents;
        if (Array.isArray(snapEvents) && snapEvents.length > 0) {
          this.eventsBySession.set(sessionId, snapEvents);
          return snapEvents;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to hydrate telemetry from DB for session ${sessionId}: ${err.message}`);
      }
    }

    return memoryEvents || [];
  }

  hasFirstEditOccurred(sessionId: string): boolean {
    const events = this.getEventStream(sessionId);
    return events.some((e) => e.type === "FILE_EDIT");
  }

  clearTelemetry(sessionId: string): void {
    this.eventsBySession.delete(sessionId);
  }
}
