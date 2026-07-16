import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SessionStatus } from "@prisma/client";
import { Job } from "bullmq";

import { PrismaService } from "@app/prisma/prisma.service";
import { AppConfig } from "@app/config/configuration";
import { SessionService } from "@app/session/session.service";

/**
 * HeartbeatMonitorProcessor — detects stale sessions and transitions them
 * to DISCONNECTED.
 *
 * Triggered by the repeating 'scan' job enqueued by QueueScheduler every 10 s.
 *
 * For each IN_PROGRESS session where:
 *   now - lastHeartbeatAt > HEARTBEAT_STALE_THRESHOLD_SECONDS
 *
 * The processor calls SessionService.markDisconnected(), which:
 *   1. Transitions the session to DISCONNECTED (or AUTO_SUBMITTED if at max)
 *   2. Increments disconnectCount
 *   3. Logs a DISCONNECTED EventLog entry
 *   4. Enqueues a grace-window delayed job
 *
 * Idempotency: markDisconnected() is a no-op if the session is already past IN_PROGRESS.
 * Repeatable jobs do not carry a session payload — they scan the whole table.
 */
@Processor("heartbeat-monitor")
export class HeartbeatMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(HeartbeatMonitorProcessor.name);
  private readonly staleThresholdSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
    this.staleThresholdSeconds = this.config.get(
      "heartbeatStaleThresholdSeconds",
      {
        infer: true,
      },
    );
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`heartbeat-monitor scan job ${job.id} starting`);

    const cutoff = new Date(Date.now() - this.staleThresholdSeconds * 1000);

    // Find all IN_PROGRESS sessions with a stale heartbeat.
    // lastHeartbeatAt null is treated as stale (session started but never heartbeat'd).
    const staleSessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.IN_PROGRESS,
        OR: [{ lastHeartbeatAt: { lt: cutoff } }, { lastHeartbeatAt: null }],
      },
      select: { id: true },
    });

    if (staleSessions.length === 0) {
      return;
    }

    this.logger.log(
      `heartbeat-monitor: ${staleSessions.length} stale session(s) detected`,
    );

    // Process each stale session.  Errors on individual sessions are caught and
    // logged so one bad session cannot abort the entire scan.
    await Promise.allSettled(
      staleSessions.map(async ({ id }) => {
        try {
          await this.sessionService.markDisconnected(id);
        } catch (err) {
          this.logger.error(
            `Failed to mark session ${id} as disconnected`,
            err,
          );
        }
      }),
    );
  }
}
