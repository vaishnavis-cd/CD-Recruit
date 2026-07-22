import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SessionStatus } from "@prisma/client";
import { PrismaService } from "@app/prisma/prisma.service";
import { AppConfig } from "@app/config/configuration";
import { SessionService } from "@app/session/session.service";
import { ObjectStoragePort } from "@app/integrations/storage/object-storage.port";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly staleThresholdSeconds: number;
  private readonly bucketBiometric: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly storage: ObjectStoragePort,
  ) {
    this.staleThresholdSeconds = this.config.get(
      "heartbeatStaleThresholdSeconds",
      {
        infer: true,
      },
    );
    this.bucketBiometric = this.config.get("app.minio.bucketBiometric" as any) ?? "cd-recruit-biometric";
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

  async cleanupExpiredBiometrics(): Promise<void> {
    this.logger.log("Starting biometric retention cleanup task");

    let retentionDays = 30;
    try {
      const configPath = path.join(__dirname, "../config/settings.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        retentionDays = config.biometricRetentionDays ?? 30;
      }
    } catch (e) {
      // ignore
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    // 1. Clean up expired EvidenceClips
    const expiredClips = await this.prisma.evidenceClip.findMany({
      where: { expiresAt: { lte: now } },
    });

    if (expiredClips.length > 0) {
      this.logger.log(`Found ${expiredClips.length} expired evidence clip(s) to clean up.`);
      for (const clip of expiredClips) {
        try {
          await this.storage.deleteObject(this.bucketBiometric, clip.storageRef);
          await this.prisma.evidenceClip.delete({ where: { id: clip.id } });
          this.logger.log(`Successfully deleted expired evidence clip object ${clip.storageRef} and DB record.`);
        } catch (err: any) {
          this.logger.error(`Failed to clean up expired evidence clip ${clip.id} (${clip.storageRef}): ${err.message}`);
        }
      }
    }

    // 2. Clean up expired baseline selfies
    const expiredSessions = await this.prisma.session.findMany({
      where: {
        baselineSelfieRef: { not: null },
        OR: [
          { submittedAt: { lte: cutoff } },
          { status: { in: ["CLOSED", "SUBMITTED", "ABANDONED"] }, deadlineAt: { lte: cutoff } },
        ],
      },
    });

    if (expiredSessions.length > 0) {
      this.logger.log(`Found ${expiredSessions.length} session(s) with expired baseline selfies to clean up.`);
      for (const session of expiredSessions) {
        if (!session.baselineSelfieRef) continue;
        try {
          await this.storage.deleteObject(this.bucketBiometric, session.baselineSelfieRef);
          await this.prisma.session.update({
            where: { id: session.id },
            data: { baselineSelfieRef: null },
          });
          this.logger.log(`Successfully deleted expired baseline selfie ${session.baselineSelfieRef} for session ${session.id}.`);
        } catch (err: any) {
          this.logger.error(`Failed to clean up expired baseline selfie for session ${session.id}: ${err.message}`);
        }
      }
    }
  }
}
