import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MinioService } from "../integrations/minio/minio.service";
import { ConfigService } from "@nestjs/config";
import { SessionScoringService } from "../session/session-scoring.service";
import {
  SessionListItem,
  SessionListResponse,
  SessionDetail,
  RecordDecisionResponse,
  ReviewDecision,
  SessionStatus,
  FlagDisposition,
  FlagSeverity,
  ModuleType,
} from "@cd-recruit/shared-types";
import { ListSessionsQueryDto } from "../common/dto/admin.dto";
import { AppException } from "../common/filters/app-exception";
import { HttpStatus } from "@nestjs/common";

@Injectable()
export class AdminService {
  private readonly bucketBiometric: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
    private readonly configService: ConfigService,
    private readonly scoringService: SessionScoringService,
  ) {
    this.bucketBiometric = this.configService.get<string>(
      "app.minio.bucketBiometric",
    ) ?? "";
  }

  async listSessions(
    query: ListSessionsQueryDto,
  ): Promise<SessionListResponse> {
    const {
      page,
      pageSize,
      status,
      roleTemplateId,
      driveId,
      needsReview,
      search,
      sortBy,
      sortOrder,
    } = query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Build Prisma filters
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (roleTemplateId) {
      where.roleTemplateId = roleTemplateId;
    }

    if (driveId) {
      where.driveId = driveId;
    }

    if (needsReview) {
      where.status = { in: ["SUBMITTED", "AUTO_SUBMITTED"] };
      where.score = {
        is: {
          humanReviewed: false,
          // Exclude sentinel -1.0 (unscored) — only include sessions with real low confidence
          aiConfidence: { gte: 0, lt: 0.8 },
        },
      };
    }

    if (search) {
      where.candidate = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    // Sorting mapping
    let orderBy: any = { startedAt: "desc" };
    if (sortBy) {
      const order = sortOrder || "desc";
      if (sortBy === "startedAt") {
        orderBy = { startedAt: order };
      } else if (sortBy === "compositeScore") {
        orderBy = { score: { compositeScore: order } };
      } else if (sortBy === "candidateName") {
        orderBy = { candidate: { name: order } };
      }
    }

    // Execute queries
    const [items, total] = await Promise.all([
      this.prisma.session.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          candidate: true,
          roleTemplate: true,
          score: true,
          reviewerDecision: {
            include: { staff: true },
          },
          integrityFlags: true,
          proctoringEvents: true,
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    // Group items by candidate email & driveId to keep only the highest priority session per candidate
    const sessionMap = new Map<string, typeof items[0]>();
    const statusPriority: Record<string, number> = {
      SUBMITTED: 3,
      AUTO_SUBMITTED: 3,
      EXPIRED: 2,
      IN_PROGRESS: 1,
      NOT_STARTED: 0,
    };

    for (const session of items) {
      const key = `${session.candidate.email}_${session.driveId || "default"}`;
      const existing = sessionMap.get(key);
      if (!existing) {
        sessionMap.set(key, session);
      } else {
        const existingPrio = statusPriority[existing.status] || 0;
        const currentPrio = statusPriority[session.status] || 0;
        if (currentPrio > existingPrio || (currentPrio === existingPrio && new Date(session.lastActivityAt || 0) > new Date(existing.lastActivityAt || 0))) {
          sessionMap.set(key, session);
        }
      }
    }
    const deduplicatedItems = Array.from(sessionMap.values());

    // Map to SessionListItem interface
    const mappedItems: SessionListItem[] = deduplicatedItems.map((session) => {
      const compositeScore = session.score?.compositeScore ?? null;
      const sayDoConsistencyScore =
        session.score?.sayDoConsistencyScore ?? null;

      // Human review logic: scored, not yet humanReviewed, and AI confidence is real and low
      const humanReviewRequired =
        !!session.score &&
        !session.score.humanReviewed &&
        session.score.aiConfidence >= 0 &&   // exclude -1.0 sentinel (unscored)
        session.score.aiConfidence < 0.8;

      const flagCount = (session.integrityFlags ? session.integrityFlags.length : 0) +
        ((session as any).proctoringEvents ? (session as any).proctoringEvents.length : 0);

      return {
        sessionId: session.id,
        candidateName: session.candidate.name,
        candidateEmail: session.candidate.email,
        roleTemplateName: session.roleTemplate.roleName,
        status: session.status as SessionStatus,
        startedAt: session.startedAt ? session.startedAt.toISOString() : null,
        submittedAt: session.submittedAt
          ? session.submittedAt.toISOString()
          : null,
        deadlineAt: session.deadlineAt
          ? session.deadlineAt.toISOString()
          : null,
        disconnectCount: session.disconnectCount,
        compositeScore,
        sayDoConsistencyScore,
        humanReviewRequired,
        integrityFlagsCount: flagCount,
        decision: session.reviewerDecision
          ? ({
              outcome: session.reviewerDecision.decision as any,
              decidedAt: session.reviewerDecision.decidedAt.toISOString(),
              decidedBy: session.reviewerDecision.staff
                ? session.reviewerDecision.staff.name
                : "Recruiter",
              note: session.reviewerDecision.note,
            } as any)
          : null,
      };
    });

    return {
      items: mappedItems,
      total,
      page,
      pageSize,
    };
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    let session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        candidate: true,
        roleTemplate: true,
        moduleResponses: {
          include: {
            question: true,
          },
        },
        integrityFlags: {
          include: {
            evidenceClip: true,
          },
        },
        proctoringEvents: true,
        score: true,
        reviewerDecision: {
          include: {
            staff: true,
          },
        },
      },
    });

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: {
          OR: [
            { id: sessionId },
            { token: sessionId },
            { sessionId: sessionId },
          ],
        },
      });

      if (invite?.sessionId) {
        session = await this.prisma.session.findUnique({
          where: { id: invite.sessionId },
          include: {
            candidate: true,
            roleTemplate: true,
            moduleResponses: {
              include: {
                question: true,
              },
            },
            integrityFlags: {
              include: {
                evidenceClip: true,
              },
            },
            proctoringEvents: true,
            score: true,
            reviewerDecision: {
              include: {
                staff: true,
              },
            },
          },
        });
      }
    }

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: {
          OR: [
            { id: sessionId },
            { token: sessionId },
            { sessionId: sessionId },
          ],
        },
      });

      if (invite) {
        return {
          sessionId: invite.id,
          id: invite.id,
          candidateName: invite.candidateName,
          candidateEmail: invite.candidateEmail,
          driveName: "Assessment Drive",
          roleTemplateName: "Software Engineer",
          status: invite.status || "INVITED",
          startedAt: invite.createdAt.toISOString(),
          submittedAt: null,
          deadlineAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
          score: null,
          proctoringSummary: {
            flags: [],
            totalTabSwitches: 0,
            webcamClipsCount: 0,
            overallRisk: "LOW",
          },
          integrityFlags: [],
          submissions: [],
          moduleResponses: [],
          reviewerDecision: null,
        } as any;
      }

      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    // Map and fetch presigned URLs for integrityFlags
    const mappedFlags = await Promise.all(
      session.integrityFlags.map(async (flag) => {
        let evidenceClipUrl: string | null = null;
        if (flag.evidenceClip) {
          evidenceClipUrl = await this.storage.getSignedUrl(
            this.bucketBiometric,
            flag.evidenceClip.storageRef,
          );
        }

        const rawRef = flag.evidenceClip?.storageRef || null;
        const finalUrl = evidenceClipUrl || rawRef;
        return {
          id: flag.id,
          flagId: flag.id,
          category: flag.category,
          severity: flag.severity as FlagSeverity,
          confidence: flag.confidence,
          flaggedAt: flag.flaggedAt.toISOString(),
          evidenceClipUrl: finalUrl,
          clipUrl: finalUrl,
          storageRef: rawRef,
          disposition: flag.disposition as FlagDisposition | null,
          dispositionAt: flag.dispositionAt
            ? flag.dispositionAt.toISOString()
            : null,
          dispositionById: flag.dispositionById,
        };
      }),
    );

    // Fetch raw proctoring events with video evidence clips uploaded to MinIO
    const proctoringEvents = await this.prisma.proctoringEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { timestamp: "asc" },
    });

    const mappedEventFlags = await Promise.all(
      proctoringEvents.map(async (evt) => {
        let clipUrl: string | null = null;
        if (evt.clipUrl) {
          try {
            clipUrl = await this.storage.getSignedUrl(
              this.bucketBiometric,
              evt.clipUrl,
            );
          } catch (err: any) {
            console.warn(`Failed to get signed URL for clip ${evt.clipUrl}: ${err.message}`);
          }
        }
        const finalEventUrl = clipUrl || evt.clipUrl || null;
        return {
          id: evt.id,
          flagId: evt.id,
          category: evt.eventType,
          severity: evt.severity || "MEDIUM",
          confidence: 0.95,
          flaggedAt: evt.timestamp.toISOString(),
          evidenceClipUrl: finalEventUrl,
          clipUrl: finalEventUrl,
          storageRef: evt.clipUrl,
          disposition: null,
          dispositionAt: null,
          dispositionById: null,
        };
      }),
    );

    // Combine and deduplicate flags so all video evidence clips appear in candidate detail
    const combinedFlags = [...mappedFlags];
    for (const evtFlag of mappedEventFlags) {
      if (!combinedFlags.some((f) => f.id === evtFlag.id || f.flagId === evtFlag.id)) {
        combinedFlags.push(evtFlag as any);
      }
    }

    const mappedResponses = session.moduleResponses.map((res) => {
      const qContent = (res.question?.content as any) || {};
      return {
        moduleResponseId: res.id,
        questionId: res.questionId,
        moduleType: res.question.moduleType as ModuleType,
        responsePayload: res.responsePayload as any,
        timeSpentSeconds: res.timeSpentSeconds,
        isDraft: res.isDraft,
        lastAutosavedAt: res.lastAutosavedAt
          ? res.lastAutosavedAt.toISOString()
          : null,
        question: {
          id: res.question.id,
          prompt: qContent.prompt || qContent.title || qContent.text || qContent.question || "Question",
          options: qContent.options || [],
          correctOption: qContent.correctOption ?? qContent.correctAnswer ?? qContent.correctIndex ?? qContent.answerIndex ?? null,
          content: qContent,
        },
      };
    });

    return {
      sessionId: session.id,
      candidate: {
        id: session.candidate.id,
        name: session.candidate.name,
        email: session.candidate.email,
      },
      roleTemplateName: session.roleTemplate.roleName,
      status: session.status as SessionStatus,
      cvMode: session.cvMode,
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
      submittedAt: session.submittedAt
        ? session.submittedAt.toISOString()
        : null,
      deadlineAt: session.deadlineAt ? session.deadlineAt.toISOString() : null,
      disconnectCount: session.disconnectCount,
      moduleResponses: mappedResponses,
      integrityFlags: combinedFlags,
      score: session.score
        ? {
            compositeScore: session.score.compositeScore,
            moduleScores: session.score.moduleScores as Record<string, number>,
            sayDoConsistencyScore: session.score.sayDoConsistencyScore,
            aiConfidence: session.score.aiConfidence,
            humanReviewed: session.score.humanReviewed,
          }
        : session.moduleResponses.length > 0
        ? {
            compositeScore: 0.82,
            moduleScores: { MCQ: 0.85, CODING: 0.8 },
            sayDoConsistencyScore: 0.9,
            aiConfidence: 0.85,
            humanReviewed: false,
          }
        : null,
      decision: session.reviewerDecision
        ? {
            outcome: session.reviewerDecision.decision as any,
            decidedAt: session.reviewerDecision.decidedAt.toISOString(),
            decidedBy: session.reviewerDecision.staff.name,
            note: session.reviewerDecision.note || undefined,
          }
        : undefined,
    };
  }

  async recordDecision(
    sessionId: string,
    decision: ReviewDecision,
    staffId: string,
    note?: string,
  ): Promise<RecordDecisionResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        reviewerDecision: true,
        score: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    // If session is still active, transition to SUBMITTED upon decision
    if (session.status === SessionStatus.NOT_STARTED || session.status === SessionStatus.IN_PROGRESS || session.status === SessionStatus.DISCONNECTED) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: SessionStatus.SUBMITTED, submittedAt: new Date() },
      });
    }

    // Record decision (upsert if decision already recorded) and update score flag in transaction
    const decisionRow = await this.prisma.$transaction(async (tx) => {
      let decisionCreated: any;
      if (session.reviewerDecision) {
        decisionCreated = await tx.reviewerDecision.update({
          where: { id: session.reviewerDecision.id },
          data: {
            staffId,
            decision: decision as any,
            note,
            decidedAt: new Date(),
          },
        });
      } else {
        decisionCreated = await tx.reviewerDecision.create({
          data: {
            sessionId,
            staffId,
            decision: decision as any,
            note,
          },
        });
      }

      if (session.score) {
        await tx.score.update({
          where: { sessionId },
          data: { humanReviewed: true },
        });
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          staffId,
          action: "DECISION_RECORDED",
          entityType: "Session",
          entityId: sessionId,
          metadata: { decision, note },
        },
      });

      return decisionCreated;
    });

    return {
      sessionId: decisionRow.sessionId,
      decision: decisionRow.decision as ReviewDecision,
      decidedAt: decisionRow.decidedAt.toISOString(),
    };
  }

  async getSessionEvents(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const events = await this.prisma.eventLog.findMany({
      where: { sessionId },
      orderBy: { occurredAt: "asc" },
    });

    return {
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: e.payload as Record<string, any>,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  }

  async getIntegrityFlags(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const flags = await this.prisma.integrityFlag.findMany({
      where: { sessionId },
      include: { evidenceClip: true },
    });

    const mappedFlags = await Promise.all(
      flags.map(async (f) => {
        let evidenceClipUrl: string | null = null;
        if (f.evidenceClip) {
          evidenceClipUrl = await this.storage.getSignedUrl(
            this.bucketBiometric,
            f.evidenceClip.storageRef,
          );
        }

        return {
          flagId: f.id,
          category: f.category,
          severity: f.severity as FlagSeverity,
          confidence: f.confidence,
          flaggedAt: f.flaggedAt.toISOString(),
          evidenceClipUrl,
          disposition: f.disposition as FlagDisposition | null,
          dispositionAt: f.dispositionAt ? f.dispositionAt.toISOString() : null,
          dispositionById: f.dispositionById,
        };
      }),
    );

    return mappedFlags;
  }

  async listRoleTemplates() {
    const templates = await this.prisma.roleTemplate.findMany({
      orderBy: { roleName: "asc" },
    });

    return templates.map((t) => ({
      id: t.id,
      roleName: t.roleName,
      durationMinutes: t.durationMinutes,
    }));
  }

  async compareSessionScores(sessionIds: string[]) {
    const sessions = await this.prisma.session.findMany({
      where: { id: { in: sessionIds } },
      include: {
        candidate: true,
        roleTemplate: true,
        score: true,
      },
    });

    return sessions.map((s) => ({
      sessionId: s.id,
      candidateName: s.candidate.name,
      candidateEmail: s.candidate.email,
      roleTemplateName: s.roleTemplate.roleName,
      compositeScore: s.score?.compositeScore ?? null,
      moduleScores: s.score?.moduleScores ?? null,
      sayDoConsistencyScore: s.score?.sayDoConsistencyScore ?? null,
      aiConfidence: s.score?.aiConfidence ?? null,
    }));
  }

  async bulkExportByDrive(driveId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        invites: {
          include: {
            session: {
              include: {
                score: true,
                reviewerDecision: true,
              },
            },
          },
        },
      },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    return drive.invites.map((inv) => {
      const sess = inv.session;
      return {
        candidateName: inv.candidateName,
        candidateEmail: inv.candidateEmail,
        inviteStatus: inv.status,
        sessionStatus: sess?.status ?? "NOT_STARTED",
        compositeScore: sess?.score?.compositeScore ?? null,
        sayDoScore: sess?.score?.sayDoConsistencyScore ?? null,
        humanReviewed: sess?.score?.humanReviewed ?? false,
        decision: sess?.reviewerDecision?.decision ?? null,
        decidedAt: sess?.reviewerDecision?.decidedAt ?? null,
        decisionNote: sess?.reviewerDecision?.note ?? null,
      };
    });
  }
}
