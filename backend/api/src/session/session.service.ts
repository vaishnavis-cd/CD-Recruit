import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { GoneException } from "@app/common/exceptions/app.exceptions";
import { ConfigService } from "@nestjs/config";
import { CvMode, Session, SessionStatus, InviteStatus, ConsentType } from "@prisma/client";


import { PrismaService } from "@app/prisma/prisma.service";
import { AuthService } from "@app/auth/auth.service";
import { CandidateService } from "@app/candidate/candidate.service";
import { AppConfig } from "@app/config/configuration";
import { ObjectStoragePort } from "@app/integrations/storage/object-storage.port";
import { QueueProviderPort } from "@app/queue/queue-provider.port";
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
 * Phase 3 replaces this with real question fetching.
 */
async function buildQuestionList(
  prisma: PrismaService,
  session: Session,
): Promise<any[]> {
  if (!session.driveId) {
    return [];
  }
  const driveQuestions = await prisma.driveQuestion.findMany({
    where: { driveId: session.driveId },
    include: { question: true },
    orderBy: [
      { moduleType: "asc" },
      { question: { id: "asc" } },
    ],
  });

  const counts: Record<string, number> = {};
  return driveQuestions.map((dq) => {
    const type = dq.moduleType;
    if (counts[type] === undefined) {
      counts[type] = 0;
    } else {
      counts[type]++;
    }
    return {
      questionId: dq.questionId,
      moduleType: dq.moduleType,
      moduleIndex: counts[type],
      content: dq.question ? dq.question.content : null,
    };
  });
}

import { SessionLifecycleService } from "./session-lifecycle.service";
import { SessionStateMachine } from "./session-state-machine";
import { SessionScoringService } from "./session-scoring.service";

// ─────────────────────────────────────────────────────────────────────────────
// SessionService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly graceWindowSeconds: number;
  private readonly maxDisconnectCount: number;
  private readonly bucketBiometric: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly candidate: CandidateService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly minio: ObjectStoragePort,
    private readonly queueProvider: QueueProviderPort,
    private readonly lifecycleService: SessionLifecycleService,
    private readonly stateMachine: SessionStateMachine,
    private readonly scoringService: SessionScoringService,
  ) {
    this.graceWindowSeconds = this.config.get("graceWindowSeconds", {
      infer: true,
    });
    this.maxDisconnectCount = this.config.get("maxDisconnectCount", {
      infer: true,
    });
    this.bucketBiometric = this.config.get<string>("app.minio.bucketBiometric" as any) ?? "biometrics";
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
    const payload = await this.auth.verifyInviteToken(inviteToken);

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
      payload.candidateEmail,
      payload.candidateName,
    );

    // 4. Reuse existing session if already created for this candidate
    const existingSession = await this.prisma.session.findFirst({
      where: {
        candidateId: candidateRecord.id,
        status: { in: [SessionStatus.NOT_STARTED, SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
      },
      orderBy: { lastActivityAt: "desc" },
    });

    if (existingSession) {
      this.logger.log(`Reusing existing session ${existingSession.id} for candidate ${candidateRecord.email}`);
      const fullExisting = await this.prisma.session.findUnique({
        where: { id: existingSession.id },
        include: { roleTemplate: true },
      });
      return await this.buildStartResponse(
        fullExisting as SessionWithTemplate,
        candidateRecord.id,
      );
    }

    // 5. Create the session (starts as NOT_STARTED, dates set upon /begin)
    const now = new Date();
    const invite = await this.prisma.invite.findUnique({
      where: { id: payload.inviteId },
    });

    const session = await this.prisma.session.create({
      data: {
        candidateId: candidateRecord.id,
        roleTemplateId: payload.roleTemplateId,
        driveId: invite?.driveId || null,
        cvMode: (payload.cvMode as CvMode) || CvMode.FULL,
        status: SessionStatus.NOT_STARTED,
        startedAt: null,
        deadlineAt: null,
        lastHeartbeatAt: null,
        lastActivityAt: now,
        disconnectCount: 0,
      },
      include: { roleTemplate: true },
    });

    if (invite) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.REDEEMED,
          redeemedAt: now,
          sessionId: session.id,
        },
      });
    }

    this.logger.log(
      `Session created: ${session.id} for candidate ${candidateRecord.id}`,
    );

    return await this.buildStartResponse(
      session as SessionWithTemplate,
      candidateRecord.id,
    );
  }

  /**
   * Transition a session from NOT_STARTED to IN_PROGRESS.
   * Computes the deadline based on RoleTemplate duration.
   */
  async beginSession(sessionId: string): Promise<StartSessionResponse> {
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

    if (session.status !== SessionStatus.NOT_STARTED) {
      throw new ConflictException({
        code: "SESSION_ALREADY_STARTED",
        message: `Session has already been started or closed (current status: ${session.status}).`,
      });
    }

    const now = new Date();
    const deadlineAt = new Date(
      now.getTime() + session.roleTemplate.durationMinutes * 60 * 1000,
    );

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.IN_PROGRESS,
        startedAt: now,
        deadlineAt,
        lastHeartbeatAt: now,
        lastActivityAt: now,
      },
      include: { roleTemplate: true },
    });

    this.logger.log(`Session ${sessionId} has begun.`);

    return await this.buildStartResponse(
      updated as SessionWithTemplate,
      updated.candidateId,
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
      questions: await buildQuestionList(this.prisma, updated),
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
      if (session.status === SessionStatus.SUBMITTED) {
        return {
          sessionId: session.id,
          status: session.status as any,
          submittedAt: (session.submittedAt || new Date()).toISOString(),
        };
      }
      throw new UnprocessableEntityException({
        code: "SESSION_NOT_SUBMITTABLE",
        message: `Session cannot be submitted in status: ${session.status}.`,
      });
    }

    const now = new Date();
    if (session.deadlineAt && now > session.deadlineAt) {
      throw new GoneException({
        code: "DEADLINE_PASSED",
        message: "The assessment session deadline has passed.",
      });
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.SUBMITTED,
        submittedAt: now,
        lastActivityAt: now,
      },
    });

    // Calculate real module scores and composite score upon submission
    try {
      await this.scoringService.computeSessionScores(sessionId);
    } catch (err: any) {
      this.logger.error(`Failed to evaluate scores for session ${sessionId}: ${err.message}`);
    }

    await this.prisma.eventLog.create({
      data: {
        sessionId,
        eventType: "SUBMITTED",
        payload: {
          routing: "HUMAN_REVIEW_QUEUE",
          humanReviewed: false,
          reason: "TRACK_B_FAILSAFE_DEFAULT",
        },
        occurredAt: now,
      },
    });

    this.logger.log(`Session closed (submitted): ${sessionId} (Routed to Human Review Queue)`);

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
    await this.queueProvider.enqueueDelayed(
      "grace-window",
      "auto-submit",
      { sessionId },
      {
        delayMs: this.graceWindowSeconds * 1000,
        jobId: `grace-${sessionId}`,
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

  private async buildStartResponse(
    session: SessionWithTemplate,
    candidateId: string,
  ): Promise<StartSessionResponse> {
    const drive = session.driveId
      ? await this.prisma.drive.findUnique({ where: { id: session.driveId } })
      : null;

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
      startedAt: session.startedAt?.toISOString() ?? null,
      deadlineAt: session.deadlineAt?.toISOString() ?? null,
      scheduleStart: drive?.scheduleStart?.toISOString() ?? null,
      bufferMinutes: drive?.bufferMinutes ?? 30,
      graceMinutes: drive?.graceMinutes ?? 120,
      disconnectCount: session.disconnectCount,
      questions: await buildQuestionList(this.prisma, session),
    };
  }

  /**
   * Fetch the full details of a question for the active session.
   */
  async getQuestion(sessionId: string, questionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException({
        code: "QUESTION_NOT_FOUND",
        message: "Question not found.",
      });
    }

    const response = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId,
        },
      },
    });

    return {
      questionId: question.id,
      roleTemplateId: session.roleTemplateId,
      content: this.sanitiseQuestionContent(question.moduleType, question.content),
      response: response
        ? {
            responsePayload: response.responsePayload,
            isDraft: response.isDraft,
            timeSpentSeconds: response.timeSpentSeconds,
          }
        : null,
    };
  }

  /**
   * Strip server-only fields before sending question content to the candidate.
   * - MCQ: remove correctIndex and explanation
   * - SQL: remove expectedQuery
   * - CODING: remove testCases where isHidden === true (and any legacy hiddenTests array)
   */
  private sanitiseQuestionContent(moduleType: string, content: unknown): unknown {
    if (!content || typeof content !== "object") return content;

    const c = content as Record<string, unknown>;

    if (moduleType === "MCQ") {
      const { correctIndex: _ci, explanation: _ex, ...safe } = c;
      return safe;
    }

    if (moduleType === "SQL") {
      const { expectedQuery: _eq, ...safe } = c;
      return safe;
    }

    if (moduleType === "CODING") {
      const { hiddenTestCases: _htc, hiddenTests: _ht, ...rest } = c;
      const visibleTestCases = rest.visibleTestCases || (Array.isArray(rest.testCases)
        ? (rest.testCases as Array<Record<string, unknown>>).filter((tc) => !tc.isHidden)
        : []);
      return { ...rest, testCases: visibleTestCases };
    }

    return content;
  }

  /**
   * Upload baseline selfie to MinIO and store the object key in baselineSelfieRef
   */
  async uploadSelfie(sessionId: string, base64Image: string): Promise<{ ok: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    // Verify session state is NOT_STARTED
    if (session.status !== SessionStatus.NOT_STARTED) {
      throw new ConflictException({
        code: "SESSION_ALREADY_STARTED",
        message: "Cannot upload baseline selfie after session has started.",
      });
    }

    // Parse base64 data URL
    const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new UnprocessableEntityException({
        code: "INVALID_IMAGE_FORMAT",
        message: "Invalid image data format. Expected base64 data URL.",
      });
    }

    const imageBuffer = Buffer.from(matches[2], "base64");
    const objectKey = `selfie-${sessionId}.jpg`;

    // Upload to MinIO
    const uploaded = await this.minio.putObject(
      this.bucketBiometric,
      objectKey,
      imageBuffer,
      { "Content-Type": "image/jpeg" }
    );

    if (!uploaded) {
      throw new UnprocessableEntityException({
        code: "UPLOAD_FAILED",
        message: "Failed to upload selfie to MinIO storage.",
      });
    }

    // Update DB
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        baselineSelfieRef: objectKey,
      },
    });

    return { ok: true };
  }

  /**
   * Persist candidate consent record in PostgreSQL.
   */
  async recordConsent(
    sessionId: string,
    version: string = "1.0",
    ipAddress: string = "127.0.0.1",
    rawConsentType?: string | ConsentType,
  ): Promise<{ ok: boolean; consentRecordId: string }> {
    let session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: { OR: [{ token: sessionId }, { id: sessionId }] },
        include: { session: true },
      });
      if (invite?.session) {
        session = invite.session;
      }
    }

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    const consentType = (rawConsentType as ConsentType) || ConsentType.TERMS;

    const consentRecord = await this.prisma.consentRecord.create({
      data: {
        candidateId: session.candidateId,
        consentType: "TERMS" as any,
        version: version || "1.0",
        ipAddress: ipAddress || "127.0.0.1",
        consentedAt: new Date(),
      },
    });

    this.logger.log(
      `[SessionService] Consent record created: ID=${consentRecord.id} for Candidate=${session.candidateId}`,
    );

    return { ok: true, consentRecordId: consentRecord.id };
  }
}

