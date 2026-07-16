import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

/**
 * QueueScheduler — registers the repeating heartbeat-monitor job on startup.
 *
 * The heartbeat-monitor queue runs a table-scan every 10 s (BullMQ poll cadence
 * from docs/DECISIONS.md Decision 7).
 *
 * Idempotency: any existing repeatable job with the same key is removed before
 * re-adding it, so restarts do not create duplicate jobs.
 *
 * Grace-window jobs are NOT registered here — they are enqueued on-demand by
 * SessionService.markDisconnected() when a session transitions to DISCONNECTED.
 */
@Injectable()
export class QueueScheduler implements OnModuleInit {
  private readonly logger = new Logger(QueueScheduler.name);

  /** Repeatable job key — must match across restarts for idempotent removal. */
  private static readonly SCAN_JOB_NAME = "scan";
  private static readonly SCAN_INTERVAL_MS = 10_000;

  constructor(
    @InjectQueue("heartbeat-monitor")
    private readonly heartbeatQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Remove any existing repeatable job with this key to avoid accumulation on restarts
    const existing = await this.heartbeatQueue.getRepeatableJobs();
    for (const job of existing) {
      if (job.name === QueueScheduler.SCAN_JOB_NAME) {
        await this.heartbeatQueue.removeRepeatableByKey(job.key);
        this.logger.debug(`Removed stale repeatable job: ${job.key}`);
      }
    }

    // Register the new repeatable scan job
    await this.heartbeatQueue.add(
      QueueScheduler.SCAN_JOB_NAME,
      {},
      {
        repeat: { every: QueueScheduler.SCAN_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Heartbeat monitor registered: scanning every ${QueueScheduler.SCAN_INTERVAL_MS / 1000} s`,
    );
  }
}
