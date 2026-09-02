import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
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
import { FaceVerifyOnnxService } from "@app/integrations/face-verify-onnx/face-verify-onnx.service";
import { AadhaarOcrService } from "../integrations/ocr/aadhaar-ocr.service";
import { QueueProviderPort } from "@app/queue/queue-provider.port";
import { SandboxOrchestratorService } from "../simulation/sandbox/sandbox-orchestrator.service";
import {
  StartSessionResponse,
  ResumeSessionResponse,
  HeartbeatResponse,
  CloseSessionResponse,
} from "@cd-recruit/shared-types";
import { DriveShufflerService } from "../drive/drive-shuffler.service";
import { SessionLifecycleService } from "./session-lifecycle.service";
import { SessionStateMachine } from "./session-state-machine";
import { SessionScoringService } from "./session-scoring.service";
import { SessionStatusPort } from "@app/common/ports/session-status.port";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Prisma session with its role template — used for response building. */
type SessionWithTemplate = Session & {
  roleTemplate: { roleName: string; durationMinutes: number };
};

const driveShuffler = new DriveShufflerService();

export function resolveSeniorityTag(roleTemplate: any): string {
  if (!roleTemplate) {
    throw new UnprocessableEntityException("No role template found to resolve seniority");
  }
  if (roleTemplate.level === "FRESHER" || roleTemplate.category === "FRESHER") {
    return "fresher";
  }
  if (roleTemplate.level === "EXPERIENCED" || roleTemplate.category === "EXPERIENCED") {
    const expLvl = roleTemplate.experiencedLevel || roleTemplate.experienceTier;
    if (expLvl === "L1" || expLvl === "2-5") return "l1";
    if (expLvl === "L2" || expLvl === "6-10") return "l2";
    if (expLvl === "L3" || expLvl === "11-15") return "l3";
    return "l1";
  }
  return "fresher";
}

export const TIME_MATRIX: Record<string, Record<string, number>> = {
  MCQ: { EASY: 1, MEDIUM: 2, HARD: 3 },
  SQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
  CODING: { EASY: 6, MEDIUM: 12, HARD: 22 },
  DEBUGGING: { EASY: 5, MEDIUM: 10, HARD: 18 },
  TEST_SCENARIOS: { EASY: 3, MEDIUM: 6, HARD: 12 },
  AI_PROMPTING: { EASY: 4, MEDIUM: 7, HARD: 12 },
  SIMULATION: { EASY: 6, MEDIUM: 12, HARD: 22 },
  NOSQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
};

const SENIORITY_RATIOS: Record<string, { easy: number; medium: number; hard: number }> = {
  fresher: { easy: 0.50, medium: 0.40, hard: 0.10 },
  l1: { easy: 0.30, medium: 0.50, hard: 0.20 },
  l2: { easy: 0.15, medium: 0.50, hard: 0.35 },
  l3: { easy: 0.10, medium: 0.45, hard: 0.45 },
};

export function getRequiredQuestionCount(
  moduleType: string,
  weight: number,
  totalDuration: number,
  seniority: string,
): number {
  const ratios = SENIORITY_RATIOS[seniority] || SENIORITY_RATIOS.fresher;
  const times = TIME_MATRIX[moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
  const avgTime =
    ratios.easy * times.EASY +
    ratios.medium * times.MEDIUM +
    ratios.hard * times.HARD;
  const timeBudget = totalDuration * (weight / 100);

  return Math.max(1, Math.round(timeBudget / (avgTime || 1)));
}

export function getEstimatedModuleDuration(
  moduleType: string,
  dist: { easy: number; medium: number; hard: number },
): number {
  const times = TIME_MATRIX[moduleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
  return (
    (dist.easy || 0) * times.EASY +
    (dist.medium || 0) * times.MEDIUM +
    (dist.hard || 0) * times.HARD
  );
}

export function getDefaultDifficultyDistribution(
  requiredCount: number,
  seniority: string,
): { easy: number; medium: number; hard: number } {
  const ratios = SENIORITY_RATIOS[seniority] || SENIORITY_RATIOS.fresher;
  let easy = Math.round(requiredCount * ratios.easy);
  let medium = Math.round(requiredCount * ratios.medium);
  let hard = requiredCount - easy - medium;

  if (hard < 0) {
    medium += hard;
    hard = 0;
  }
  if (medium < 0) {
    easy += medium;
    medium = 0;
  }
  return { easy, medium, hard };
}

function allocateQuestions(
  pool: any[],
  moduleConfig: Record<
    string,
    {
      enabled: boolean;
      weight: number;
      requiredCount?: number;
      difficultyDistribution?: { easy: number; medium: number; hard: number };
    }
  >,
  totalDuration: number,
  resolvedTag: string,
): any[] {
  const selected: any[] = [];
  const activeModules = Object.keys(moduleConfig).filter(
    (mod) => moduleConfig[mod].enabled && moduleConfig[mod].weight > 0
  );

  for (const mod of activeModules) {
    const conf = moduleConfig[mod];
    const reqCount =
      conf.requiredCount !== undefined
        ? conf.requiredCount
        : getRequiredQuestionCount(mod, conf.weight, totalDuration, resolvedTag);
    const dist =
      conf.difficultyDistribution !== undefined
        ? conf.difficultyDistribution
        : getDefaultDifficultyDistribution(reqCount, resolvedTag);

    const modPool = pool.filter((q) => q.moduleType === mod);
    const easyPool = modPool.filter(
      (q) => (q.difficulty || "medium").toUpperCase() === "EASY"
    );
    const mediumPool = modPool.filter(
      (q) => (q.difficulty || "medium").toUpperCase() === "MEDIUM"
    );
    const hardPool = modPool.filter(
      (q) => (q.difficulty || "medium").toUpperCase() === "HARD"
    );

    const shuffledEasy = [...easyPool].sort(() => Math.random() - 0.5);
    const shuffledMedium = [...mediumPool].sort(() => Math.random() - 0.5);
    const shuffledHard = [...hardPool].sort(() => Math.random() - 0.5);

    const easyCount = Math.min(dist.easy, shuffledEasy.length);
    const mediumCount = Math.min(dist.medium, shuffledMedium.length);
    const hardCount = Math.min(dist.hard, shuffledHard.length);

    for (let i = 0; i < easyCount; i++) selected.push(shuffledEasy[i]);
    for (let i = 0; i < mediumCount; i++) selected.push(shuffledMedium[i]);
    for (let i = 0; i < hardCount; i++) selected.push(shuffledHard[i]);
  }

  return selected;
}

export async function buildQuestionList(
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

    const driveObj = driveId
      ? await prisma.drive.findUnique({ where: { id: driveId } })
      : null;

    const effectiveRoleTemplateId =
      session.roleTemplateId || driveObj?.roleTemplateId;

    const driveModuleConfig = (driveObj?.moduleConfig as Record<
      string,
      { enabled?: boolean; weight?: number; durationMinutes?: number }
    >) || {};

    // 1. Check Drive Questions first (exact questions curated/configured for this Drive)
    if (driveId) {
      const driveQuestions = await prisma.driveQuestion.findMany({
        where: { driveId },
        include: { question: true },
        orderBy: [
          { moduleType: "asc" },
          { question: { id: "asc" } },
        ],
      });

      if (driveQuestions && driveQuestions.length > 0) {
        // Only include questions for enabled modules
        const activeDriveQuestions = driveQuestions.filter((dq) => {
          const isDebug =
            dq.moduleType === "DEBUGGING" ||
            dq.question?.moduleType === "DEBUGGING" ||
            (Array.isArray(dq.question?.tags) && dq.question.tags.includes("debugging"));
          const modType = isDebug ? "DEBUGGING" : dq.moduleType;
          return driveModuleConfig[modType] !== undefined
            ? driveModuleConfig[modType].enabled
            : true;
        });

        if (activeDriveQuestions.length > 0) {
          const shuffled = driveShuffler.shuffleQuestionsForCandidate(
            activeDriveQuestions as any,
            session.candidateId,
            driveId,
          );
          const resultList = shuffled.map((q: any) => {
            const matchingDq = activeDriveQuestions.find((dq) => dq.questionId === q.questionId);
            const rawQ = matchingDq?.question || q;
            const tags = rawQ.tags || [];
            const prompt = typeof rawQ.content?.prompt === "string" ? rawQ.content.prompt.toLowerCase() : "";
            const isDebug =
              rawQ.moduleType === "DEBUGGING" ||
              q.moduleType === "DEBUGGING" ||
              tags.includes("debugging") ||
              prompt.includes("debugging challenge");
            const effectiveModuleType = isDebug ? "DEBUGGING" : (q.moduleType || rawQ.moduleType);
            return {
              ...q,
              questionId: q.questionId || rawQ.id,
              moduleType: effectiveModuleType,
              content: rawQ.content || q.content || {},
              difficulty: rawQ.difficulty || q.difficulty || "medium",
            };
          });

          if (driveModuleConfig.AI_PROMPTING?.enabled) {
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
          return resultList;
        }
      }
    }

    // 2. Check candidate's calibrated RoleTemplate questions (tier-specific fairness fallback)
    if (effectiveRoleTemplateId) {
      const templateQuestions = await prisma.roleTemplateQuestion.findMany({
        where: { roleTemplateId: effectiveRoleTemplateId },
        include: { question: true },
        orderBy: [{ orderIndex: "asc" }, { moduleType: "asc" }],
      });

      if (templateQuestions && templateQuestions.length > 0) {
        // Filter by driveModuleConfig if present
        const activeTemplateQuestions = templateQuestions.filter((tq) => {
          const isDebug =
            tq.moduleType === "DEBUGGING" ||
            tq.question?.moduleType === "DEBUGGING" ||
            (Array.isArray(tq.question?.tags) && tq.question.tags.includes("debugging"));
          const modType = isDebug ? "DEBUGGING" : tq.moduleType;
          return driveModuleConfig[modType] !== undefined
            ? driveModuleConfig[modType].enabled
            : true;
        });

        if (activeTemplateQuestions.length > 0) {
          const shuffled = driveShuffler.shuffleQuestionsForCandidate(
            activeTemplateQuestions as any,
            session.candidateId,
            effectiveRoleTemplateId,
          );
          const resultList = shuffled.map((q: any) => {
            const matchingTq = activeTemplateQuestions.find((tq) => tq.questionId === q.questionId);
            const rawQ = matchingTq?.question || q;
            const tags = rawQ.tags || [];
            const prompt = typeof rawQ.content?.prompt === "string" ? rawQ.content.prompt.toLowerCase() : "";
            const isDebug =
              rawQ.moduleType === "DEBUGGING" ||
              q.moduleType === "DEBUGGING" ||
              tags.includes("debugging") ||
              prompt.includes("debugging challenge");
            const effectiveModuleType = isDebug ? "DEBUGGING" : (q.moduleType || rawQ.moduleType);
            return {
              ...q,
              questionId: q.questionId || rawQ.id,
              moduleType: effectiveModuleType,
              content: rawQ.content || q.content || {},
              difficulty: rawQ.difficulty || q.difficulty || "medium",
            };
          });

          if (driveModuleConfig.AI_PROMPTING?.enabled) {
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
          return resultList;
        }
      }
    }

    // 3. Dynamic Department & Seniority Allocation from Question Bank for the target RoleTemplate
    if (effectiveRoleTemplateId) {
      const template = await prisma.roleTemplate.findUnique({
        where: { id: effectiveRoleTemplateId },
      });

      if (template) {
        const dept = template.department || "SOFTWARE_ENGINEERING";
        const tier = template.experienceTier || (template.category === "FRESHER" ? "0-1" : "2-5");
        const seniorityTag = tier === "0-1" ? "fresher" : tier === "2-5" ? "l1" : tier === "6-10" ? "l2" : "l3";
        const durationMinutes = template.durationMinutes || 60;

        const preset = (template.weightingPreset as Record<string, number>) || {
          MCQ: 15,
          SQL: 15,
          CODING: 20,
          AI_PROMPTING: 20,
          SIMULATION: 15,
        };

        const configMap: Record<
          string,
          { enabled: boolean; weight: number }
        > = {};
        for (const [mod, wt] of Object.entries(preset)) {
          const driveConf = driveModuleConfig[mod];
          const enabled =
            driveConf !== undefined ? !!driveConf.enabled : Number(wt) > 0;
          const weight =
            driveConf?.weight !== undefined
              ? Number(driveConf.weight)
              : Number(wt) || 0;
          configMap[mod] = { enabled, weight };
        }

        const questionPool = await prisma.question.findMany({
          where: {
            status: "PUBLISHED",
            OR: [
              { role: { equals: dept, mode: "insensitive" } },
              { tags: { has: seniorityTag } },
              { tags: { hasSome: [dept.toLowerCase(), seniorityTag] } },
              { role: "General" },
            ],
          },
        });

        if (questionPool.length > 0) {
          const allocated = allocateQuestions(
            questionPool,
            configMap,
            durationMinutes,
            seniorityTag,
          );
          if (allocated.length > 0) {
            const shuffled = driveShuffler.shuffleQuestionsForCandidate(
              allocated as any,
              session.candidateId,
              effectiveRoleTemplateId,
            );
            return shuffled.map((q: any) => ({
              questionId: q.id || q.questionId,
              moduleType: q.moduleType,
              content: q.content || {},
              difficulty: q.difficulty || "medium",
            }));
          }
        }
      }
    }

    // If no questions are mapped or could be allocated, return empty array instead of random unmapped fallback
    return [];
  } catch (err) {
    console.error("[buildQuestionList] Error building questions:", err);
    throw err;
  }
}

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
    private readonly faceVerifyOnnxService: FaceVerifyOnnxService,
    private readonly aadhaarOcrService: AadhaarOcrService,
  ) {
    this.graceWindowSeconds = this.config.get("graceWindowSeconds", {
      infer: true,
    });
    this.maxDisconnectCount = this.config.get("maxDisconnectCount", {
      infer: true,
    });
    this.bucketBiometric = this.config.get<string>("app.minio.bucketBiometric" as any) ?? "cd-recruit-biometric";
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

    // 3.5 Check if candidate already has a SUBMITTED or COMPLETED session for this drive
    const submittedSession = await this.prisma.session.findFirst({
      where: {
        candidateId: candidateRecord.id,
        driveId: payload.driveId || undefined,
        status: { in: [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED, SessionStatus.CLOSED] },
      },
      orderBy: { submittedAt: "desc" },
      include: { roleTemplate: true },
    });

    if (submittedSession) {
      this.logger.warn(`Candidate ${candidateRecord.email} already completed session ${submittedSession.id}.`);
      return await this.buildStartResponse(
        submittedSession as SessionWithTemplate,
        candidateRecord.id,
      );
    }

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

    // Create 3 duration-proportional IdentityCapture records (30%, 60%, 90% split)
    const splitRatios = [0.30, 0.60, 0.90];
    const durationMs = durationMinutes * 60 * 1000;

    try {
      await this.prisma.identityCapture.deleteMany({
        where: { sessionId },
      });

      for (let i = 0; i < splitRatios.length; i++) {
        const windowIndex = i + 1;
        const scheduledOffsetMs = Math.round(durationMs * splitRatios[i]);
        const scheduledAt = new Date(now.getTime() + scheduledOffsetMs);

        await this.prisma.identityCapture.create({
          data: {
            sessionId,
            windowIndex,
            scheduledAt,
            status: "PENDING",
          },
        });
        this.logger.log(
          `[IdentityCapture] DB_RECORD_CREATED: sessionId=${sessionId}, windowIndex=${windowIndex}, scheduledAt=${scheduledAt.toISOString()} (${(scheduledOffsetMs / 1000 / 60).toFixed(1)}m from start)`,
        );
      }
    } catch (capErr: any) {
      this.logger.warn(`Failed to schedule identity captures for session ${sessionId}: ${capErr.message}`);
    }

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

    // Calculate real module scores and composite score across all modules upon submission
    try {
      await this.scoringService.computeSessionScores(sessionId);
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
      await this.scoringService.computeSessionScores(sessionId);
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
   * Upload candidate ID proof to MinIO, extract ONNX embedding, and update Candidate record
   */
  async uploadIdProof(sessionId: string, base64Image: string): Promise<{ ok: boolean; embeddingCreated: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });

    if (!session) {
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found.",
      });
    }

    const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new UnprocessableEntityException({
        code: "INVALID_IMAGE_FORMAT",
        message: "Invalid image data format. Expected base64 data URL.",
      });
    }

    const imageBuffer = Buffer.from(matches[2], "base64");
    const sessionFolder = `sessions/${sessionId}`;
    const candidateFolder = `candidates/${session.candidateId}`;
    const objectKey = `${sessionFolder}/id-proof.jpg`;
    const candidateKey = `${candidateFolder}/id-proof.jpg`;

    // Upload to MinIO (both per-session and per-candidate path)
    const uploaded = await this.minio.putObject(
      this.bucketBiometric,
      objectKey,
      imageBuffer,
      { "Content-Type": "image/jpeg" }
    );
    await this.minio.putObject(
      this.bucketBiometric,
      candidateKey,
      imageBuffer,
      { "Content-Type": "image/jpeg" }
    );

    if (!uploaded) {
      throw new UnprocessableEntityException({
        code: "UPLOAD_FAILED",
        message: "Failed to upload ID proof to MinIO storage.",
      });
    }

    let embedding: number[] | null = null;
    let modelName: string = "ArcFace-ONNX-ResNet50";

    try {
      const enrollResult = await this.faceVerifyOnnxService.enroll(imageBuffer, `id-proof-${sessionId}.jpg`);
      embedding = enrollResult.embedding;
      modelName = enrollResult.model;
    } catch (err: any) {
      this.logger.warn(`Could not extract ONNX embedding for candidate ID proof: ${err.message}`);
    }

    // Update Session DB
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        idProofRef: objectKey,
        idProofEmbedding: embedding ? (embedding as any) : undefined,
      },
    });

    // Update Candidate DB
    await this.prisma.candidate.update({
      where: { id: session.candidateId },
      data: {
        idProofRef: candidateKey,
        idProofEmbedding: embedding ? (embedding as any) : undefined,
        idProofModel: modelName,
      },
    });

    // Non-blocking background Aadhaar OCR processing (does not slow down candidate response)
    setImmediate(async () => {
      try {
        const ocrRes = await this.aadhaarOcrService.parseAadhaar(imageBuffer);
        if (ocrRes) {
          await this.prisma.candidate.update({
            where: { id: session.candidateId },
            data: {
              idProofExtractedName: ocrRes.name,
              idProofOcrRaw: ocrRes.rawText,
              ocrConfidence: ocrRes.confidence,
            },
          });
        }
      } catch (ocrErr: any) {
        this.logger.warn(`Async Aadhaar OCR background processing failed for session ${sessionId}: ${ocrErr.message}`);
      }
    });

    return { ok: true, embeddingCreated: !!embedding };
  }

  /**
   * Upload baseline selfie to MinIO, extract ONNX embedding, and update Session/Candidate records
   */
  async uploadSelfie(sessionId: string, base64Image: string): Promise<{ ok: boolean; verified?: boolean; enrolled?: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
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
    const sessionFolder = `sessions/${sessionId}`;
    const candidateFolder = `candidates/${session.candidateId}`;
    const objectKey = `${sessionFolder}/baseline-selfie.jpg`;
    const candidateKey = `${candidateFolder}/baseline-selfie.jpg`;

    // Upload to MinIO
    const uploaded = await this.minio.putObject(
      this.bucketBiometric,
      objectKey,
      imageBuffer,
      { "Content-Type": "image/jpeg" }
    );
    await this.minio.putObject(
      this.bucketBiometric,
      candidateKey,
      imageBuffer,
      { "Content-Type": "image/jpeg" }
    );

    if (!uploaded) {
      throw new UnprocessableEntityException({
        code: "UPLOAD_FAILED",
        message: "Failed to upload selfie to MinIO storage.",
      });
    }

    let selfieEmbedding: number[] | null = null;
    try {
      const enrollResult = await this.faceVerifyOnnxService.enroll(imageBuffer, `selfie-${sessionId}.jpg`);
      selfieEmbedding = enrollResult.embedding;
    } catch (err: any) {
      this.logger.warn(`Could not extract ONNX embedding for baseline selfie: ${err.message}`);
    }

    // Update DB Session & Candidate (store embeddings & MinIO refs only, no auto-verification)
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        baselineSelfieRef: objectKey,
        baselineSelfieEmbedding: selfieEmbedding ? (selfieEmbedding as any) : undefined,
      },
    });

    await this.prisma.candidate.update({
      where: { id: session.candidateId },
      data: {
        baselineSelfieRef: candidateKey,
        baselineSelfieEmbedding: selfieEmbedding ? (selfieEmbedding as any) : undefined,
      },
    });

    return { ok: true, enrolled: !!selfieEmbedding };
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
    const storedEmb = candidate?.idProofEmbedding as unknown as number[];

    if (!candidate || !storedEmb) {
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

    const result = await this.faceVerifyOnnxService.verify(
      file.buffer,
      file.originalname,
      storedEmb,
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

  /**
   * Save an in-test identity snapshot capture to MinIO and verify face embeddings against baseline selfie.
   */
  async saveIdentityCapture(
    sessionId: string,
    windowIndex: number,
    imageBase64: string,
  ) {
    this.logger.log(
      `[SessionService] SAVE_IDENTITY_CAPTURE_REQUESTED: sessionId=${sessionId}, windowIndex=${windowIndex}, payloadLength=${imageBase64?.length ?? 0}`,
    );

    if (!imageBase64 || typeof windowIndex !== "number") {
      throw new BadRequestException("Missing imageBase64 or windowIndex");
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(cleanBase64, "base64");

    const objectKey = `sessions/${sessionId}/identity-captures/window_${windowIndex}.jpg`;

    try {
      // 1. Upload snapshot to MinIO bucket
      await this.minio.putObject(
        this.bucketBiometric,
        objectKey,
        imageBuffer,
        { "Content-Type": "image/jpeg" },
      );
      this.logger.log(
        `[SessionService] MINIO_UPLOAD_SUCCESS: bucket=${this.bucketBiometric}, objectKey=${objectKey}, bytes=${imageBuffer.length}`,
      );

      // 2. Upsert IdentityCapture record in DB with status COMPLETED and imageRef
      const capture = await this.prisma.identityCapture.upsert({
        where: {
          sessionId_windowIndex: {
            sessionId,
            windowIndex,
          },
        },
        create: {
          sessionId,
          windowIndex,
          scheduledAt: new Date(),
          capturedAt: new Date(),
          status: "COMPLETED",
          imageRef: objectKey,
        },
        update: {
          capturedAt: new Date(),
          status: "COMPLETED",
          imageRef: objectKey,
        },
      });

      this.logger.log(
        `[SessionService] IDENTITY_CAPTURE_DB_UPDATED: windowIndex=${windowIndex}, status=COMPLETED, id=${capture.id}`,
      );

      return {
        ok: true,
        captureId: capture.id,
        imageRef: objectKey,
        matched: capture.matched,
        distance: capture.distance,
      };
    } catch (err: any) {
      this.logger.error(
        `[SessionService] SAVE_IDENTITY_CAPTURE_FAILED: windowIndex=${windowIndex}, error=${err.message}`,
        err.stack,
      );

      // Mark as FAILED in database
      await this.prisma.identityCapture.upsert({
        where: {
          sessionId_windowIndex: {
            sessionId,
            windowIndex,
          },
        },
        create: {
          sessionId,
          windowIndex,
          scheduledAt: new Date(),
          status: "FAILED",
        },
        update: {
          status: "FAILED",
        },
      }).catch((e) => this.logger.warn(`Failed to update FAILED status: ${e.message}`));

      throw new InternalServerErrorException(
        `Failed to save identity capture: ${err.message}`,
      );
    }
  }

  /**
   * Saves / mirrors candidate draft answers and cursor to cloud for cross-device recovery.
   */
  async saveDraftResponses(
    sessionId: string,
    payload: { draftResponses?: Record<string, any>; cursor?: { moduleIndex: number; questionIndex: number }; sentinel?: any },
  ) {
    const existing = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { simulationSnapshot: true },
    });
    if (!existing) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const currentSnapshot = (existing.simulationSnapshot as Record<string, any>) || {};
    const updatedSnapshot = {
      ...currentSnapshot,
      draftResponses: payload.draftResponses || currentSnapshot.draftResponses || {},
      cursor: payload.cursor || currentSnapshot.cursor || { moduleIndex: 0, questionIndex: 0 },
      sentinel: payload.sentinel || currentSnapshot.sentinel,
      lastSyncedAt: new Date().toISOString(),
    };

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        simulationSnapshot: updatedSnapshot,
        lastActivityAt: new Date(),
      },
    });

    return { ok: true, syncedAt: updatedSnapshot.lastSyncedAt };
  }

  /**
   * Retrieves candidate draft responses and cursor for cross-device hydration.
   */
  async getDraftResponses(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { simulationSnapshot: true, startedAt: true, status: true },
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found.`);
    }

    const snapshot = (session.simulationSnapshot as Record<string, any>) || {};
    return {
      ok: true,
      draftResponses: snapshot.draftResponses || {},
      cursor: snapshot.cursor || { moduleIndex: 0, questionIndex: 0 },
      lastSyncedAt: snapshot.lastSyncedAt || null,
      startedAt: session.startedAt,
      status: session.status,
    };
  }
}

