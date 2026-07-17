import apiClient from "@/api/client";
import { ProctoringEvent } from "./proctoring.types";
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
   * Upload evidence clip and then store event metadata.
   * If initial upload fails, queue it for retry.
   */
  public async uploadEvidence(
    sessionId: string,
    event: ProctoringEvent,
    blob: Blob,
  ): Promise<void> {
    const cleanEventType = event.eventType.toLowerCase();
    const filename = `${cleanEventType}_${Date.now()}.webm`;

    try {
      const clipUrl = await this.performUpload(sessionId, blob, filename);
      // Upload succeeded -> Save the event metadata with UPLOADED status
      await ProctoringEventService.getInstance().createEvent({
        ...event,
        clipUrl,
        uploadStatus: "UPLOADED",
      });
      console.log(`[Proctoring] Event ${event.eventType} and clip successfully persisted.`);
    } catch (err) {
      console.warn(
        `[Proctoring] Initial upload failed for event ${event.eventType}. Adding to retry queue.`,
        err,
      );
      this.addToRetryQueue(sessionId, event, blob, filename);
    }
  }

  /**
   * Makes the actual multipart POST request to the backend.
   */
  private async performUpload(
    sessionId: string,
    blob: Blob,
    filename: string,
  ): Promise<string> {
    const formData = new FormData();
    const file = new File([blob], filename, { type: "video/webm" });
    formData.append("file", file);

    const response = await apiClient.post<{ storageRef: string; clipUrl: string }>(
      `/proctoring/session/${sessionId}/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    return response.data.clipUrl;
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
        const clipUrl = await this.performUpload(item.sessionId, item.blob, item.filename);

        // Upload success -> save metadata with UPLOADED status
        await ProctoringEventService.getInstance().createEvent({
          ...item.event,
          clipUrl,
          uploadStatus: "UPLOADED",
        });
        console.log(`[Proctoring] Queued upload of ${item.filename} succeeded.`);
      } catch (err) {
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
