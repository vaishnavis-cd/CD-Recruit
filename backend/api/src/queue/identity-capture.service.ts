import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";
import { SessionStatus } from "@prisma/client";

@Injectable()
export class IdentityCaptureService {
  private readonly logger = new Logger(IdentityCaptureService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scans for IdentityCapture rows where status = "PENDING", scheduledAt is > 2 minutes in the past,
   * AND the associated session is still IN_PROGRESS.
   * Updates status to "MISSED" and creates a medium-severity IDENTITY_CAPTURE_MISSED flag.
   */
  async scanAndMarkMissed(): Promise<void> {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

    const staleCaptures = await this.prisma.identityCapture.findMany({
      where: {
        status: "PENDING",
        scheduledAt: { lte: cutoff },
        session: {
          status: SessionStatus.IN_PROGRESS,
        },
      },
      include: {
        session: true,
      },
    });

    if (staleCaptures.length === 0) return;

    this.logger.log(
      `[IdentityCaptureService] Found ${staleCaptures.length} stale pending identity capture(s)`,
    );

    for (const capture of staleCaptures) {
      const now = new Date();
      try {
        await this.prisma.$transaction([
          this.prisma.identityCapture.update({
            where: { id: capture.id },
            data: { status: "MISSED" },
          }),
          this.prisma.integrityFlag.create({
            data: {
              sessionId: capture.sessionId,
              category: "IDENTITY_CAPTURE_MISSED",
              severity: "MEDIUM",
              confidence: 1.0,
              flaggedAt: now,
            },
          }),
        ]);

        this.logger.warn(
          `IdentityCapture ${capture.id} (session ${capture.sessionId}, window ${capture.windowIndex}) marked MISSED; flag created.`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to process missed capture ${capture.id}: ${err.message}`,
        );
      }
    }
  }
}
