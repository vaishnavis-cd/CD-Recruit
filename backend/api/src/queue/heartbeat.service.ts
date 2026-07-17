import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SessionStatus } from "@prisma/client";
import { PrismaService } from "@app/prisma/prisma.service";
import { AppConfig } from "@app/config/configuration";
import { SessionService } from "@app/session/session.service";

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly staleThresholdSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    this.staleThresholdSeconds = this.config.get(
      "heartbeatStaleThresholdSeconds",
      {
        infer: true,
      },
    );
  }

  async scanAndMarkStale(): Promise<void> {
    this.logger.debug(`heartbeat-monitor scan starting`);

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

    // Process each stale session. Errors on individual sessions are caught and
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
