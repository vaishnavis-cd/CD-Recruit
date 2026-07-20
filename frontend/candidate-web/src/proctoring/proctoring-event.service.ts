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
    const url = "/proctoring/events";
    console.log(`[ProctoringEventService] API_REQUEST: POST ${url}, payload=${JSON.stringify(event)}`);
    try {
      const response = await apiClient.post(url, event);
      console.log(
        `[ProctoringEventService] API_RESPONSE: POST ${url}, status=${
          response.status
        }, body=${JSON.stringify(response.data)}`,
      );
    } catch (err: any) {
      console.error(
        `[ProctoringEventService] API_ERROR: POST ${url}, status=${err?.response?.status || "UNKNOWN"}, body=${JSON.stringify(
          err?.response?.data || "No body",
        )}`,
      );
      throw err;
    }
  }

  /**
   * Fetches proctoring events for a specific session.
   */
  public async getSessionEvents(sessionId: string): Promise<ProctoringEvent[]> {
    const url = `/proctoring/session/${sessionId}`;
    console.log(`[ProctoringEventService] API_REQUEST: GET ${url}`);
    try {
      const response = await apiClient.get<ProctoringEvent[]>(url);
      console.log(
        `[ProctoringEventService] API_RESPONSE: GET ${url}, status=${
          response.status
        }, eventsCount=${response.data.length}`,
      );
      return response.data;
    } catch (err: any) {
      console.error(
        `[ProctoringEventService] API_ERROR: GET ${url}, status=${err?.response?.status || "UNKNOWN"}`,
      );
      throw err;
    }
  }

  /**
   * Gets the proctoring summary count for a session.
   */
  public async getSessionSummary(sessionId: string): Promise<Record<string, number>> {
    const url = `/proctoring/session/${sessionId}/summary`;
    console.log(`[ProctoringEventService] API_REQUEST: GET ${url}`);
    try {
      const response = await apiClient.get<Record<string, number>>(url);
      console.log(
        `[ProctoringEventService] API_RESPONSE: GET ${url}, status=${
          response.status
        }, body=${JSON.stringify(response.data)}`,
      );
      return response.data;
    } catch (err: any) {
      console.error(
        `[ProctoringEventService] API_ERROR: GET ${url}, status=${err?.response?.status || "UNKNOWN"}`,
      );
      throw err;
    }
  }
}
