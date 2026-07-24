import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStoragePort } from "../integrations/storage/object-storage.port";
import { CreateProctoringEventDto, ProctoringEventResponse, ProctoringSummaryResponse, ProctoringEventType, ProctoringUploadStatus } from "./proctoring.types";
import { SessionStatus } from "@prisma/client";
import { buildEvidenceKey } from "../common/utils/storage-key.util";
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
      include: {
        candidate: true,
      },
    });

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: {
          OR: [{ token: sessionId }, { id: sessionId }],
        },
        include: { session: { include: { candidate: true } } },
      });
      if (invite?.session) {
        session = invite.session as any;
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
            include: {
              candidate: true,
            },
          }) as any;
          this.logger.log(`[ProctoringService] Created dev fallback session for testing: ${sessionId}`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not auto-create dev fallback session: ${err.message}`);
      }
    }

    return session;
  }

  /**
   * Check for duplicate event within cooldown window.
   */
  private async findRecentDuplicateEvent(sessionId: string, eventType: ProctoringEventType, timestamp: Date) {
    const cooldown = COOLDOWNS[eventType] ?? 0;
    if (cooldown <= 0) return null;

    const newTime = timestamp.getTime();
    const existingEvents = await this.prisma.proctoringEvent.findMany({
      where: {
        sessionId,
        eventType,
      },
    });

    for (const existing of existingEvents) {
      const existingTime = existing.timestamp.getTime();
      if (Math.abs(newTime - existingTime) < cooldown) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Persist Proctoring Event metadata after validation and duplicate checks.
   */
  async createEvent(dto: CreateProctoringEventDto) {
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

    const existing = await this.findRecentDuplicateEvent(targetSessionId, dto.eventType, new Date(dto.timestamp));
    if (existing) {
      this.logger.warn(`[ProctoringService] Duplicate event within cooldown window for session ${targetSessionId}: ${dto.eventType}`);
      if (dto.clipUrl) {
        return this.prisma.proctoringEvent.update({
          where: { id: existing.id },
          data: { clipUrl: dto.clipUrl, uploadStatus: ProctoringUploadStatus.UPLOADED },
        });
      }
      return existing;
    }

    const uploadStatus =
      dto.uploadStatus ??
      (dto.clipUrl ? ProctoringUploadStatus.UPLOADED : ProctoringUploadStatus.FAILED);

    return this.prisma.proctoringEvent.create({
      data: {
        id: dto.id ?? undefined,
        sessionId: targetSessionId,
        eventType: dto.eventType,
        severity: dto.severity,
        timestamp: new Date(dto.timestamp),
        clipUrl: dto.clipUrl ?? null,
        modelVersion: dto.modelVersion ?? null,
        uploadStatus,
      },
    });
  }

  /**
   * Atomic handler: Upload video clip to MinIO AND create/update ProctoringEvent DB record in a single operation.
   */
  async uploadEvidenceAndCreateEvent(
    sessionId: string,
    file: { originalname: string; buffer: Buffer },
    dto: CreateProctoringEventDto,
  ): Promise<ProctoringEventResponse> {
    const session = await this.resolveSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const activeStatuses: SessionStatus[] = [SessionStatus.IN_PROGRESS, SessionStatus.NOT_STARTED, SessionStatus.DISCONNECTED];
    if (!activeStatuses.includes(session.status)) {
      throw new BadRequestException(
        `Upload rejected: session is in ${session.status} state. Uploads only allowed for active assessments.`,
      );
    }

    const clientSlug = (session as any).candidate?.organization?.slug ?? "default-org";
    const candidateName = (session as any).candidate?.name ?? "unnamed";
    const candidateId = session.candidateId;

    const eventTimestamp = new Date(dto.timestamp || Date.now());

    // 1. Check for duplicate event BEFORE uploading to MinIO using sliding window
    const existingDuplicate = await this.findRecentDuplicateEvent(session.id, dto.eventType, eventTimestamp);

    if (existingDuplicate && existingDuplicate.clipUrl && existingDuplicate.uploadStatus === ProctoringUploadStatus.UPLOADED) {
      this.logger.log(
        `[ProctoringService] DUPLICATE_EVENT_SKIP: event ${dto.eventType} already has clip ${existingDuplicate.clipUrl}. Returning existing event.`,
      );
      const presignedUrl = await this.storage.getSignedUrl(this.bucketBiometric, existingDuplicate.clipUrl);
      return { ...existingDuplicate, clipUrl: presignedUrl };
    }

    const cooldownMs = COOLDOWNS[dto.eventType] ?? 15000;
    const timeBucket = Math.floor(eventTimestamp.getTime() / Math.max(cooldownMs, 1000));
    
    // CRITICAL: If a duplicate row exists (e.g. status PENDING/FAILED or boundary overlap), target its exact ID so upsert operates on the SAME row
    const eventId = dto.id ?? (existingDuplicate ? existingDuplicate.id : `evt_${session.id.slice(0, 8)}_${dto.eventType.toLowerCase()}_${timeBucket}`);

    // 2. Build standardized MinIO key using central utility
    const objectKey = buildEvidenceKey({
      clientSlug,
      candidateId,
      candidateName,
      sessionId: session.id,
      eventType: dto.eventType,
      eventId,
      timestamp: eventTimestamp,
    });

    this.logger.log(
      `[ProctoringService] ATOMIC_MINIO_UPLOAD_START: eventType=${dto.eventType}, key=${objectKey}, size=${file.buffer.length} bytes`,
    );

    // 3. Put object in MinIO
    const success = await this.storage.putObject(
      this.bucketBiometric,
      objectKey,
      file.buffer,
      { "Content-Type": "video/webm" },
    );

    if (!success) {
      throw new BadRequestException("Failed to upload evidence clip to object storage.");
    }

    // 4. Atomic DB-level Upsert targeting exact eventId (updates existingDuplicate row in place if present)
    if (existingDuplicate?.clipUrl && existingDuplicate.clipUrl !== objectKey) {
      await this.storage.deleteObject(this.bucketBiometric, existingDuplicate.clipUrl).catch(() => null);
    }

    const eventRecord = await this.prisma.proctoringEvent.upsert({
      where: { id: eventId },
      update: {
        clipUrl: objectKey,
        uploadStatus: ProctoringUploadStatus.UPLOADED,
        timestamp: eventTimestamp,
      },
      create: {
        id: eventId,
        sessionId: session.id,
        eventType: dto.eventType,
        severity: dto.severity,
        timestamp: eventTimestamp,
        clipUrl: objectKey,
        modelVersion: dto.modelVersion ?? null,
        uploadStatus: ProctoringUploadStatus.UPLOADED,
      },
    });

    const presignedUrl = await this.storage.getSignedUrl(this.bucketBiometric, objectKey);
    return {
      ...eventRecord,
      clipUrl: presignedUrl,
    };
  }

  /**
   * Upload video clip to MinIO (legacy wrapper routing through atomic logic)
   */
  async uploadEvidence(
    sessionId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<{ storageRef: string; clipUrl: string }> {
    const eventType = (filename.split("_")[0] || "MULTIPLE_FACES").toUpperCase() as ProctoringEventType;
    const res = await this.uploadEvidenceAndCreateEvent(
      sessionId,
      { originalname: filename, buffer: fileBuffer },
      { sessionId, eventType, severity: "HIGH", timestamp: new Date().toISOString() },
    );
    const rawStorageRef = res.clipUrl ? res.clipUrl.split("?")[0] : "";
    return { storageRef: rawStorageRef, clipUrl: rawStorageRef };
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
    const session = await this.resolveSession(sessionId);
    const targetSessionId = session ? session.id : sessionId;
    const now = new Date();
    const fortySecondsAgo = new Date(now.getTime() - 40000);

    if (eventType === "EXTERNAL_INSERT" || eventType === "PASTE") {
      const textSnippet = payload?.snippet || payload?.text || "";
      const textLength = payload?.textLength || textSnippet.length || 0;

      // Rule 1: Tab Switch + External Insert within 40s
      // First check EventLog table (server-side tracking)
      let recentTabSwitch = await this.prisma.eventLog.findFirst({
        where: {
          sessionId: targetSessionId,
          eventType: "TAB_SWITCH",
          occurredAt: { gte: fortySecondsAgo },
        },
      });

      // Fallback: check ProctoringEvent table (client-side reported tab-switch)
      if (!recentTabSwitch) {
        const pe = await this.prisma.proctoringEvent.findFirst({
          where: {
            sessionId: targetSessionId,
            eventType: "TAB_SWITCH" as any,
            timestamp: { gte: fortySecondsAgo },
          },
        });
        if (pe) {
          recentTabSwitch = pe as any; // Map to satisfy recentTabSwitch check
        }
      }

      // Rule 2: Provenance check (self-copied matching vs external insert)
      let isSelfCopied = false;
      if (textSnippet && textSnippet.length > 5) {
        const sessionObj = await this.prisma.session.findUnique({
          where: { id: targetSessionId },
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

        if (sessionObj?.drive?.questions) {
          for (const dq of sessionObj.drive.questions) {
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
          sessionId: targetSessionId,
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
          sessionId: targetSessionId,
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
