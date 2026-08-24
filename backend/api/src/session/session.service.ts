import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { GoneException } from "@app/common/exceptions/app.exceptions";
import { ConfigService } from "@nestjs/config";
import { CvMode, Session, SessionStatus, InviteStatus, ConsentType } from "@prisma/client";


import { PrismaService } from "@app/prisma/prisma.service";
import { AuthService } from "@app/auth/auth.service";
import { CandidateService } from "@app/candidate/candidate.service";
import { AppConfig } from "@app/config/configuration";
import { MinioService } from "@app/integrations/minio/minio.service";
import { QueueProviderPort } from "@app/queue/queue-provider.port";
import { SandboxOrchestratorService } from "../simulation/sandbox/sandbox-orchestrator.service";
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
import { DriveShufflerService } from "../drive/drive-shuffler.service";

const driveShuffler = new DriveShufflerService();

function resolveSeniorityTag(roleTemplate: any): string {
  if (!roleTemplate) {
    throw new UnprocessableEntityException("No role template found to resolve seniority");
  }
  if (roleTemplate.level === "FRESHER") {
    return "fresher";
  }
  if (roleTemplate.level === "EXPERIENCED") {
    const expLvl = roleTemplate.experiencedLevel;
    if (expLvl === "L1") return "l1";
    if (expLvl === "L2") return "l2";
    if (expLvl === "L3") return "l3";
    throw new UnprocessableEntityException(`Experienced templates must specify an experienced level (L1, L2, L3). Current: ${expLvl}`);
  }
  throw new UnprocessableEntityException(`Invalid ExperienceLevel configuration: ${roleTemplate.level}`);
}

async function buildQuestionList(
  prisma: PrismaService,
  session: Session,
): Promise<any[]> {
  try {
    let driveId = session.driveId;

    if (!driveId) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: session.candidateId },
      });
      if (candidate) {
        const invite = await prisma.invite.findFirst({
          where: { candidateEmail: candidate.email },
          orderBy: { createdAt: "desc" },
        });
        driveId = invite?.driveId || null;
      }
    }

    if (!driveId) {
      throw new UnprocessableEntityException("No valid drive associated with this session");
    }

    const drive = await prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        roleTemplate: {
          include: {
            questions: {
              include: { question: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        },
      },
    });

    if (!drive) {
      throw new UnprocessableEntityException(`Drive not found with ID ${driveId}`);
    }

    const resolvedTag = resolveSeniorityTag(drive.roleTemplate);
    const preset = (drive?.roleTemplate?.weightingPreset as Record<string, number>) || {};
    const enabledMods = Object.entries(preset)
      .filter(([_, w]) => Number(w) > 0)
      .map(([mod]) => mod);

    const deptName = drive?.roleTemplate?.department || drive?.roleTemplate?.roleName || "UNSPECIFIED";
    const deptUpper = deptName.toUpperCase();
    const isSde = deptUpper.includes("SOFTWARE") || deptUpper.includes("SDE") || deptUpper.includes("DEVELOPER");
    const primaryDept = isSde ? "SOFTWARE_ENGINEERING" : deptUpper;
    const altDept = isSde ? "SDE" : deptUpper;

    // A. explicitly linked DriveQuestions path
    const driveQuestions = await prisma.driveQuestion.findMany({
      where: { driveId },
      include: { question: true },
      orderBy: [
        { moduleType: "asc" },
        { question: { id: "asc" } },
      ],
    });

    if (driveQuestions && driveQuestions.length > 0) {
      // Seniority Filtering for explicit DriveQuestions
      const filteredDriveQuestions = driveQuestions.filter(dq => {
        const q = dq.question;
        if (!q) return false;
        if (q.status !== "PUBLISHED") return false;

        const qRole = q.role?.toUpperCase() || "";
        const matchesDept = qRole === primaryDept || qRole === altDept;
        if (!matchesDept) return false;

        if (!enabledMods.includes(dq.moduleType)) return false;

        const qTags = (q.tags || []).map(t => t.toLowerCase());
        return qTags.includes(resolvedTag);
      });

      if (filteredDriveQuestions.length === 0) {
        console.warn(`[buildQuestionList] Allocation shortage: 0 questions matched criteria for Drive ${driveId} and seniority ${resolvedTag}`);
        return [];
      }

      const shuffled = driveShuffler.shuffleQuestionsForCandidate(
        filteredDriveQuestions as any,
        session.candidateId,
        driveId
      );
      const resultList = shuffled.map((q: any) => {
        const matchingDq = driveQuestions.find((dq) => dq.questionId === q.questionId);
        const rawQ = matchingDq?.question || q;
        const tags = rawQ.tags || [];
        const prompt = typeof rawQ.content?.prompt === "string" ? rawQ.content.prompt.toLowerCase() : "";
        const isDebug = rawQ.moduleType === "DEBUGGING" || q.moduleType === "DEBUGGING" || tags.includes("debugging") || prompt.includes("debugging challenge");
        const effectiveModuleType = isDebug ? "DEBUGGING" : (q.moduleType || rawQ.moduleType);
        return {
          ...q,
          moduleType: effectiveModuleType,
          content: rawQ.content || q.content || {},
          difficulty: rawQ.difficulty || q.difficulty || "medium",
        };
      });

      const driveObj = await prisma.drive.findUnique({ where: { id: driveId } });
      if (driveObj && driveObj.moduleConfig) {
        const mc = driveObj.moduleConfig as Record<string, { enabled?: boolean }>;
        if (mc.AI_PROMPTING?.enabled) {
          const hasAiPromptingQuestion = resultList.some((q: any) => q.moduleType === "AI_PROMPTING");
          if (!hasAiPromptingQuestion) {
            resultList.push({
              questionId: "ai-prompting-dynamic",
              moduleType: "AI_PROMPTING",
              moduleIndex: 0,
              content: {
                title: "AI Prompting Challenge",
                prompt: "Engage in conversational problem solving with the AI assistant.",
              },
              difficulty: "medium",
            });
          }
        }
      }
      return resultList;
    }

    // B. Check template questions from RoleTemplate path
    if (drive?.roleTemplate?.questions && drive.roleTemplate.questions.length > 0) {
      const filteredTQuestions = drive.roleTemplate.questions.filter(tq => {
        const q = tq.question;
        if (!q) return false;
        if (q.status !== "PUBLISHED") return false;

        const qRole = q.role?.toUpperCase() || "";
        const matchesDept = qRole === primaryDept || qRole === altDept;
        if (!matchesDept) return false;

        if (!enabledMods.includes(tq.moduleType)) return false;

        const qTags = (q.tags || []).map(t => t.toLowerCase());
        return qTags.includes(resolvedTag);
      });

      const tQuestions = filteredTQuestions.map((tq, idx) => ({
        questionId: tq.questionId,
        moduleType: tq.moduleType,
        moduleIndex: idx,
        content: tq.question?.content || {},
        difficulty: tq.question?.difficulty || "medium",
      }));
      return tQuestions;
    }

    // C. Check department-scoped fallback questions path
    if (deptName && deptName !== "UNSPECIFIED") {
      const whereClause: any = {
        status: "PUBLISHED",
        OR: [
          { role: { equals: primaryDept, mode: "insensitive" } },
          { role: { equals: altDept, mode: "insensitive" } },
          { content: { path: ["department"], equals: primaryDept } },
          { content: { path: ["department"], equals: altDept } },
        ],
        tags: { has: resolvedTag }
      };

      if (enabledMods.length > 0) {
        whereClause.moduleType = { in: enabledMods };
      }

      const deptQuestions = await prisma.question.findMany({
        where: whereClause,
        orderBy: { moduleType: "asc" },
      });

      if (deptQuestions && deptQuestions.length > 0) {
        return deptQuestions.map((q, idx) => ({
          questionId: q.id,
          moduleType: q.moduleType,
          moduleIndex: idx,
          content: q.content,
          difficulty: q.difficulty || "medium",
        }));
      }
    }

    // If department question pool is empty, FAIL with a clear, explicit error (NEVER cross-role leak)
    throw new UnprocessableEntityException(
      `No questions available for department ${deptName} and seniority ${resolvedTag} — question bank not yet populated`
    );
  } catch (err) {
    console.error("[buildQuestionList] Error building questions:", err);
    throw err;
  }
}

import { SessionLifecycleService } from "./session-lifecycle.service";
import { SessionStateMachine } from "./session-state-machine";
import { SessionScoringService } from "./session-scoring.service";
import { FaceVerifyClient } from "../integrations/face-verify/face-verify.client";

import { SessionStatusPort } from "@app/common/ports/session-status.port";

// ─────────────────────────────────────────────────────────────────────────────
// SessionService
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SessionService implements SessionStatusPort {
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
    private readonly queueProvider: QueueProviderPort,
    private readonly lifecycleService: SessionLifecycleService,
    private readonly stateMachine: SessionStateMachine,
    private readonly scoringService: SessionScoringService,
    private readonly sandboxOrchestrator: SandboxOrchestratorService,
    private readonly faceVerifyClient: FaceVerifyClient,
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

    // 2. Validate roleTemplate exists with fallback
    let roleTemplate = null;
    if (payload.roleTemplateId) {
      roleTemplate = await this.prisma.roleTemplate.findUnique({
        where: { id: payload.roleTemplateId },
      });
    }

    if (!roleTemplate) {
      roleTemplate = await this.prisma.roleTemplate.findFirst();
    }

    if (!roleTemplate) {
      roleTemplate = await this.prisma.roleTemplate.create({
        data: {
          roleName: "Software Engineer",
          weightingPreset: {},
          durationMinutes: 60,
        },
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

    const isNewOrNotStarted = !existingSession || existingSession.status === SessionStatus.NOT_STARTED;
    if (isNewOrNotStarted) {
      const invite = await this.prisma.invite.findUnique({
        where: { id: payload.inviteId },
        include: { drive: true },
      });
      if (invite?.scheduledTime) {
        const now = new Date();
        const graceMinutes = 20; // 20 minutes grace window
        const cutoff = new Date(invite.scheduledTime.getTime() + graceMinutes * 60 * 1000);
        if (now > cutoff) {
          throw new UnauthorizedException({
            code: "INVITE_TOKEN_EXPIRED",
            message: "The assessment window has expired.",
          });
        }
      }
    }

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

    if (invite?.idProofRef) {
      await this.prisma.candidate.update({
        where: { id: candidateRecord.id },
        data: {
          idProofRef: invite.idProofRef,
          idProofEmbedding: invite.idProofEmbedding,
          idProofModel: "ArcFace",
        },
      });
    } else {
      if (!invite) {
        this.logger.warn(
          `Invite ${payload.inviteId} missing during session start for session ${session.id}`,
        );
      }
      await this.createNoIdProofFlag(session.id);
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
      return await this.buildStartResponse(
        session as SessionWithTemplate,
        session.candidateId,
      );
    }

    if (session.driveId) {
      const drive = await this.prisma.drive.findUnique({
        where: { id: session.driveId },
      });
      if (drive && drive.scheduleStart) {
        const now = new Date();
        const graceMinutes = 20; // 20 minutes grace window
        const cutoff = new Date(drive.scheduleStart.getTime() + graceMinutes * 60 * 1000);
        if (now > cutoff) {
          throw new BadRequestException({
            code: "INVITE_TOKEN_EXPIRED",
            message: "The assessment window has expired.",
          });
        }
      }
    }

    let durationMinutes = session.roleTemplate.durationMinutes;
    if (session.driveId) {
      const drive = await this.prisma.drive.findUnique({
        where: { id: session.driveId },
      });
      if (drive && drive.moduleConfig) {
        const mc = drive.moduleConfig as Record<string, { enabled?: boolean; durationMinutes?: number }>;
        const totalDriveMins = Object.values(mc)
          .filter((conf) => conf?.enabled)
          .reduce((sum, conf) => sum + (Number(conf?.durationMinutes) || 0), 0);

        if (totalDriveMins > 0) {
          durationMinutes = totalDriveMins;
        }
      }
    }

    const now = new Date();
    const deadlineAt = new Date(
      now.getTime() + durationMinutes * 60 * 1000,
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

    try {
      await this.sandboxOrchestrator.ensureWorkspace(sessionId);
    } catch (err: any) {
      this.logger.warn(`Workspace provisioning warning for session ${sessionId}: ${err.message}`);
    }

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

    // Calculate real module scores and composite score upon submission if not already scored by simulation evaluator
    try {
      const existingScore = await this.prisma.score.findUnique({ where: { sessionId } });
      if (!existingScore || existingScore.gradingSource === "no_data" || existingScore.gradingSource === "placeholder" || existingScore.gradingSource === "AUTOMATED_EVALUATION_ENGINE") {
        await this.scoringService.computeSessionScores(sessionId);
      } else {
        this.logger.log(`[closeSession] Skipping computeSessionScores for ${sessionId} — existing simulation score preserved (gradingSource: ${existingScore.gradingSource})`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to evaluate scores for session ${sessionId}: ${err.message}`);
    }

    // Reap container sandbox workspace on session completion
    try {
      await this.sandboxOrchestrator.reapWorkspace(sessionId);
    } catch (err: any) {
      this.logger.warn(`Failed to reap workspace for session ${sessionId}: ${err.message}`);
    }

    try {
      const responses = await this.prisma.moduleResponse.findMany({
        where: { sessionId, sandboxDbName: { not: null } },
      });
      for (const resp of responses) {
        if (resp.sandboxDbName) {
          await this.queueProvider.enqueueDelayed(
            "heartbeat-monitor",
            "drop-sandbox",
            { sandboxDbName: resp.sandboxDbName },
            { delayMs: 0 },
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to enqueue sandbox drop jobs on session close for session ${sessionId}: ${err.message}`);
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

    try {
      const existingScore = await this.prisma.score.findUnique({ where: { sessionId } });
      if (!existingScore || existingScore.gradingSource === "no_data" || existingScore.gradingSource === "placeholder" || existingScore.gradingSource === "AUTOMATED_EVALUATION_ENGINE") {
        await this.scoringService.computeSessionScores(sessionId);
      } else {
        this.logger.log(`[autoSubmitSession] Skipping computeSessionScores for ${sessionId} — existing simulation score preserved (gradingSource: ${existingScore.gradingSource})`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to evaluate scores on autoSubmit for session ${sessionId}: ${err.message}`);
    }

    try {
      await this.sandboxOrchestrator.reapWorkspace(sessionId);
    } catch (err: any) {
      this.logger.warn(`Failed to reap workspace on autoSubmit for session ${sessionId}: ${err.message}`);
    }

    try {
      const responses = await this.prisma.moduleResponse.findMany({
        where: { sessionId, sandboxDbName: { not: null } },
      });
      for (const resp of responses) {
        if (resp.sandboxDbName) {
          await this.queueProvider.enqueueDelayed(
            "heartbeat-monitor",
            "drop-sandbox",
            { sandboxDbName: resp.sandboxDbName },
            { delayMs: 0 },
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to enqueue sandbox drop jobs on autoSubmit for session ${sessionId}: ${err.message}`);
    }

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

    let durationMinutes = session.roleTemplate.durationMinutes;
    if (drive && drive.moduleConfig) {
      const mc = drive.moduleConfig as Record<string, { enabled?: boolean; durationMinutes?: number }>;
      const totalDriveMins = Object.values(mc)
        .filter((conf) => conf?.enabled)
        .reduce((sum, conf) => sum + (Number(conf?.durationMinutes) || 0), 0);

      if (totalDriveMins > 0) {
        durationMinutes = totalDriveMins;
      }
    }

    return {
      sessionId: session.id,
      candidateId,
      roleTemplateId: session.roleTemplateId,
      roleTemplateName: session.roleTemplate.roleName,
      durationMinutes,
      cvMode:
        session.cvMode as unknown as import("@cd-recruit/shared-types").CvMode,
      proctoringConfig: (drive?.moduleConfig as any)?.proctoringConfig || null,
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

    if (questionId === "ai-prompting-dynamic") {
      const response = await this.prisma.moduleResponse.findUnique({
        where: {
          sessionId_questionId: {
            sessionId,
            questionId,
          },
        },
      });
      return {
        questionId,
        roleTemplateId: session.roleTemplateId,
        content: {
          title: "AI Prompting Challenge",
          prompt: "Engage in conversational problem solving with the AI assistant.",
        },
        response: response
          ? {
              responsePayload: response.responsePayload,
              isDraft: response.isDraft,
              timeSpentSeconds: response.timeSpentSeconds,
            }
          : null,
      };
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

    if (moduleType === "NOSQL") {
      const { expectedOperation: _eo, ...safe } = c;
      return safe;
    }

    if (moduleType === "CODING" || moduleType === "DEBUGGING") {
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

    // Verify session is active (not submitted/closed)
    if ([SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED, SessionStatus.CLOSED, SessionStatus.ABANDONED].includes(session.status as any)) {
      throw new ConflictException({
        code: "SESSION_CLOSED",
        message: "Cannot upload baseline selfie for a closed assessment session.",
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

  async verifyIdentity(
    sessionId: string,
    file: { buffer: Buffer; originalname: string },
  ): Promise<{
    status: "no_id_proof_on_file" | "verified" | "not_verified";
    matched: boolean | null;
    distance: number | null;
    threshold: number | null;
  }> {
    if (!file || !file.buffer) {
      throw new BadRequestException("No selfie image provided in request");
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const candidate = session.candidate;
    if (!candidate || !candidate.idProofEmbedding) {
      this.logger.log(
        `Session ${sessionId} has no ID proof embedding on file for candidate ${candidate?.id}`,
      );
      return {
        status: "no_id_proof_on_file",
        matched: null,
        distance: null,
        threshold: null,
      };
    }

    const embedding = candidate.idProofEmbedding as unknown as number[];
    const result = await this.faceVerifyClient.verify(
      file.buffer,
      file.originalname,
      embedding,
    );

    if (result.matched) {
      await this.prisma.candidate.update({
        where: { id: candidate.id },
        data: { idVerifiedAt: new Date() },
      });
      return {
        status: "verified",
        matched: true,
        distance: result.distance,
        threshold: result.threshold,
      };
    }

    return {
      status: "not_verified",
      matched: false,
      distance: result.distance,
      threshold: result.threshold,
    };
  }

  async flagAndContinueIdentity(
    sessionId: string,
  ): Promise<{ status: string; sessionId: string }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    await this.prisma.integrityFlag.create({
      data: {
        sessionId: session.id,
        category: "IDENTITY_MISMATCH",
        severity: "HIGH",
        confidence: 1.0,
        flaggedAt: new Date(),
      },
    });

    return { status: "flagged", sessionId };
  }

  private async createNoIdProofFlag(sessionId: string): Promise<void> {
    await this.prisma.integrityFlag.create({
      data: {
        sessionId,
        category: "NO_ID_PROOF_ON_FILE",
        severity: "MEDIUM",
        confidence: 1.0,
        flaggedAt: new Date(),
      },
    });
  }
}

