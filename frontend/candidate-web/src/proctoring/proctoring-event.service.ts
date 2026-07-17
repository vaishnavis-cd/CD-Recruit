import apiClient from "@/api/client";
import { ProctoringEvent } from "./proctoring.types";

export class ProctoringEventService {
  private static instance: ProctoringEventService | null = null;

  private constructor() {}

  public static getInstance(): ProctoringEventService {
    if (!ProctoringEventService.instance) {
      ProctoringEventService.instance = new ProctoringEventService();
    }
    return ProctoringEventService.instance;
  }

  /**
   * Persists the event metadata on the backend.
   */
  public async createEvent(event: ProctoringEvent): Promise<void> {
    try {
      await apiClient.post("/proctoring/events", event);
    } catch (err) {
      console.error("Failed to persist proctoring event metadata:", err);
      throw err;
    }
  }

  /**
   * Fetches proctoring events for a specific session.
   */
  public async getSessionEvents(sessionId: string): Promise<ProctoringEvent[]> {
    try {
      const response = await apiClient.get<ProctoringEvent[]>(
        `/proctoring/session/${sessionId}`
      );
      return response.data;
    } catch (err) {
      console.error(`Failed to get events for session ${sessionId}:`, err);
      throw err;
    }
  }

  /**
   * Gets the proctoring summary count for a session.
   */
  public async getSessionSummary(
    sessionId: string
  ): Promise<Record<string, number>> {
    try {
      const response = await apiClient.get<Record<string, number>>(
        `/proctoring/session/${sessionId}/summary`
      );
      return response.data;
    } catch (err) {
      console.error(`Failed to get summary for session ${sessionId}:`, err);
      throw err;
    }
  }
}
