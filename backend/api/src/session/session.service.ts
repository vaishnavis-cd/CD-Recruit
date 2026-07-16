import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { GoneException } from "@app/common/exceptions/app.exceptions";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { CvMode, Session, SessionStatus } from "@prisma/client";

import { PrismaService } from "@app/prisma/prisma.service";
import { AuthService } from "@app/auth/auth.service";
import { CandidateService } from "@app/candidate/candidate.service";
import { AppConfig } from "@app/config/configuration";
import {
  StartSessionResponse,
  ResumeSessionResponse,
  HeartbeatResponse,
  CloseSessionResponse,
} from "@cd-recruit/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Prisma session with its role template — used for response building. */
type SessionWithTemplate = Session & {
  roleTemplate: { roleName: string; durationMinutes: number };
};

/**
 * Build the question list shape returned in session start/resume responses.
 * Phase 1 returns an empty array because no questions are seeded yet.
 * Phase 3 replaces this with real question fetching.
 */
function buildQuestionList(_session: Session): [] {
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly graceWindowSeconds: number;
  private readonly maxDisconnectCount: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly candidate: CandidateService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue("grace-window")
    private readonly graceWindowQueue: Queue<{ sessionId: string }>,
  ) {
    this.graceWindowSeconds = this.config.get("graceWindowSeconds", {
      infer: true,
    });
    this.maxDisconnectCount = this.config.get("maxDisconnectCount", {
      infer: true,
    });
  }

  // ─── Start session ────────────────────────────────────────────────────────

  /**
   * Validate the invite token, create or retrieve the candidate, create the
   * session, and return the contract-specified response.
   *
   * Error codes (thrown as NestJS exceptions):
   *   401 INVITE_TOKEN_INVALID  — bad/malformed token
   *   410 INVITE_TOKEN_EXPIRED  — token past TTL
   *   409 SESSION_ALREADY_ACTIVE — candidate already has IN_PROGRESS session
   */
  async startSession(inviteToken: string): Promise<StartSessionResponse> {
    // 1. Verify token (throws 401/410 on failure)
    const payload = this.auth.verifyInviteToken(inviteToken);

    // 2. Validate roleTemplate exists
    const roleTemplate = await this.prisma.roleTemplate.findUnique({
      where: { id: payload.roleTemplateId },
    });

    if (!roleTemplate) {
      this.logger.warn(
        `Invite token references unknown roleTemplateId: ${payload.roleTemplateId}`,
      );
      // Treat as invalid token — leaking "role not found" is unnecessary
      throw new UnprocessableEntityException({
        code: "INVITE_TOKEN_INVALID",
        message: "The invite token references an unknown role template.",
      });
    }

    // 3. Find or create candidate
    const candidateRecord = await this.candidate.findOrCreate(
      payload.email,
      payload.name,
    );

    // 4. Guard against concurrent active sessions
    const activeSession = await this.prisma.session.findFirst({
      where: {
        candidateId: candidateRecord.id,
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
      },
    });

    if (activeSession) {
      throw new ConflictException({
        code: "SESSION_ALREADY_ACTIVE",
        message: "A session for this candidate is already active.",
      });
    }

    // 5. Compute deadline server-side
    const now = new Date();
    const deadlineAt = new Date(
      now.getTime() + roleTemplate.durationMinutes * 60 * 1000,
    );

    // 6. Create the session
    const session = await this.prisma.session.create({
      data: {
        candidateId: candidateRecord.id,
        roleTemplateId: payload.roleTemplateId,
        cvMode: payload.cvMode as CvMode,
        status: SessionStatus.IN_PROGRESS,
        startedAt: now,
        deadlineAt,
        lastHeartbeatAt: now,
        lastActivityAt: now,
        disconnectCount: 0,
      },
      include: { roleTemplate: true },
    });

    this.logger.log(
      `Session created: ${session.id} for candidate ${candidateRecord.id}`,
    );

    return this.buildStartResponse(
      session as SessionWithTemplate,
      candidateRecord.id,
    );
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────

  /**
   * Update lastHeartbeatAt and enforce single-active-tab.
   *
   * Error codes:
   *   404 SESSION_NOT_FOUND        — session does not exist
   *   422 SESSION_NOT_IN_PROGRESS  — session is not IN_PROGRESS
   *   409 SECOND_TAB_DETECTED      — a different tabId is already registered
   */
  async heartbeat(
    sessionId: string,
    tabId: string,
  ): Promise<HeartbeatResponse> {
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

    // Single-active-tab enforcement:
    // If activeTabId is set and differs from the incoming tabId, block the second tab.
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
        // Register the tab on the first heartbeat (activeTabId was null)
        activeTabId: tabId,
      },
    });

    return {
      ok: true,
      sessionStatus:
        SessionStatus.IN_PROGRESS as unknown as import("@cd-recruit/shared-types").SessionStatus,
      deadlineAt: session.deadlineAt!.toISOString(),
    };
  }

  // ─── Resume ───────────────────────────────────────────────────────────────

  /**
   * Reconnect a DISCONNECTED session within the grace window.
   *
   * Error codes:
   *   404 SESSION_NOT_FOUND        — session not found
   *   409 SESSION_NOT_DISCONNECTED — session is not DISCONNECTED
   *   410 MAX_DISCONNECTS_REACHED  — disconnectCount >= maxDisconnectCount
   *   410 RESUME_WINDOW_EXPIRED    — disconnectedAt + graceWindow < now
   */
  async resumeSession(
    sessionId: string,
    tabId: string,
  ): Promise<ResumeSessionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { roleTemplate: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    if (session.status !== SessionStatus.DISCONNECTED) {
      throw new ConflictException({
        code: "SESSION_NOT_DISCONNECTED",
        message: `Session is not DISCONNECTED (current status: ${session.status}).`,
      });
    }

    // Max disconnects check — if already at limit, session was auto-submitted
    if (session.disconnectCount >= this.maxDisconnectCount) {
      throw new GoneException({
        code: "MAX_DISCONNECTS_REACHED",
        message: `Maximum disconnects (${this.maxDisconnectCount}) reached. Session was auto-submitted.`,
      });
    }

    // Grace window check
    if (!session.disconnectedAt) {
      // Should not happen if the heartbeat monitor is working, but guard anyway
      throw new GoneException({
        code: "RESUME_WINDOW_EXPIRED",
        message: "The reconnect window has expired.",
      });
    }

    const graceCutoff = new Date(
      session.disconnectedAt.getTime() + this.graceWindowSeconds * 1000,
    );

    if (new Date() > graceCutoff) {
      throw new GoneException({
        code: "RESUME_WINDOW_EXPIRED",
        message:
          "The reconnect window has expired. Session was auto-submitted.",
      });
    }

    const now = new Date();

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.IN_PROGRESS,
        activeTabId: tabId,
        lastHeartbeatAt: now,
        lastActivityAt: now,
        disconnectedAt: null,
      },
      include: { roleTemplate: true },
    });

    // Log the reconnect event
    await this.prisma.eventLog.create({
      data: {
        sessionId,
        eventType: "RECONNECTED",
        payload: { tabId },
        occurredAt: now,
      },
    });

    this.logger.log(
      `Session resumed: ${sessionId} (disconnectCount=${updated.disconnectCount})`,
    );

    return {
      sessionId: updated.id,
      status:
        updated.status as unknown as import("@cd-recruit/shared-types").SessionStatus,
      deadlineAt: updated.deadlineAt!.toISOString(),
      disconnectCount: updated.disconnectCount,
      reconnectedAt: now.toISOString(),
      questions: buildQuestionList(updated),
    };
  }

  // ─── Close session ────────────────────────────────────────────────────────

  /**
   * Manual submission — candidate explicitly closes the session.
   * Transitions: IN_PROGRESS → SUBMITTED.
   */
  async closeSession(sessionId: string): Promise<CloseSessionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    const submittable: SessionStatus[] = [
      SessionStatus.IN_PROGRESS,
      SessionStatus.DISCONNECTED,
    ];

    if (!submittable.includes(session.status)) {
      throw new UnprocessableEntityException({
        code: "SESSION_NOT_SUBMITTABLE",
        message: `Session cannot be submitted in status: ${session.status}.`,
      });
    }

    const now = new Date();
    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.SUBMITTED,
        submittedAt: now,
        lastActivityAt: now,
      },
    });

    this.logger.log(`Session closed (submitted): ${sessionId}`);

    return {
      sessionId: updated.id,
      status:
        updated.status as unknown as import("@cd-recruit/shared-types").SessionStatus,
      submittedAt: now.toISOString(),
    };
  }

  // ─── Disconnect (called internally by heartbeat monitor) ──────────────────

  /**
   * Transition a session to DISCONNECTED and enqueue a grace-window job.
   * Called by HeartbeatMonitorProcessor — not exposed as an HTTP endpoint.
   *
   * Idempotent: if session is already DISCONNECTED or past IN_PROGRESS, no-op.
   */
  async markDisconnected(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== SessionStatus.IN_PROGRESS) {
      return; // Already transitioned — idempotent no-op
    }

    const now = new Date();
    const newDisconnectCount = session.disconnectCount + 1;

    // If this disconnect hits the max, go straight to AUTO_SUBMITTED
    if (newDisconnectCount >= this.maxDisconnectCount) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.AUTO_SUBMITTED,
          submittedAt: now,
          lastActivityAt: now,
          disconnectCount: newDisconnectCount,
          disconnectedAt: now,
        },
      });

      await this.prisma.eventLog.create({
        data: {
          sessionId,
          eventType: "AUTO_SUBMITTED",
          payload: {
            reason: "MAX_DISCONNECTS_REACHED",
            disconnectCount: newDisconnectCount,
          },
          occurredAt: now,
        },
      });

      this.logger.warn(
        `Session ${sessionId} AUTO_SUBMITTED — max disconnects (${this.maxDisconnectCount}) reached`,
      );
      return;
    }

    // Transition to DISCONNECTED and enqueue grace-window job
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.DISCONNECTED,
        disconnectedAt: now,
        lastActivityAt: now,
        disconnectCount: newDisconnectCount,
        activeTabId: null,
      },
    });

    await this.prisma.eventLog.create({
      data: {
        sessionId,
        eventType: "DISCONNECTED",
        payload: { disconnectCount: newDisconnectCount },
        occurredAt: now,
      },
    });

    // Enqueue a delayed auto-submit job for the grace window cutoff.
    // jobId is deterministic per sessionId to prevent duplicate jobs.
    await this.graceWindowQueue.add(
      "auto-submit",
      { sessionId },
      {
        delay: this.graceWindowSeconds * 1000,
        jobId: `grace-${sessionId}`, // deterministic — safe to re-enqueue
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Session ${sessionId} → DISCONNECTED (count=${newDisconnectCount}); ` +
        `grace-window job enqueued, delay=${this.graceWindowSeconds}s`,
    );
  }

  // ─── Auto-submit (called by grace-window processor) ───────────────────────

  /**
   * Auto-submit a session that is still DISCONNECTED after the grace window.
   * Idempotent: if session is no longer DISCONNECTED (resumed or already closed), no-op.
   */
  async autoSubmit(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== SessionStatus.DISCONNECTED) {
      this.logger.debug(
        `autoSubmit no-op for session ${sessionId} (status: ${session?.status ?? "not found"})`,
      );
      return;
    }

    const now = new Date();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.AUTO_SUBMITTED,
        submittedAt: now,
        lastActivityAt: now,
      },
    });

    await this.prisma.eventLog.create({
      data: {
        sessionId,
        eventType: "AUTO_SUBMITTED",
        payload: { reason: "GRACE_WINDOW_EXPIRED" },
        occurredAt: now,
      },
    });

    this.logger.warn(
      `Session ${sessionId} AUTO_SUBMITTED — grace window expired`,
    );
  }

  // ─── Response builder ─────────────────────────────────────────────────────

  private buildStartResponse(
    session: SessionWithTemplate,
    candidateId: string,
  ): StartSessionResponse {
    return {
      sessionId: session.id,
      candidateId,
      roleTemplateId: session.roleTemplateId,
      roleTemplateName: session.roleTemplate.roleName,
      durationMinutes: session.roleTemplate.durationMinutes,
      cvMode:
        session.cvMode as unknown as import("@cd-recruit/shared-types").CvMode,
      status:
        session.status as unknown as import("@cd-recruit/shared-types").SessionStatus,
      startedAt: session.startedAt!.toISOString(),
      deadlineAt: session.deadlineAt!.toISOString(),
      disconnectCount: session.disconnectCount,
      questions: buildQuestionList(session),
    };
  }
}
