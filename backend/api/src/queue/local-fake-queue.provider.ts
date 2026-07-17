import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { QueueProviderPort } from "./queue-provider.port";

type Handler = (payload: Record<string, unknown>) => Promise<void> | void;

@Injectable()
export class LocalFakeQueueProvider extends QueueProviderPort implements OnModuleDestroy {
  private readonly logger = new Logger(LocalFakeQueueProvider.name);
  private delayedTimers = new Map<string, NodeJS.Timeout>();
  private repeatableIntervals = new Map<string, NodeJS.Timeout>();
  private handlers = new Map<string, Handler>();

  registerHandler(queueName: string, jobName: string, handler: Handler) {
    this.handlers.set(`${queueName}:${jobName}`, handler);
  }

  async enqueueDelayed(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts: { delayMs: number; jobId?: string },
  ): Promise<void> {
    if (opts.jobId && this.delayedTimers.has(opts.jobId)) {
      this.logger.debug(`[local-fake-queue] dedupe: ${opts.jobId} already scheduled`);
      return;
    }
    const key = opts.jobId ?? `${queueName}:${jobName}:${Date.now()}`;
    const timer = setTimeout(async () => {
      this.delayedTimers.delete(key);
      const handler = this.handlers.get(`${queueName}:${jobName}`);
      if (!handler) {
        this.logger.warn(`[local-fake-queue] no handler for ${queueName}:${jobName}`);
        return;
      }
      try {
        await handler(payload);
      } catch (err) {
        this.logger.error(`[local-fake-queue] handler threw for ${queueName}:${jobName}`, err as Error);
      }
    }, opts.delayMs);
    this.delayedTimers.set(key, timer);
  }

  async upsertRepeatable(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    everyMs: number,
    repeatKey: string,
  ): Promise<void> {
    const existing = this.repeatableIntervals.get(repeatKey);
    if (existing) clearInterval(existing);
    const interval = setInterval(async () => {
      const handler = this.handlers.get(`${queueName}:${jobName}`);
      if (!handler) return;
      try {
        await handler(payload);
      } catch (err) {
        this.logger.error(`[local-fake-queue] repeatable handler threw for ${queueName}:${jobName}`, err as Error);
      }
    }, everyMs);
    this.repeatableIntervals.set(repeatKey, interval);
  }

  onModuleDestroy() {
    this.delayedTimers.forEach(clearTimeout);
    this.repeatableIntervals.forEach(clearInterval);
  }
}
