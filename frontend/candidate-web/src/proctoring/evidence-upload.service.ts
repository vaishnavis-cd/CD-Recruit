import axios from "axios";
import { ProctoringEvent } from "./proctoring.types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});
import { ProctoringEventService } from "./proctoring-event.service";
import { CONFIG } from "./proctoring.constants";

interface QueuedUpload {
  sessionId: string;
  event: ProctoringEvent;
  blob: Blob;
  filename: string;
  attempts: number;
}

export class EvidenceUploadService {
  private static instance: EvidenceUploadService | null = null;
  private retryQueue: QueuedUpload[] = [];
  private isProcessing = false;
  private timerId: any = null;

  private constructor() {
    this.startQueueWorker();
  }

  public static getInstance(): EvidenceUploadService {
    if (!EvidenceUploadService.instance) {
      EvidenceUploadService.instance = new EvidenceUploadService();
    }
    return EvidenceUploadService.instance;
  }

  /**
   * Upload evidence clip and store event metadata.
   * Even if upload fails, event metadata is persisted with uploadStatus: FAILED
   * Video file is queued for retry separately.
   */
  public async uploadEvidence(
    sessionId: string,
    event: ProctoringEvent,
    blob: Blob,
  ): Promise<void> {
    const cleanEventType = event.eventType.toLowerCase();
    const filename = `${cleanEventType}_${Date.now()}.webm`;

    try {
      await this.performAtomicUpload(sessionId, event, blob, filename);
      console.log(`[Proctoring] Atomic upload & event creation succeeded: ${filename}`);
    } catch (err: any) {
      console.warn(
        `[Proctoring] Atomic upload failed for event ${event.eventType}. Adding to retry queue.`,
        err,
      );
      this.addToRetryQueue(sessionId, event, blob, filename);
    }
  }

  /**
   * Makes the atomic multipart POST request to backend (upload clip + create event in single call).
   */
  private async performAtomicUpload(
    sessionId: string,
    event: ProctoringEvent,
    blob: Blob,
    filename: string,
  ): Promise<string> {
    const url = `/proctoring/session/${sessionId}/upload-evidence`;
    console.log(`[EvidenceUploadService] ATOMIC_API_REQUEST: POST ${url}, eventType=${event.eventType}, filename=${filename}, size=${blob.size} bytes`);

    const formData = new FormData();
    const file = new File([blob], filename, { type: "video/webm" });
    formData.append("file", file);
    formData.append("sessionId", sessionId);
    formData.append("eventType", event.eventType);
    formData.append("severity", event.severity);
    formData.append("timestamp", new Date(event.timestamp).toISOString());
    if (event.modelVersion) {
      formData.append("modelVersion", event.modelVersion);
    }

    try {
      const response = await apiClient.post<{ id: string; clipUrl: string }>(
        url,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      console.log(
        `[EvidenceUploadService] ATOMIC_API_RESPONSE: POST ${url}, status=${response.status}, eventId=${response.data.id}, clipUrl=${response.data.clipUrl}`,
      );
      return response.data.clipUrl;
    } catch (err: any) {
      console.error(
        `[EvidenceUploadService] ATOMIC_API_ERROR: POST ${url}, status=${err?.response?.status || "UNKNOWN"}, body=${JSON.stringify(
          err?.response?.data || "No body",
        )}`,
      );
      throw err;
    }
  }

  /**
   * Add a failed upload task to the retry queue.
   */
  private addToRetryQueue(
    sessionId: string,
    event: ProctoringEvent,
    blob: Blob,
    filename: string,
  ): void {
    this.retryQueue.push({
      sessionId,
      event,
      blob,
      filename,
      attempts: 1,
    });
  }

  /**
   * Start a background worker checking the queue every 30 seconds.
   */
  private startQueueWorker(): void {
    const tick = async () => {
      await this.processQueue();
      this.timerId = setTimeout(tick, CONFIG.RETRY_INTERVAL_MS);
    };
    this.timerId = setTimeout(tick, CONFIG.RETRY_INTERVAL_MS);
  }

  /**
   * Process all queued uploads.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.retryQueue.length === 0) return;

    this.isProcessing = true;
    const remaining: QueuedUpload[] = [];

    console.log(`[Proctoring] Queue worker checking ${this.retryQueue.length} queued upload(s)...`);

    for (const item of this.retryQueue) {
      try {
        console.log(
          `[Proctoring] Retrying upload of ${item.filename} (Attempt ${item.attempts}/${CONFIG.MAX_RETRY_ATTEMPTS})`,
        );
        const clipUrl = await this.performAtomicUpload(item.sessionId, item.event, item.blob, item.filename);

        // Upload success -> save metadata with UPLOADED status
        await ProctoringEventService.getInstance().createEvent({
          ...item.event,
          clipUrl,
          uploadStatus: "UPLOADED",
        });
        console.log(`[Proctoring] Queued upload of ${item.filename} succeeded.`);
      } catch (err: any) {
        const status = err?.response?.status || err?.status;
        if (status === 404) {
          console.warn(`[Proctoring] Session ${item.sessionId} not found (404). Discarding stale clip ${item.filename}.`);
          continue;
        }
        if (status === 409) {
          console.log(`[Proctoring] Server-side duplicate filter rejected queued ${item.event.eventType}. Discarding duplicate.`);
          continue;
        }
        item.attempts++;
        if (item.attempts > CONFIG.MAX_RETRY_ATTEMPTS) {
          console.error(
            `[Proctoring] Failed to upload evidence clip after ${CONFIG.MAX_RETRY_ATTEMPTS} attempts for event ${item.event.eventType}. Saving metadata as FAILED.`,
            err,
          );
          // Persist the event metadata with FAILED status and null clipUrl
          try {
            await ProctoringEventService.getInstance().createEvent({
              ...item.event,
              clipUrl: null,
              uploadStatus: "FAILED",
            });
          } catch (dbErr) {
            console.error("[Proctoring] Failed to store metadata-only event after queue expiration:", dbErr);
          }
        } else {
          remaining.push(item);
        }
      }
    }

    this.retryQueue = remaining;
    this.isProcessing = false;
  }

  /**
   * Flush any remaining items in the queue (e.g. at assessment completion).
   */
  public async flush(): Promise<void> {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.retryQueue.length > 0) {
      console.log("[Proctoring] Flushing pending upload queue...");
      await this.processQueue();
    }
  }

  public getQueueLength(): number {
    return this.retryQueue.length;
  }

  public reset(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.retryQueue = [];
    this.isProcessing = false;
    this.startQueueWorker();
  }
}
