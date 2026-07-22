import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { CorrelationEngineClient } from "../common/correlation-engine.client";

export const CORRELATION_GRADING_QUEUE = "correlation-grading";
export const CORRELATION_JOB_NAME = "trigger-correlation";

export interface CorrelationGradingPayload {
  sessionId: string;
}

/**
 * Processes correlation-grading jobs with automatic BullMQ retry on failure.
 *
 * Configured for 3 retries with exponential backoff in the enqueue call —
 * see CorrelationGradingService.enqueue().
 *
 * On final exhaustion (all retries consumed), BullMQ moves the job to the
 * "failed" set and logs ORPHANED_UNSCORED_SESSION so an alert/monitoring
 * hook can surface it.
 */
@Processor(CORRELATION_GRADING_QUEUE)
export class CorrelationGradingProcessor extends WorkerHost {
  private readonly logger = new Logger(CorrelationGradingProcessor.name);

  constructor(private readonly correlationClient: CorrelationEngineClient) {
    super();
  }

  async process(job: Job<CorrelationGradingPayload>): Promise<void> {
    const { sessionId } = job.data;
    this.logger.log(
      `[correlation-grading] Processing job ${job.id}, attempt ${job.attemptsMade + 1} for session ${sessionId}`,
    );

    const success = await this.correlationClient.triggerCorrelation(sessionId);

    if (!success) {
      // Throw to signal BullMQ this attempt failed — it will retry per the job's backoff config
      throw new Error(
        `Correlation engine returned failure for session ${sessionId} on attempt ${job.attemptsMade + 1}`,
      );
    }

    this.logger.log(
      `[correlation-grading] Successfully scored session ${sessionId} on attempt ${job.attemptsMade + 1}`,
    );
  }
}
