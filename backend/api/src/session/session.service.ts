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
import { CvMode, InviteStatus, Session, SessionStatus } from "@prisma/client";

import { PrismaService } from "@app/prisma/prisma.service";
import { AuthService } from "@app/auth/auth.service";
import { CandidateService } from "@app/candidate/candidate.service";
import { AppConfig } from "@app/config/configuration";
import { MinioService } from "@app/integrations/minio/minio.service";
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
 * Build the ordered question list for a session from its drive.
 *
 * Ownership chain: Session.driveId → Drive → DriveQuestion → Question
 *
 * Ordering: DriveQuestion.id ASC (stable insertion order — UUIDs sort by creation time).
 * TODO: Add an explicit `sequence` INTEGER column to DriveQuestion in a future
 * migration, then replace orderBy: { id: 'asc' } with
 * orderBy: { sequence: 'asc' } everywhere question order is resolved.
 * Migration: ALTER TABLE drive_question ADD COLUMN sequence INTEGER;
 */
async function buildQuestionList(
  prisma: PrismaService,
  session: Session,
): Promise<import("@cd-recruit/shared-types").QuestionSummary[]> {
  if (!session.driveId) {
    return [];
  }

  // Fetch all DriveQuestion entries for this drive in stable order
  // TODO: Replace with explicit sequence column — see migration note above
  const driveQuestions = await prisma.driveQuestion.findMany({
    where: { driveId: session.driveId },
    orderBy: { id: "asc" }, // TODO: Replace with explicit sequence column
  });

  // Fetch all responses for this session in one query
  const responses = await prisma.moduleResponse.findMany({
    where: { sessionId: session.id },
  });

  const responseMap = new Map(responses.map((r) => [r.questionId, r]));

  // Compute per-module-type index (0-based) for free-navigation addressing
  // QuestionSummary.moduleIndex = position of this question within its moduleType
  const moduleTypeCounters = new Map<string, number>();

  return driveQuestions.map((dq) => {
    const response = responseMap.get(dq.questionId);
    let status: "untouched" | "draft" | "submitted";

    if (!response) {
      status = "untouched";
    } else if (response.isDraft === false) {
      status = "submitted";
    } else {
      status = "draft";
    }

    const moduleTypeKey = dq.moduleType as string;
    const moduleIndex = moduleTypeCounters.get(moduleTypeKey) ?? 0;
    moduleTypeCounters.set(moduleTypeKey, moduleIndex + 1);

    return {
      questionId: dq.questionId,
      moduleType:
        dq.moduleType as unknown as import("@cd-recruit/shared-types").ModuleType,
      moduleIndex,
      status,
    };
  });
}

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
    private readonly minio: MinioService,
    @InjectQueue("grace-window")
    private readonly graceWindowQueue: Queue<{ sessionId: string }>,
  ) {
    this.graceWindowSeconds = this.config.get("graceWindowSeconds", {
      infer: true,
    });
    this.maxDisconnectCount = this.config.get("maxDisconnectCount", {
      infer: true,
    });
    this.bucketBiometric =
      this.config.get<string>("app.minio.bucketBiometric" as any) ??
      "biometrics";
  }

  // ─── Start session ────────────────────────────────────────────────────────

  /**
   * Validate the invite token, create or retrieve the candidate, create the
   * session, and return the contract-specified response.
   *
   * Error codes:
   *   401 INVITE_TOKEN_INVALID  — bad/malformed token
   *   410 INVITE_TOKEN_EXPIRED  — token past TTL
   *   409 SESSION_ALREADY_ACTIVE — candidate already has IN_PROGRESS session
   */
  async startSession(inviteToken: string): Promise<StartSessionResponse> {
    // 1. Verify token
    const payload = this.auth.verifyInviteToken(inviteToken);

    // 2. Validate roleTemplate exists
    const roleTemplate = await this.prisma.roleTemplate.findUnique({
      where: { id: payload.roleTemplateId },
    });

    if (!roleTemplate) {
      this.logger.warn(
        `Invite token references unknown roleTemplateId: ${payload.roleTemplateId}`,
      );
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

    // 5. Fetch the invite to get driveId — Session must know its Drive for
    //    question serving via Session → Drive → DriveQuestion
    const invite = await this.prisma.invite.findFirst({
      where: {
        candidateEmail: payload.candidateEmail,
        roleTemplateId: payload.roleTemplateId,
        status: InviteStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });

    // 6. Create the session
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        candidateId: candidateRecord.id,
        roleTemplateId: payload.roleTemplateId,
        driveId: invite?.driveId ?? null, // Populate from invite — required for question serving
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

    this.logger.log(
      `Session created: ${session.id} for candidate ${candidateRecord.id} ` +
        `driveId=${session.driveId ?? "none"}`,
    );

    return this.buildStartResponse(
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

    return this.buildStartResponse(
      updated as SessionWithTemplate,
      updated.candidateId,
    );
  }

  // ─── Heartbeat ────────────────────────────────────────────────────────────

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
      ok: true,
      sessionStatus:
        SessionStatus.IN_PROGRESS as unknown as import("@cd-recruit/shared-types").SessionStatus,
      deadlineAt: session.deadlineAt!.toISOString(),
    };
  }

  // ─── Resume ───────────────────────────────────────────────────────────────

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

    if (session.disconnectCount >= this.maxDisconnectCount) {
      throw new GoneException({
        code: "MAX_DISCONNECTS_REACHED",
        message: `Maximum disconnects (${this.maxDisconnectCount}) reached. Session was auto-submitted.`,
      });
    }

    if (!session.disconnectedAt) {
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
        message: "The reconnect window has expired. Session was auto-submitted.",
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

    this.logger.log(`Session closed (submitted): ${sessionId}`);

    return {
      sessionId: updated.id,
      status:
        updated.status as unknown as import("@cd-recruit/shared-types").SessionStatus,
      submittedAt: now.toISOString(),
    };
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────

  async markDisconnected(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== SessionStatus.IN_PROGRESS) {
      return;
    }

    const now = new Date();
    const newDisconnectCount = session.disconnectCount + 1;

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

    await this.graceWindowQueue.add(
      "auto-submit",
      { sessionId },
      {
        delay: this.graceWindowSeconds * 1000,
        jobId: `grace-${sessionId}`,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(
      `Session ${sessionId} → DISCONNECTED (count=${newDisconnectCount}); ` +
        `grace-window job enqueued, delay=${this.graceWindowSeconds}s`,
    );
  }

  // ─── Auto-submit ──────────────────────────────────────────────────────────

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

  // ─── Selfie upload ────────────────────────────────────────────────────────

  async uploadSelfie(
    sessionId: string,
    base64Image: string,
  ): Promise<{ ok: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
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
        message: "Cannot upload baseline selfie after session has started.",
      });
    }

    const matches = base64Image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new UnprocessableEntityException({
        code: "INVALID_IMAGE_FORMAT",
        message: "Invalid image data format. Expected base64 data URL.",
      });
    }

    const imageBuffer = Buffer.from(matches[2], "base64");
    const objectKey = `selfie-${sessionId}.jpg`;

    const uploaded = await this.minio.putObject(
      this.bucketBiometric,
      objectKey,
      imageBuffer,
      { "Content-Type": "image/jpeg" },
    );

    if (!uploaded) {
      throw new UnprocessableEntityException({
        code: "UPLOAD_FAILED",
        message: "Failed to upload selfie to MinIO storage.",
      });
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { baselineSelfieRef: objectKey },
    });

    return { ok: true };
  }

  // ─── Question serving (Phase 3) ───────────────────────────────────────────

  /**
   * Fetch a single question for a session with answer keys stripped.
   * Includes existing draft response so the frontend can restore state.
   *
   * Ownership validated via: Session.driveId → DriveQuestion → Question
   */
  async getQuestionForSession(sessionId: string, questionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    if (!session.driveId) {
      throw new UnprocessableEntityException({
        code: "NO_DRIVE_ASSIGNED",
        message: "Session has no assigned drive.",
      });
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new UnprocessableEntityException({
        code: "SESSION_NOT_IN_PROGRESS",
        message: "Session must be IN_PROGRESS to fetch questions.",
      });
    }

    // Validate ownership: Session → Drive → DriveQuestion
    const driveQuestion = await this.prisma.driveQuestion.findFirst({
      where: {
        driveId: session.driveId,
        questionId,
      },
    });

    if (!driveQuestion) {
      throw new NotFoundException({
        code: "QUESTION_NOT_IN_SESSION",
        message: "Question does not belong to this session.",
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

    const sanitizedContent = this.stripAnswerFields(
      question.moduleType,
      question.content,
    );

    // Include existing draft for frontend state restoration after refresh
    const draftResponse = await this.prisma.moduleResponse.findUnique({
      where: { sessionId_questionId: { sessionId, questionId } },
    });

    return {
      id: question.id,
      moduleType: question.moduleType,
      content: sanitizedContent,
      difficulty: question.difficulty,
      tags: question.tags,
      draftResponse: draftResponse
        ? {
            content: draftResponse.responsePayload,
            isDraft: draftResponse.isDraft,
            lastAutosavedAt: draftResponse.lastAutosavedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * Strip answer-bearing fields before sending a question to the candidate.
   *
   * MCQ:          scoringConfig.correctIndex is never sent (kept server-side only)
   * SQL:          content.expectedQuery removed
   * CODING:       testCase.expectedOutput removed; input kept for display
   * AI_PROMPTING: content.rubric removed; prompt kept
   */
  private stripAnswerFields(moduleType: string, content: any): any {
    const sanitized = { ...content };

    switch (moduleType) {
      case "SQL":
        delete sanitized.expectedQuery;
        return sanitized;

      case "CODING":
        if (sanitized.testCases) {
          sanitized.testCases = sanitized.testCases.map((tc: any) => ({
            input: tc.input,
          }));
        }
        return sanitized;

      case "AI_PROMPTING":
        delete sanitized.rubric;
        return sanitized;

      case "MCQ":
      default:
        // MCQ: options live in content — nothing to strip.
        // correctIndex is in scoringConfig which is never included in the response.
        return sanitized;
    }
  }

  // ─── Progress (Phase 3) ───────────────────────────────────────────────────

  /**
   * Return per-question status for the session's question list.
   * Used by the frontend sidebar to show answered/draft/untouched state.
   */
  async getProgress(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    const questions = await buildQuestionList(this.prisma, session);
    return { questions };
  }

  // ─── Response builder ─────────────────────────────────────────────────────

  private async buildStartResponse(
    session: SessionWithTemplate,
    candidateId: string,
  ): Promise<StartSessionResponse> {
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
      disconnectCount: session.disconnectCount,
      questions: await buildQuestionList(this.prisma, session),
    };
  }
}
