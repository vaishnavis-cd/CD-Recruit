import apiClient from "@/api/client";
import { ProctoringEvent } from "./proctoring.types";

interface QueuedEvent {
  event: ProctoringEvent;
  attempts: number;
}

export class ProctoringEventService {
  private static instance: ProctoringEventService | null = null;
  private queue: QueuedEvent[] = [];
  private isProcessing = false;
  private timerId: any = null;
  private readonly QUEUE_KEY = "cd-recruit-pending-proctoring-events";
  private readonly MAX_ATTEMPTS = 5;

  private constructor() {
    this.loadQueue();
    this.startQueueWorker();
  }

  public static getInstance(): ProctoringEventService {
    if (!ProctoringEventService.instance) {
      ProctoringEventService.instance = new ProctoringEventService();
    }
    return ProctoringEventService.instance;
  }

  private loadQueue() {
    try {
      const stored = localStorage.getItem(this.QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (err) {
      console.error("[ProctoringEventService] Failed to load queue from localStorage:", err);
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(this.QUEUE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error("[ProctoringEventService] Failed to save queue to localStorage:", err);
    }
  }

  /**
   * Persists the event metadata on the backend.
   * Offline-safe: Queues events on transient network errors.
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
      // Check if it is a network/server transient error
      const isTransient = !err.response || (err.response.status >= 500 && err.response.status <= 599);

      if (isTransient) {
        console.warn(`[ProctoringEventService] Transient failure. Queuing event: ${event.eventType}`);
        this.queue.push({ event, attempts: 1 });
        this.saveQueue();
      }

      console.error(
        `[ProctoringEventService] API_ERROR: POST ${url}, status=${err?.response?.status || "UNKNOWN"}, body=${JSON.stringify(
          err?.response?.data || "No body",
        )}`,
      );
      throw err; // Do not swallow, propagate to caller
    }
  }

  private startQueueWorker() {
    const tick = async () => {
      await this.processQueue();
      this.timerId = setTimeout(tick, 15000); // Check every 15 seconds
    };
    this.timerId = setTimeout(tick, 15000);
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    console.log(`[ProctoringEventService] Queue worker checking ${this.queue.length} pending event(s)...`);
    const remaining: QueuedEvent[] = [];

    for (const item of this.queue) {
      try {
        console.log(`[ProctoringEventService] Retrying event ${item.event.eventType} (Attempt ${item.attempts}/${this.MAX_ATTEMPTS})`);
        await apiClient.post("/proctoring/events", item.event);
        console.log(`[ProctoringEventService] Pending event ${item.event.eventType} sent successfully.`);
      } catch (err: any) {
        const isTransient = !err.response || (err.response.status >= 500 && err.response.status <= 599);
        
        if (err?.response?.status === 409) {
          console.log(`[ProctoringEventService] Duplicate event discarded by server: ${item.event.eventType}`);
          continue;
        }

        if (isTransient) {
          item.attempts++;
          if (item.attempts <= this.MAX_ATTEMPTS) {
            remaining.push(item);
            continue;
          }
        }
        console.error(`[ProctoringEventService] Discarding event ${item.event.eventType} after failure:`, err);
      }
    }

    this.queue = remaining;
    this.saveQueue();
    this.isProcessing = false;
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
