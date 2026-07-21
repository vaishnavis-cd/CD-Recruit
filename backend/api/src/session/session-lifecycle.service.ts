import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SessionStatus } from "@prisma/client";

@Injectable()
export class SessionLifecycleService {
  private readonly logger = new Logger(SessionLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate session exists and is in a valid state for activity.
   */
  async assertSessionActive(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new UnprocessableEntityException({
        code: "SESSION_NOT_IN_PROGRESS",
        message: "Session is not currently in progress.",
        sessionStatus: session.status,
      });
    }

    return session;
  }

  /**
   * Process heartbeat and update lastHeartbeatAt timestamp.
   */
  async processHeartbeat(sessionId: string, tabId: string) {
    const session = await this.assertSessionActive(sessionId);

    if (session.activeTabId && session.activeTabId !== tabId) {
      this.logger.warn(
        `SECOND_TAB_DETECTED for session ${sessionId}: ` +
          `registered=${session.activeTabId}, incoming=${tabId}`,
      );
      throw new ConflictException({
        code: "SECOND_TAB_DETECTED",
        message: "This session is already active in another browser tab.",
      });
    }

    const now = new Date();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        lastHeartbeatAt: now,
        lastActivityAt: now,
        activeTabId: tabId,
      },
    });

    return {
      status: session.status,
      deadlineAt: session.deadlineAt ? session.deadlineAt.toISOString() : new Date().toISOString(),
      serverTime: now.toISOString(),
    };
  }

  /**
   * Check if a session has expired based on deadlineAt.
   */
  isSessionExpired(deadlineAt: Date | null): boolean {
    if (!deadlineAt) return false;
    return new Date() > deadlineAt;
  }
}
