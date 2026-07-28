import { Injectable, Logger } from "@nestjs/common";
import { QueueProviderPort } from "./queue-provider.port";

type HandlerFn = (payload: Record<string, unknown>) => Promise<void>;

@Injectable()
export class LocalFakeQueueProvider extends QueueProviderPort {
  private readonly logger = new Logger(LocalFakeQueueProvider.name);
  private handlers = new Map<string, HandlerFn>();
  private intervals = new Map<string, NodeJS.Timeout>();

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
    this.logger.log(
      `[LocalFakeQueueProvider] Scheduling delayed job "${key}" in ${opts.delayMs}ms`,
    );

    setTimeout(async () => {
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
  }

  async upsertRepeatable(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    everyMs: number,
    repeatKey: string,
  ): Promise<void> {
    const key = `${queueName}:${jobName}`;
    if (this.intervals.has(repeatKey)) {
      clearInterval(this.intervals.get(repeatKey)!);
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

    this.intervals.set(repeatKey, interval);
  }
}
