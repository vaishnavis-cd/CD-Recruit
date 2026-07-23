import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStoragePort } from "../integrations/storage/object-storage.port";
import { CreateProctoringEventDto, ProctoringEventResponse, ProctoringSummaryResponse, ProctoringEventType, ProctoringUploadStatus } from "./proctoring.types";
import { SessionStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const COOLDOWNS: Record<string, number> = {
  PHONE_DETECTED: 30000,
  HEADPHONES_DETECTED: 30000,
  BOOK_DETECTED: 30000,
  FACE_MISSING: 15000,
  LOOKING_AWAY: 15000,
  EXCESSIVE_MOVEMENT: 15000,
  MULTIPLE_FACES: 0,
  SEAT_EXIT: 0,
  TAB_SWITCH: 10000,
  PASTE: 5000,
  FULLSCREEN_EXIT: 10000,
  SPEECH_DETECTED: 15000,
  SECOND_VOICE_SUSPECTED: 30000,
  IDENTITY_MISMATCH: 30000,
};

@Injectable()
export class ProctoringService {
  private readonly logger = new Logger(ProctoringService.name);
  private readonly bucketBiometric: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStoragePort,
    private readonly config: ConfigService,
  ) {
    this.bucketBiometric =
      this.config.get<string>("app.minio.bucketBiometric" as any) ??
      "cd-recruit-biometric";
  }

  /**
   * Helper to resolve Session by raw Session.id, Invite.token, or Invite.id
   */
  private async resolveSession(sessionId: string) {
    let session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: {
          OR: [{ token: sessionId }, { id: sessionId }],
        },
        include: { session: true },
      });
      if (invite?.session) {
        session = invite.session;
      }
    }

    // Auto-create dev test session in development mode if session ID doesn't exist in DB
    if (!session && (process.env.NODE_ENV === "development" || !process.env.NODE_ENV)) {
      try {
        let drive = await this.prisma.drive.findFirst();
        let candidate = await this.prisma.candidate.findFirst();
        let roleTemplate = await this.prisma.roleTemplate.findFirst();
        if (candidate && roleTemplate) {
          session = await this.prisma.session.create({
            data: {
              id: sessionId,
              candidateId: candidate.id,
              roleTemplateId: roleTemplate.id,
              driveId: drive?.id ?? null,
              cvMode: "FACE_ONLY" as any,
              status: SessionStatus.IN_PROGRESS,
            },
          });
          this.logger.log(`[ProctoringService] Created dev fallback session for testing: ${sessionId}`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not auto-create dev fallback session: ${err.message}`);
      }
    }

    return session;
  }

  /**
   * Persist Proctoring Event metadata after validation and duplicate checks.
   */
  async createEvent(dto: CreateProctoringEventDto) {
    // 1. Session Validation
    const session = await this.resolveSession(dto.sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${dto.sessionId}`);
    }
    const targetSessionId = session.id;

    const activeStatuses: SessionStatus[] = [SessionStatus.IN_PROGRESS, SessionStatus.NOT_STARTED, SessionStatus.DISCONNECTED];
    if (!activeStatuses.includes(session.status)) {
      throw new BadRequestException(
        `Session is in state ${session.status}. Telemetry events are only accepted for active assessments.`,
      );
    }

    // 2. Server-side Duplicate Protection
    const cooldown = COOLDOWNS[dto.eventType] ?? 0;
    if (cooldown > 0) {
      const newTime = new Date(dto.timestamp).getTime();
      const existingEvents = await this.prisma.proctoringEvent.findMany({
        where: {
          sessionId: targetSessionId,
          eventType: dto.eventType,
        },
      });

      for (const existing of existingEvents) {
        const existingTime = existing.timestamp.getTime();
        if (Math.abs(newTime - existingTime) < cooldown) {
          this.logger.warn(
            `Duplicate proctoring event blocked on backend: ${dto.eventType} for session ${targetSessionId}`,
          );
          throw new ConflictException(
            `Duplicate event of type ${dto.eventType} detected within the cooldown window.`,
          );
        }
      }
    }

    // Resolve uploadStatus mapping
    const uploadStatus =
      dto.uploadStatus ??
      (dto.clipUrl ? ProctoringUploadStatus.UPLOADED : ProctoringUploadStatus.FAILED);

    this.logger.log(
      `[ProctoringService] WRITING_TO_DB: sessionId=${targetSessionId}, eventType=${dto.eventType}, uploadStatus=${uploadStatus}`,
    );

    const createdEvent = await this.prisma.proctoringEvent.create({
      data: {
        sessionId: targetSessionId,
        eventType: dto.eventType,
        severity: dto.severity,
        timestamp: new Date(dto.timestamp),
        clipUrl: dto.clipUrl ?? null,
        modelVersion: dto.modelVersion ?? null,
        uploadStatus,
      },
    });

    this.logger.log(`[ProctoringService] DB_WRITE_SUCCESS: eventId=${createdEvent.id}`);
    return createdEvent;
  }

  /**
   * Upload video clip to MinIO after validating session.
   */
  async uploadEvidence(
    sessionId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<{ storageRef: string; clipUrl: string }> {
    // Session Validation
    const session = await this.resolveSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }
    const targetSessionId = session.id;

    const activeStatuses: SessionStatus[] = [SessionStatus.IN_PROGRESS, SessionStatus.NOT_STARTED, SessionStatus.DISCONNECTED];
    if (!activeStatuses.includes(session.status)) {
      throw new BadRequestException(
        `Upload rejected: session is in ${session.status} state. Uploads only allowed for active assessments.`,
      );
    }

    const sha256Hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const storageRef = `proctoring/${targetSessionId}/${filename}`;
    this.logger.log(
      `[ProctoringService] MINIO_UPLOAD_START: filename=${filename}, sha256=${sha256Hash}, bytes=${fileBuffer.length}, bucket=${this.bucketBiometric}, storageRef=${storageRef}`,
    );

    const success = await this.storage.putObject(
      this.bucketBiometric,
      storageRef,
      fileBuffer,
      { "Content-Type": "video/webm" },
    );

    if (!success) {
      throw new BadRequestException("Failed to upload evidence clip to object storage.");
    }

    this.logger.log(`[ProctoringService] MINIO_UPLOAD_SUCCESS: storageRef=${storageRef}`);

    // Create corresponding IntegrityFlag and EvidenceClip record in DB so Admin Web displays clip evidence
    let category = "PROCTORING_EVIDENCE";
    const lower = filename.toLowerCase();
    if (lower.includes("face")) category = "IDENTITY_MISMATCH";
    else if (lower.includes("phone")) category = "PHONE_DETECTED";
    else if (lower.includes("audio") || lower.includes("voice")) category = "SPEECH_DETECTED";
    else if (lower.includes("exit") || lower.includes("leave")) category = "SEAT_EXIT";

    try {
      const now = new Date();
      const flag = await this.prisma.integrityFlag.create({
        data: {
          sessionId: targetSessionId,
          category,
          severity: "HIGH",
          confidence: 0.9,
          flaggedAt: now,
        },
      });

      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await this.prisma.evidenceClip.create({
        data: {
          flagId: flag.id,
          storageRef,
          expiresAt,
        },
      });
      this.logger.log(`[ProctoringService] Created IntegrityFlag ${flag.id} and EvidenceClip for ${storageRef}`);
    } catch (err: any) {
      this.logger.error(`[ProctoringService] Failed to create IntegrityFlag for upload: ${err.message}`);
    }

    return {
      storageRef,
      clipUrl: storageRef,
    };
  }

  /**
   * Get all session events for recruiter review, generating signed GET URLs.
   */
  async getSessionEvents(sessionId: string): Promise<ProctoringEventResponse[]> {
    const session = await this.resolveSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }
    const targetSessionId = session.id;

    const events = await this.prisma.proctoringEvent.findMany({
      where: { sessionId: targetSessionId },
      orderBy: { timestamp: "asc" },
    });

    return Promise.all(
      events.map(async (event) => {
        let presignedUrl: string | null = null;
        if (event.clipUrl && event.uploadStatus === ProctoringUploadStatus.UPLOADED) {
          presignedUrl = await this.storage.getSignedUrl(
            this.bucketBiometric,
            event.clipUrl,
          );
        }
        return {
          id: event.id,
          sessionId: event.sessionId,
          eventType: event.eventType,
          severity: event.severity,
          timestamp: event.timestamp,
          clipUrl: presignedUrl,
          modelVersion: event.modelVersion,
          uploadStatus: event.uploadStatus,
          createdAt: event.createdAt,
        };
      }),
    );
  }

  /**
   * Get counts of proctoring events mapped to camelCase.
   * Generates summary dynamically using aggregation.
   */
  async getSessionSummary(sessionId: string): Promise<ProctoringSummaryResponse> {
    const session = await this.resolveSession(sessionId);
    const targetSessionId = session ? session.id : sessionId;

    const events = await this.prisma.proctoringEvent.findMany({
      where: { sessionId: targetSessionId },
    });

    const summary: ProctoringSummaryResponse = {
      faceMissing: 0,
      multipleFaces: 0,
      lookingAway: 0,
      seatExit: 0,
      excessiveMovement: 0,
      phoneDetected: 0,
      headphonesDetected: 0,
      bookDetected: 0,
    };

    for (const event of events) {
      switch (event.eventType) {
        case ProctoringEventType.FACE_MISSING:
          summary.faceMissing++;
          break;
        case ProctoringEventType.MULTIPLE_FACES:
          summary.multipleFaces++;
          break;
        case ProctoringEventType.LOOKING_AWAY:
          summary.lookingAway++;
          break;
        case ProctoringEventType.SEAT_EXIT:
          summary.seatExit++;
          break;
        case ProctoringEventType.EXCESSIVE_MOVEMENT:
          summary.excessiveMovement++;
          break;
        case ProctoringEventType.PHONE_DETECTED:
          summary.phoneDetected++;
          break;
        case ProctoringEventType.HEADPHONES_DETECTED:
          summary.headphonesDetected++;
          break;
        case ProctoringEventType.BOOK_DETECTED:
          summary.bookDetected++;
          break;
      }
    }

    return summary;
  }

  /**
   * Evaluate proctoring telemetry for correlated integrity flags and provenance tagging.
   */
  async evaluateEvent(sessionId: string, eventType: string, payload: any) {
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10000);

    if (eventType === "EXTERNAL_INSERT" || eventType === "PASTE") {
      const textSnippet = payload?.snippet || payload?.text || "";
      const textLength = payload?.textLength || textSnippet.length || 0;

      // Rule 1: Tab Switch + External Insert within 10s
      // First check EventLog table (server-side tracking)
      let recentTabSwitch = await this.prisma.eventLog.findFirst({
        where: {
          sessionId,
          eventType: "TAB_SWITCH",
          occurredAt: { gte: tenSecondsAgo },
        },
      });

      // Fallback: check ProctoringEvent table (client-side reported tab-switch)
      if (!recentTabSwitch) {
        const pe = await this.prisma.proctoringEvent.findFirst({
          where: {
            sessionId,
            eventType: "TAB_SWITCH" as any,
            timestamp: { gte: tenSecondsAgo },
          },
        });
        if (pe) {
          recentTabSwitch = pe as any; // Map to satisfy recentTabSwitch check
        }
      }

      // Rule 2: Provenance check (self-copied matching vs external insert)
      let isSelfCopied = false;
      if (textSnippet && textSnippet.length > 5) {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
          include: {
            drive: {
              include: {
                questions: {
                  include: { question: true },
                },
              },
            },
          },
        });

        if (session?.drive?.questions) {
          for (const dq of session.drive.questions) {
            const qStr = JSON.stringify(dq.question.content);
            if (qStr.includes(textSnippet)) {
              isSelfCopied = true;
              break;
            }
          }
        }
      }

      let category = "EXTERNAL_INSERT_FLAG";
      let severity = "HIGH";
      let confidence = 0.85;

      if (recentTabSwitch) {
        category = "CORRELATED_PASTE_ANOMALY";
        severity = "CRITICAL";
        confidence = 0.95;
      } else if (isSelfCopied) {
        category = "SELF_COPY_INSERT";
        severity = "LOW";
        confidence = 0.3;
      }

      return this.prisma.integrityFlag.create({
        data: {
          sessionId,
          category,
          severity,
          confidence,
          flaggedAt: now,
        },
      });
    }

    if (eventType === "FULLSCREEN_EXIT") {
      return this.prisma.integrityFlag.create({
        data: {
          sessionId,
          category: "FULLSCREEN_EXIT_FLAG",
          severity: "HIGH",
          confidence: 0.9,
          flaggedAt: now,
        },
      });
    }

    const categoryMapping: Record<string, string> = {
      PHONE_DETECTED: "PHONE_DETECTED",
      HEADPHONES_DETECTED: "HEADPHONES_DETECTED",
      BOOK_DETECTED: "BOOK_DETECTED",
      SEAT_EXIT: "SEAT_EXIT",
      LOOKING_AWAY: "GAZE_AWAY",
      IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
      SPEECH_DETECTED: "SPEECH_DETECTED",
      SECOND_VOICE_SUSPECTED: "SECOND_VOICE_SUSPECTED",
    };

    if (eventType in categoryMapping) {
      const category = categoryMapping[eventType];
      const severity = payload?.severity || "MEDIUM";
      const confidence = payload?.payload?.confidence || 0.85;

      const flag = await this.prisma.integrityFlag.create({
        data: {
          sessionId,
          category,
          severity,
          confidence,
          flaggedAt: now,
        },
      });

      if (payload?.clipUrl) {
        let retentionDays = 30;
        try {
          const configPath = path.join(__dirname, "../config/settings.json");
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            retentionDays = config.biometricRetentionDays ?? 30;
          }
        } catch (e) {
          // ignore
        }
        const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

        await this.prisma.evidenceClip.create({
          data: {
            flagId: flag.id,
            storageRef: payload.clipUrl,
            expiresAt,
          },
        });
      }

      return flag;
    }

    return null;
  }
}
