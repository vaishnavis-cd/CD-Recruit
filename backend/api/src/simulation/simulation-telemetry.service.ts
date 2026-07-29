import { Injectable, Logger } from "@nestjs/common";

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

  getEventStream(sessionId: string): TelemetryEvent[] {
    return this.eventsBySession.get(sessionId) || [];
  }

  hasFirstEditOccurred(sessionId: string): boolean {
    const events = this.getEventStream(sessionId);
    return events.some((e) => e.type === "FILE_EDIT");
  }

  clearTelemetry(sessionId: string): void {
    this.eventsBySession.delete(sessionId);
  }
}
