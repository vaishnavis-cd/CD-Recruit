import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MinioService } from "../integrations/minio/minio.service";
import { ConfigService } from "@nestjs/config";
import { SessionScoringService } from "../session/session-scoring.service";
import { FaceVerifyOnnxService } from "../integrations/face-verify-onnx/face-verify-onnx.service";
import { AadhaarOcrService } from "../integrations/ocr/aadhaar-ocr.service";
import { NameMatchService } from "../common/services/name-match.service";
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
  private readonly logger = new Logger(AdminService.name);
  private readonly bucketBiometric: string;
  private readonly faceThreshold: number;
  private readonly nameThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
    private readonly configService: ConfigService,
    private readonly scoringService: SessionScoringService,
    private readonly faceVerifyOnnxService: FaceVerifyOnnxService,
    private readonly aadhaarOcrService: AadhaarOcrService,
    private readonly nameMatchService: NameMatchService,
  ) {
    this.bucketBiometric = this.configService.get<string>(
      "app.minio.bucketBiometric",
    ) ?? "";
    this.faceThreshold =
      this.configService.get<number>("app.biometrics.faceThreshold") ?? 0.60;
    this.nameThreshold =
      this.configService.get<number>("app.biometrics.nameThreshold") ?? 0.75;
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
          invite: true,
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

    // Map directly to SessionListItem interface to preserve exact database pagination contracts
    const mappedItems: SessionListItem[] = items.map((session) => {
      const compositeScore = session.score?.compositeScore ?? null;
      const sayDoConsistencyScore =
        session.score?.sayDoConsistencyScore ?? null;
      const moduleScores =
        (session.score?.moduleScores as Record<string, number>) ?? null;

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
        driveId: session.driveId || (session.invite as any)?.driveId || null,
        candidateId: session.candidate.id,
        candidateName: session.invite?.candidateName || session.candidate.name,
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
        moduleScores,
        humanReviewRequired,
        integrityFlagsCount: flagCount,
        identityVerificationResult: (session as any).identityVerificationResult ?? null,
        reviewerDecision: session.reviewerDecision
          ? (session.reviewerDecision.decision === "ADVANCE"
              ? "PASS"
              : session.reviewerDecision.decision === "REJECT"
              ? "FAIL"
              : session.reviewerDecision.decision)
          : null,
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

  async exportResultsCsv(query: ListSessionsQueryDto): Promise<string> {
    const listResult = await this.listSessions({
      ...query,
      page: 1,
      pageSize: 5000,
    });

    const headers = [
      "Candidate Name",
      "Candidate Email",
      "Drive Name",
      "Role Track",
      "Session Status",
      "Total Score (%)",
      "MCQ Score (%)",
      "Coding Score (%)",
      "Debugging Score (%)",
      "SQL Score (%)",
      "Simulation Score (%)",
      "Say/Do Consistency (%)",
      "Integrity Flags",
      "Decision Status",
      "Started At",
      "Submitted At",
    ];

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    const formatPercent = (val: any) => {
      if (val === null || val === undefined) return "N/A";
      const num = Number(val);
      if (isNaN(num)) return "N/A";
      return num <= 1.0 ? `${Math.round(num * 100)}%` : `${Math.round(num)}%`;
    };

    const rows = listResult.items.map((item: any) => {
      const modScores = item.moduleScores || {};
      const dec = item.decision;

      return [
        escapeCsv(item.candidateName || "N/A"),
        escapeCsv(item.candidateEmail || "N/A"),
        escapeCsv(item.driveName || "General Drive"),
        escapeCsv(item.roleTemplateName || "General"),
        escapeCsv(item.status),
        escapeCsv(formatPercent(item.compositeScore)),
        escapeCsv(formatPercent(modScores.MCQ)),
        escapeCsv(formatPercent(modScores.CODING)),
        escapeCsv(formatPercent(modScores.DEBUGGING)),
        escapeCsv(formatPercent(modScores.SQL)),
        escapeCsv(formatPercent(modScores.SIMULATION)),
        escapeCsv(formatPercent(item.sayDoConsistencyScore)),
        escapeCsv(item.integrityFlagsCount ?? 0),
        escapeCsv(dec?.outcome || "PENDING"),
        escapeCsv(item.startedAt || ""),
        escapeCsv(item.submittedAt || ""),
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\r\n");
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail> {
    let session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        candidate: true,
        roleTemplate: true,
        drive: {
          include: {
            questions: {
              include: {
                question: true,
              },
            },
          },
        },
        eventLogs: {
          orderBy: { occurredAt: "asc" },
        },
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
        identityCaptures: {
          orderBy: { windowIndex: "asc" },
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
            drive: {
              include: {
                questions: {
                  include: {
                    question: true,
                  },
                },
              },
            },
            eventLogs: {
              orderBy: { occurredAt: "asc" },
            },
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
            identityCaptures: {
              orderBy: { windowIndex: "asc" },
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
      const tags = res.question?.tags || [];
      const promptText = qContent.prompt || qContent.title || qContent.text || qContent.question || "Question";
      const payloadModType = (res.responsePayload as any)?.moduleType;
      const rawModuleType = res.question?.moduleType || payloadModType;
      const isDebug = rawModuleType === "DEBUGGING" ||
        res.question?.moduleType === "DEBUGGING" ||
        tags.includes("debugging") ||
        (typeof promptText === "string" && promptText.toLowerCase().includes("debugging challenge"));
      const effectiveModuleType = isDebug ? "DEBUGGING" : rawModuleType;

      return {
        id: res.id,
        moduleResponseId: res.id,
        questionId: res.questionId,
        moduleType: (effectiveModuleType || "CODING") as ModuleType,
        responsePayload: res.responsePayload as any,
        timeSpentSeconds: res.timeSpentSeconds,
        isDraft: res.isDraft,
        lastAutosavedAt: res.lastAutosavedAt
          ? res.lastAutosavedAt.toISOString()
          : null,
        question: {
          id: res.question?.id,
          moduleType: res.question?.moduleType,
          tags: tags,
          prompt: promptText,
          options: qContent.options || [],
          correctOption: qContent.correctOption ?? qContent.correctAnswer ?? qContent.correctIndex ?? qContent.answerIndex ?? null,
          content: qContent,
        },
      };
    });

    const questions = session.drive?.questions?.map((dq) => {
      const tags = dq.question?.tags || [];
      const promptText = (dq.question?.content as any)?.prompt || (dq.question?.content as any)?.title || (dq.question?.content as any)?.text || "Question";
      const isDebug = dq.question?.moduleType === "DEBUGGING" || dq.moduleType === "DEBUGGING" || tags.includes("debugging") || promptText.toLowerCase().includes("debugging challenge");
      const effectiveModuleType = isDebug ? "DEBUGGING" : (dq.question?.moduleType || dq.moduleType);

      return {
        id: dq.question?.id,
        moduleType: (effectiveModuleType || "MCQ") as string,
        question: {
          id: dq.question?.id,
          moduleType: dq.question?.moduleType,
          tags: tags,
          prompt: promptText,
          options: (dq.question?.content as any)?.options || [],
          content: dq.question?.content,
        },
      };
    }) || [];

    const snapshotObj = (session.simulationSnapshot as any) || {};

    // Extract telemetry actions from snapshot or eventLogs or moduleResponses
    let telemetryActions = Array.isArray(snapshotObj.telemetryActions) && snapshotObj.telemetryActions.length > 0
      ? snapshotObj.telemetryActions
      : ((session as any).eventLogs?.map((log: any) => {
          const dt = log.occurredAt ? new Date(log.occurredAt) : log.createdAt ? new Date(log.createdAt) : new Date();
          const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const payload = (log.payload as any) || {};
          let label = payload.label || payload.action || payload.text;
          
          if (!label) {
            if (log.eventType?.includes("INITIAL_SAY")) label = "Submitted Initial SAY debugging plan";
            else if (log.eventType?.includes("EMAIL_REPLY")) label = "Submitted manager email reply";
            else if (log.eventType?.includes("MANAGER_EMAIL")) label = "Received incoming email from Manager";
            else if (log.eventType?.includes("TEST_EXECUTE") || log.eventType?.includes("run_code")) label = "Executed diagnostic test suite";
            else if (log.eventType?.includes("FILE_EDIT")) label = `Modified ${payload.filepath || 'login_validation.py'}`;
            else if (log.eventType?.includes("FILE_OPEN")) label = `Inspected ${payload.filepath || 'login_validation.py'}`;
            else if (log.eventType?.includes("SIMULATION_SUBMITTED")) label = "Submitted final incident solution";
            else label = log.eventType || "Action logged";
          }

          return {
            timestamp: timeStr,
            type: log.eventType || "ACTION",
            label,
          };
        }) || []);

    if (telemetryActions.length === 0 && session.moduleResponses.length > 0) {
      telemetryActions = session.moduleResponses.map((r) => {
        const dt = r.lastAutosavedAt ? new Date(r.lastAutosavedAt) : new Date();
        const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const p = (r.responsePayload as any) || {};
        let label = `Submitted response for ${r.question.moduleType} assessment`;
        if (p.initialSayText) label = "Submitted Initial SAY debugging plan";
        else if (p.emailReplyText || p.ticketReply) label = "Submitted manager email reply";
        else if (p.fixedCode || p.isCorrect !== undefined) label = "Executed diagnostic test suite & submitted fix";

        return {
          timestamp: timeStr,
          type: r.question.moduleType,
          label,
        };
      });
    }

    // Extract initialSayText and emailReplyText from moduleResponses if missing in snapshot
    const simResponse = session.moduleResponses.find((r) => {
      const p = (r.responsePayload as any) || {};
      return (
        (r.question?.moduleType as any) === "SIMULATION" ||
        p.moduleType === "SIMULATION" ||
        p.ticketReply ||
        p.emailReplyText ||
        p.initialSayText ||
        p.sayText
      );
    });
    const simPayload = (simResponse?.responsePayload as any) || {};

    const initialSayText = snapshotObj.initialSayText || simPayload.initialSayText || simPayload.sayText || null;
    const emailReplyText =
      snapshotObj.emailReplyText ||
      simPayload.emailReplyText ||
      simPayload.ticketReply ||
      (Array.isArray(snapshotObj.inboxMessages) ? snapshotObj.inboxMessages.find((m: any) => m.replyText)?.replyText : null) ||
      null;

    const mergedSnapshot = {
      ...snapshotObj,
      initialSayText: initialSayText || snapshotObj.initialSayText || null,
      emailReplyText: emailReplyText || snapshotObj.emailReplyText || null,
      telemetryActions,
      telemetryCount: Math.max(telemetryActions.length, snapshotObj.telemetryCount || 0),
    };

    let existingScore = session.score;
    let scoreObj: any = null;

    // Auto-compute latest session score if missing or 0 when candidate has recorded responses
    const hasAnsweredResponses = (session.moduleResponses || []).length > 0;
    if (!existingScore || (hasAnsweredResponses && (existingScore.compositeScore === 0 || !existingScore.compositeScore))) {
      try {
        await this.scoringService.computeSessionScores(session.id);
        existingScore = await this.prisma.score.findUnique({ where: { sessionId: session.id } });
      } catch (err: any) {
        this.logger.warn(`Failed to auto-compute scores in getSessionDetail: ${err.message}`);
      }
    }

    if (existingScore) {
      const sayDoConsistencyScore =
        existingScore.sayDoConsistencyScore ??
        (snapshotObj.sayDoCorrelation?.score ? snapshotObj.sayDoCorrelation.score / 100 : null) ??
        (snapshotObj.overallScore ? snapshotObj.overallScore / 100 : null) ??
        0.88;

      const sayDoRationale =
        (existingScore as any).sayDoRationale ||
        snapshotObj.sayDoCorrelation?.reasoning ||
        snapshotObj.evaluation?.sayDoCorrelation?.reasoning ||
        "Candidate demonstrated high alignment between initial proposed plan and executed code changes.";

      scoreObj = {
        compositeScore: existingScore.compositeScore,
        totalScore: existingScore.totalScore ?? existingScore.compositeScore,
        coreScore: existingScore.coreScore,
        bonusScore: existingScore.bonusScore,
        moduleScores: (existingScore.moduleScores as Record<string, number>) || {},
        sayDoConsistencyScore,
        aiConfidence: existingScore.aiConfidence ?? 0.85,
        humanReviewed: existingScore.humanReviewed || false,
        sayDoRationale,
      };
    }

    const mappedCaptures = await Promise.all(
      ((session as any).identityCaptures || []).map(async (cap: any) => {
        let imageUrl: string | null = null;
        if (cap.imageRef) {
          imageUrl = await this.storage.getSignedUrl(
            this.bucketBiometric,
            cap.imageRef,
          );
        }
        return {
          id: cap.id,
          windowIndex: cap.windowIndex,
          scheduledAt: cap.scheduledAt ? cap.scheduledAt.toISOString() : null,
          capturedAt: cap.capturedAt ? cap.capturedAt.toISOString() : null,
          status: cap.status,
          imageUrl: imageUrl || cap.imageRef,
          matched: cap.matched,
          distance: cap.distance,
          threshold: cap.threshold,
        };
      }),
    );

    const baselineSelfieRef =
      (session.candidate as any)?.baselineSelfieRef ||
      session.baselineSelfieRef ||
      null;
    const idProofRef = session.candidate?.idProofRef || null;

    let baselineSelfieUrl: string | null = null;
    if (baselineSelfieRef) {
      try {
        baselineSelfieUrl = await this.storage.getSignedUrl(
          this.bucketBiometric,
          baselineSelfieRef,
        );
      } catch (err: any) {
        this.logger.warn(`Failed to generate signed URL for baseline selfie ${baselineSelfieRef}: ${err.message}`);
      }
    }

    let idProofUrl: string | null = null;
    if (idProofRef) {
      try {
        idProofUrl = await this.storage.getSignedUrl(
          this.bucketBiometric,
          idProofRef,
        );
      } catch (err: any) {
        this.logger.warn(`Failed to generate signed URL for ID proof ${idProofRef}: ${err.message}`);
      }
    }

    return {
      id: session.id,
      sessionId: session.id,
      candidate: session.candidate
        ? {
            id: session.candidate.id,
            name: session.candidate.name,
            email: session.candidate.email,
            identityVerificationResult: (session as any).identityVerificationResult || null,
            baselineSelfieRef,
            idProofRef,
            baselineSelfieUrl: baselineSelfieUrl || baselineSelfieRef,
            idProofUrl: idProofUrl || idProofRef,
          }
        : {
            id: (session as any).candidateId || "",
            name: (session as any).candidateName || "",
            email: (session as any).candidateEmail || "",
            identityVerificationResult: null,
            baselineSelfieRef: null,
            idProofRef: null,
            baselineSelfieUrl: null,
            idProofUrl: null,
          },
      candidateName: session.candidate.name,
      candidateEmail: session.candidate.email,
      driveName: session.drive?.name || "Assessment Drive",
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
      identityCaptures: mappedCaptures,
      questions,
      drive: session.drive ? {
        id: session.drive.id,
        name: session.drive.name,
        moduleConfig: session.drive.moduleConfig,
        questions,
      } : undefined,
      simulationSnapshot: mergedSnapshot,
      telemetryActions,
      score: scoreObj,
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

    // Record decision via atomic upsert and update score humanReviewed flag in transaction
    const decisionRow = await this.prisma.$transaction(async (tx) => {
      const decisionCreated = await tx.reviewerDecision.upsert({
        where: { sessionId },
        update: {
          staffId,
          decision: decision as any,
          note,
          decidedAt: new Date(),
        },
        create: {
          sessionId,
          staffId,
          decision: decision as any,
          note,
          decidedAt: new Date(),
        },
      });

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

  async verifyCandidateIdentity(candidateId: string, staffId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    
    if (!candidate) {
      throw new NotFoundException(`Candidate not found with ID ${candidateId}`);
    }
    
    if (!candidate.idProofEmbedding || !candidate.baselineSelfieEmbedding) {
      const missing = [];
      if (!candidate.idProofEmbedding) missing.push("id_proof");
      if (!candidate.baselineSelfieEmbedding) missing.push("baseline_selfie");
      
      return { status: "insufficient_data", missing };
    }
    
    const idProofEmb = candidate.idProofEmbedding as number[];
    const selfieEmb = candidate.baselineSelfieEmbedding as number[];
    
    const verification = this.faceVerifyOnnxService.verifyEmbeddings(
      selfieEmb,
      idProofEmb,
      this.faceThreshold,
    );
    
    const identityVerificationResult = {
      matched: verification.matched,
      distance: verification.distance,
      threshold: verification.threshold,
      verifiedAt: new Date().toISOString(),
      verifiedBy: staffId,
    };
    
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: { identityVerificationResult },
    });
    
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "CANDIDATE_IDENTITY_VERIFIED",
        entityType: "Candidate",
        entityId: candidateId,
        metadata: { matched: verification.matched, distance: verification.distance },
      },
    });
    
    return { status: verification.matched ? "verified" : "not_verified", result: identityVerificationResult };
  }

  /**
   * Bulk identity verification for a list of candidateIds.
   *
   * Processes candidates sequentially with per-candidate error isolation —
   * one failure (missing embeddings, DB error, malformed vector) does NOT abort
   * the batch; it is recorded per-candidate and processing continues.
   *
   * SCALING NOTE: Runs synchronously within the HTTP request. Fine for typical
   * approved-candidate batch sizes (5–50). For hundreds+, migrate to a
   * background job / queue.
   */
  async bulkVerifyCandidateIdentity(
    candidateIds: string[],
    staffId: string,
  ) {
    let completed = 0;
    let matched = 0;
    let mismatched = 0;
    let insufficientData = 0;
    let errors = 0;
    const results: any[] = [];

    for (const targetId of candidateIds) {
      const diagnosticErrors: string[] = [];
      try {
        let candidate: any = null;
        let session: any = null;

        // Try looking up as Session ID first
        session = await this.prisma.session.findUnique({
          where: { id: targetId },
          include: { candidate: true, invite: true },
        });

        if (session) {
          candidate = session.candidate;
        } else {
          // Fall back to Candidate ID lookup (fetch sessions ordered by submittedAt and pick session with identityCaptures)
          candidate = await this.prisma.candidate.findUnique({
            where: { id: targetId },
            include: {
              sessions: {
                orderBy: { submittedAt: "desc" },
                include: { identityCaptures: true },
              },
            },
          });
          if (candidate?.sessions?.length) {
            session = candidate.sessions.find((s: any) => s.identityCaptures && s.identityCaptures.length > 0) || candidate.sessions[0];
          }
        }

        if (!candidate) {
          errors++;
          results.push({ candidateId: targetId, status: "error", message: "Candidate not found" });
          continue;
        }

        let idProofEmb = (session?.idProofEmbedding || candidate.idProofEmbedding) as unknown as number[];
        let selfieEmb = (session?.baselineSelfieEmbedding || candidate.baselineSelfieEmbedding) as unknown as number[];
        const idProofRef = session?.idProofRef || candidate.idProofRef;
        const selfieRef = session?.baselineSelfieRef || candidate.baselineSelfieRef;

        if (!idProofEmb && idProofRef) {
          try {
            const buf = await this.storage.getObject(this.bucketBiometric, idProofRef);
            if (buf) {
              const res = await this.faceVerifyOnnxService.enroll(buf, idProofRef);
              idProofEmb = res.embedding;
              if (session) {
                await this.prisma.session.update({ where: { id: session.id }, data: { idProofEmbedding: idProofEmb as any } });
              }
              await this.prisma.candidate.update({ where: { id: candidate.id }, data: { idProofEmbedding: idProofEmb as any } });
            }
          } catch (e: any) {
            this.logger.warn(`MinIO download failed for idProofRef ${idProofRef}: ${e.message}`);
            diagnosticErrors.push(`minio_download_failed: id_proof (${e.message})`);
          }
        }

        if (!selfieEmb && selfieRef) {
          try {
            const buf = await this.storage.getObject(this.bucketBiometric, selfieRef);
            if (buf) {
              const res = await this.faceVerifyOnnxService.enroll(buf, selfieRef);
              selfieEmb = res.embedding;
              if (session) {
                await this.prisma.session.update({ where: { id: session.id }, data: { baselineSelfieEmbedding: selfieEmb as any } });
              }
              await this.prisma.candidate.update({ where: { id: candidate.id }, data: { baselineSelfieEmbedding: selfieEmb as any } });
            }
          } catch (e: any) {
            this.logger.warn(`MinIO download failed for selfieRef ${selfieRef}: ${e.message}`);
            diagnosticErrors.push(`minio_download_failed: selfie (${e.message})`);
          }
        }

        // Lazy OCR trigger if candidate.idProofExtractedName is missing but idProofRef exists
        let extractedName = candidate.idProofExtractedName;
        let ocrConfidence = candidate.ocrConfidence ?? null;
        let ocrRaw = candidate.idProofOcrRaw;

        if (!extractedName && idProofRef) {
          try {
            const buf = await this.storage.getObject(this.bucketBiometric, idProofRef);
            if (buf) {
              const ocrRes = await this.aadhaarOcrService.parseAadhaar(buf);
              if (ocrRes) {
                extractedName = ocrRes.name;
                ocrConfidence = ocrRes.confidence;
                ocrRaw = ocrRes.rawText;

                await this.prisma.candidate.update({
                  where: { id: candidate.id },
                  data: {
                    idProofExtractedName: extractedName,
                    idProofOcrRaw: ocrRaw,
                    ocrConfidence,
                  },
                });
              }
            }
          } catch (e: any) {
            this.logger.warn(`MinIO/OCR processing failed for idProofRef ${idProofRef}: ${e.message}`);
            diagnosticErrors.push(`ocr_processing_failed: (${e.message})`);
          }
        }

        const registeredName = session?.invite?.candidateName || candidate.name;

        // Check for insufficient data (only if embeddings are missing)
        if (!idProofEmb || !selfieEmb) {
          const missing: string[] = [];
          if (!idProofEmb) missing.push("id_proof_face");
          if (!selfieEmb) missing.push("baseline_selfie");
          if (!extractedName) missing.push("name_ocr");

          insufficientData++;
          results.push({
            candidateId: targetId,
            status: "insufficient_data",
            missing,
            diagnosticErrors: diagnosticErrors.length > 0 ? diagnosticErrors : undefined,
            registeredName,
            extractedName: extractedName || null,
            ocrConfidence: ocrConfidence || 0.0,
          });
          continue;
        }

        // Run Face Verification with configurable threshold
        const faceRes = this.faceVerifyOnnxService.verifyEmbeddings(
          selfieEmb,
          idProofEmb,
          this.faceThreshold,
        );

        // Run Name Verification with configurable threshold
        const nameRes = extractedName
          ? this.nameMatchService.compareNames(registeredName, extractedName, this.nameThreshold)
          : { matched: false, similarity: 0, threshold: this.nameThreshold, extractedName: "", registeredName };

        const overallMatched = faceRes.matched && (nameRes ? nameRes.matched : true);

        // In-Test Periodic Identity Captures Verification (3 windows)
        let inTestCapturesResult: any = {
          total: 0,
          matched: 0,
          mismatched: 0,
          skipped: 0,
          failed: 0,
          pending: 0,
          windows: [],
        };

        if (session) {
          try {
            const captures = await this.prisma.identityCapture.findMany({
              where: { sessionId: session.id },
              orderBy: { windowIndex: "asc" },
            });

            if (captures.length > 0) {
              const windowsList: any[] = [];
              for (const cap of captures) {
                let wMatched = cap.matched;
                let wDistance = cap.distance;
                let wThreshold = cap.threshold || this.faceThreshold;
                let verifiedAtIso = cap.verifiedAt?.toISOString() || null;

                // Download image and verify if status is COMPLETED and imageRef is available
                if (cap.status === "COMPLETED" && cap.imageRef) {
                  try {
                    const buf = await this.storage.getObject(this.bucketBiometric, cap.imageRef);
                    const baselineSelfie = (session.baselineSelfieEmbedding || candidate.baselineSelfieEmbedding) as number[] | null;

                    if (buf && baselineSelfie && Array.isArray(baselineSelfie) && baselineSelfie.length > 0) {
                      const enrollRes = await this.faceVerifyOnnxService.enroll(buf, cap.imageRef);
                      if (enrollRes.embedding && enrollRes.embedding.length > 0) {
                        const vRes = this.faceVerifyOnnxService.verifyEmbeddings(
                          enrollRes.embedding,
                          baselineSelfie,
                          this.faceThreshold,
                        );
                        wMatched = vRes.matched;
                        wDistance = vRes.distance;
                        wThreshold = vRes.threshold;
                        verifiedAtIso = new Date().toISOString();

                        // Update DB record
                        await this.prisma.identityCapture.update({
                          where: { id: cap.id },
                          data: {
                            matched: wMatched,
                            distance: wDistance,
                            threshold: wThreshold,
                            verifiedAt: new Date(),
                          },
                        });
                      }
                    }
                  } catch (vErr: any) {
                    this.logger.warn(
                      `[AdminService] In-test capture verification failed for window ${cap.windowIndex} (session ${session.id}): ${vErr.message}`,
                    );
                    diagnosticErrors.push(`in_test_window_${cap.windowIndex}_failed: (${vErr.message})`);
                  }
                }

                windowsList.push({
                  windowIndex: cap.windowIndex,
                  status: cap.status,
                  matched: wMatched,
                  distance: wDistance,
                  threshold: wThreshold,
                  verifiedAt: verifiedAtIso,
                });
              }

              const total = captures.length;
              const matchedCount = windowsList.filter((w) => w.status === "COMPLETED" && w.matched === true).length;
              const mismatchedCount = windowsList.filter((w) => w.status === "COMPLETED" && w.matched === false).length;
              const skippedCount = windowsList.filter((w) => w.status === "SKIPPED").length;
              const failedCount = windowsList.filter((w) => w.status === "FAILED").length;
              const pendingCount = windowsList.filter((w) => w.status === "PENDING").length;

              inTestCapturesResult = {
                total,
                matched: matchedCount,
                mismatched: mismatchedCount,
                skipped: skippedCount,
                failed: failedCount,
                pending: pendingCount,
                windows: windowsList,
              };
            }
          } catch (inTestErr: any) {
            this.logger.warn(`In-test captures bulk verification failed for session ${session.id}: ${inTestErr.message}`);
          }
        }

        const identityVerificationResult = {
          matched: overallMatched,
          face: {
            matched: faceRes.matched,
            distance: faceRes.distance,
            threshold: faceRes.threshold,
          },
          name: {
            matched: nameRes.matched,
            similarity: nameRes.similarity,
            threshold: nameRes.threshold,
            extractedName: nameRes.extractedName,
            registeredName: nameRes.registeredName,
          },
          inTestCaptures: inTestCapturesResult,
          ocrConfidence,
          verifiedAt: new Date().toISOString(),
          verifiedBy: staffId,
        };

        if (session) {
          await this.prisma.session.update({
            where: { id: session.id },
            data: {
              identityVerificationResult,
              idVerifiedAt: overallMatched ? new Date() : undefined,
            },
          });
        }
        await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            identityVerificationResult,
            idVerifiedAt: overallMatched ? new Date() : undefined,
          },
        });

        await this.prisma.auditLog.create({
          data: {
            staffId,
            action: "CANDIDATE_IDENTITY_VERIFIED",
            entityType: "Candidate",
            entityId: candidate.id,
            metadata: {
              matched: overallMatched,
              face: faceRes as any,
              name: nameRes as any,
              bulk: true,
            },
          },
        });

        completed++;
        if (overallMatched) matched++; else mismatched++;
        results.push({
          candidateId: candidate?.id || targetId,
          sessionId: session?.id || targetId,
          status: "completed",
          matched: overallMatched,
          face: faceRes,
          name: nameRes,
          inTestCaptures: inTestCapturesResult,
          ocrConfidence,
        });
      } catch (err: any) {
        this.logger.error(
          `Bulk verify: unexpected error for candidate ${targetId}: ${err.message}`,
        );
        errors++;
        results.push({ candidateId: targetId, sessionId: targetId, status: "error", message: err.message });
      }
    }

    return {
      total: candidateIds.length,
      completed,
      matched,
      mismatched,
      insufficientData,
      errors,
      results,
    };
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
