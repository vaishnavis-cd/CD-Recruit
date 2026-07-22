import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { CorrelationEngineClient } from "../common/correlation-engine.client";
import {
  CORRELATION_GRADING_QUEUE,
  CORRELATION_JOB_NAME,
  CorrelationGradingPayload,
} from "./correlation-grading.processor";

const infraMode = process.env.INFRA_MODE ?? "local";

/**
 * CorrelationGradingService — replaces the fire-and-forget fetch() call.
 *
 * In full infra mode (Redis available): enqueues a BullMQ job with 3 retries
 * and exponential backoff. On final failure, BullMQ logs the session as
 * ORPHANED_UNSCORED_SESSION so monitoring can catch it.
 *
 * In local mode (no Redis): falls back to direct async call with basic retry
 * via Promise chaining, matching previous behaviour but with error capture.
 */
@Injectable()
export class CorrelationGradingService {
  private readonly logger = new Logger(CorrelationGradingService.name);

  constructor(
    @Optional()
    @InjectQueue(CORRELATION_GRADING_QUEUE)
    private readonly correlationQueue: Queue<CorrelationGradingPayload> | null,
    private readonly correlationClient: CorrelationEngineClient,
  ) {}

  async enqueue(sessionId: string): Promise<void> {
    if (infraMode === "full" && this.correlationQueue) {
      await this.correlationQueue.add(
        CORRELATION_JOB_NAME,
        { sessionId },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5_000, // 5s, 10s, 20s
          },
          removeOnComplete: { count: 100 },
          removeOnFail: false, // keep failed jobs for manual inspection
          jobId: `correlation-${sessionId}`, // deduplicate concurrent enqueues
        },
      );
      this.logger.log(`[correlation-grading] Enqueued job for session ${sessionId}`);
    } else {
      // Local mode: inline async with manual retry (no Redis dependency)
      this.runWithLocalRetry(sessionId);
    }
  }

  /**
   * Local-mode fallback: attempts up to 3 times with exponential backoff.
   * Logs ORPHANED_UNSCORED_SESSION on final failure so it's visible in logs.
   */
  private async runWithLocalRetry(sessionId: string): Promise<void> {
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 5_000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        this.logger.log(
          `[correlation-grading:local] Attempt ${attempt}/${MAX_ATTEMPTS} for session ${sessionId}`,
        );
        const success = await this.correlationClient.triggerCorrelation(sessionId);
        if (success) {
          this.logger.log(
            `[correlation-grading:local] Success on attempt ${attempt} for session ${sessionId}`,
          );
          return;
        }
        throw new Error(`Correlation engine returned failure`);
      } catch (err: any) {
        if (attempt < MAX_ATTEMPTS) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.warn(
            `[correlation-grading:local] Attempt ${attempt} failed for session ${sessionId}: ${err.message}. Retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.logger.error(
            `[correlation-grading:local] ORPHANED_UNSCORED_SESSION — all ${MAX_ATTEMPTS} attempts exhausted for session ${sessionId}. ` +
              `sayDoConsistencyScore remains -1.0 (sentinel). Manual intervention required.`,
          );
        }
      }
    }
  }
}
