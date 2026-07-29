import { Injectable, Logger } from "@nestjs/common";
import { QueueProviderPort } from "./queue-provider.port";

type HandlerFn = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class LocalFakeQueueProvider extends QueueProviderPort {
  private readonly logger = new Logger(LocalFakeQueueProvider.name);
  private handlers = new Map<string, HandlerFn>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  registerHandler(queueName: string, jobName: string, fn: HandlerFn) {
    const key = `${queueName}:${jobName}`;
    this.handlers.set(key, fn);
    this.logger.log(`[LocalFakeQueueProvider] Registered handler for ${key}`);
  }

  async enqueueDelayed(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts: { delayMs: number; jobId?: string },
  ): Promise<void> {
    const key = `${queueName}:${jobName}`;
    const trackingKey = opts.jobId ? `${queueName}:${opts.jobId}` : null;

    this.logger.log(
      `[LocalFakeQueueProvider] Scheduling delayed job "${key}" in ${opts.delayMs}ms (jobId: ${opts.jobId ?? "N/A"})`,
    );

    const timer = setTimeout(async () => {
      if (trackingKey) {
        this.timeouts.delete(trackingKey);
      }
      const handler = this.handlers.get(key);
      if (handler) {
        try {
          await handler(payload);
        } catch (err: any) {
          this.logger.error(
            `[LocalFakeQueueProvider] Error in delayed job "${key}": ${err.message}`,
          );
        }
      }
    }, opts.delayMs);

    if (trackingKey) {
      this.timeouts.set(trackingKey, timer);
    }
  }

  async upsertRepeatable(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    everyMs: number,
    repeatKey: string,
  ): Promise<void> {
    const key = `${queueName}:${jobName}`;
    const trackingKey = `${queueName}:${repeatKey}`;

    if (this.intervals.has(trackingKey)) {
      clearInterval(this.intervals.get(trackingKey)!);
    }

    const interval = setInterval(async () => {
      const handler = this.handlers.get(key);
      if (handler) {
        try {
          await handler(payload);
        } catch (err: any) {
          this.logger.error(
            `[LocalFakeQueueProvider] Error in repeatable job "${key}": ${err.message}`,
          );
        }
      }
    }, everyMs);

    this.intervals.set(trackingKey, interval);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const trackingKey = `${queueName}:${jobId}`;
    if (this.timeouts.has(trackingKey)) {
      clearTimeout(this.timeouts.get(trackingKey)!);
      this.timeouts.delete(trackingKey);
      this.logger.log(`[LocalFakeQueueProvider] Cancelled delayed job: ${trackingKey}`);
    }
    if (this.intervals.has(trackingKey)) {
      clearInterval(this.intervals.get(trackingKey)!);
      this.intervals.delete(trackingKey);
      this.logger.log(`[LocalFakeQueueProvider] Cancelled repeatable job: ${trackingKey}`);
    }
  }
}
