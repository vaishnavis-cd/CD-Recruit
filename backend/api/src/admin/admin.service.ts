import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStoragePort } from "../integrations/storage/object-storage.port";
import { ConfigService } from "@nestjs/config";
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
    private readonly storage: ObjectStoragePort,
    private readonly configService: ConfigService,
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
          reviewerDecision: true,
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    // Map to SessionListItem interface
    const mappedItems: SessionListItem[] = items.map((session) => {
      const compositeScore = session.score?.compositeScore ?? null;
      const sayDoConsistencyScore =
        session.score?.sayDoConsistencyScore ?? null;

      // Human review logic: scored, not yet humanReviewed, and AI confidence is real and low
      const humanReviewRequired =
        !!session.score &&
        !session.score.humanReviewed &&
        session.score.aiConfidence >= 0 &&   // exclude -1.0 sentinel (unscored)
        session.score.aiConfidence < 0.8;

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
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    // Map and fetch presigned URLs for evidence clips
    const mappedFlags = await Promise.all(
      session.integrityFlags.map(async (flag) => {
        let evidenceClipUrl: string | null = null;
        if (flag.evidenceClip) {
          evidenceClipUrl = await this.storage.getSignedUrl(
            this.bucketBiometric,
            flag.evidenceClip.storageRef,
          );
        }

        return {
          flagId: flag.id,
          category: flag.category,
          severity: flag.severity as FlagSeverity,
          confidence: flag.confidence,
          flaggedAt: flag.flaggedAt.toISOString(),
          evidenceClipUrl,
          disposition: flag.disposition as FlagDisposition | null,
          dispositionAt: flag.dispositionAt
            ? flag.dispositionAt.toISOString()
            : null,
          dispositionById: flag.dispositionById,
        };
      }),
    );

    const mappedResponses = session.moduleResponses.map((res) => ({
      moduleResponseId: res.id,
      questionId: res.questionId,
      moduleType: res.question.moduleType as ModuleType,
      responsePayload: res.responsePayload as any,
      timeSpentSeconds: res.timeSpentSeconds,
      isDraft: res.isDraft,
      lastAutosavedAt: res.lastAutosavedAt
        ? res.lastAutosavedAt.toISOString()
        : null,
    }));

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
      integrityFlags: mappedFlags,
      score: session.score
        ? {
            compositeScore: session.score.compositeScore,
            moduleScores: session.score.moduleScores as Record<string, number>,
            sayDoConsistencyScore: session.score.sayDoConsistencyScore,
            aiConfidence: session.score.aiConfidence,
            humanReviewed: session.score.humanReviewed,
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

    const unreviewableStates = [
      SessionStatus.NOT_STARTED,
      SessionStatus.IN_PROGRESS,
      SessionStatus.DISCONNECTED,
    ];
    if (unreviewableStates.includes(session.status as SessionStatus)) {
      throw new AppException(
        "SESSION_NOT_REVIEWABLE",
        "Session is still active and cannot be reviewed",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
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
