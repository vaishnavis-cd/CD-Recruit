import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStoragePort } from "../integrations/storage/object-storage.port";
import { CreateProctoringEventDto, ProctoringEventResponse, ProctoringSummaryResponse, ProctoringEventType, ProctoringUploadStatus } from "./proctoring.types";
import { SessionStatus } from "@prisma/client";

const COOLDOWNS: Record<ProctoringEventType, number> = {
  PHONE_DETECTED: 30000,
  HEADPHONES_DETECTED: 30000,
  BOOK_DETECTED: 30000,
  FACE_MISSING: 15000,
  LOOKING_AWAY: 15000,
  EXCESSIVE_MOVEMENT: 15000,
  MULTIPLE_FACES: 0,
  SEAT_EXIT: 0,
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
   * Persist Proctoring Event metadata after validation and duplicate checks.
   */
  async createEvent(dto: CreateProctoringEventDto) {
    // 1. Session Validation
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${dto.sessionId}`);
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Session is in state ${session.status}. Telemetry events are only accepted for IN_PROGRESS assessments.`,
      );
    }

    // 2. Server-side Duplicate Protection
    const cooldown = COOLDOWNS[dto.eventType] ?? 0;
    if (cooldown > 0) {
      const newTime = new Date(dto.timestamp).getTime();
      const existingEvents = await this.prisma.proctoringEvent.findMany({
        where: {
          sessionId: dto.sessionId,
          eventType: dto.eventType,
        },
      });

      for (const existing of existingEvents) {
        const existingTime = existing.timestamp.getTime();
        if (Math.abs(newTime - existingTime) < cooldown) {
          this.logger.warn(
            `Duplicate proctoring event blocked on backend: ${dto.eventType} for session ${dto.sessionId}`,
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

    return this.prisma.proctoringEvent.create({
      data: {
        sessionId: dto.sessionId,
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
   * Upload video clip to MinIO after validating session.
   */
  async uploadEvidence(
    sessionId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<{ storageRef: string; clipUrl: string }> {
    // Session Validation
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Upload rejected: session is in ${session.status} state. Uploads only allowed for IN_PROGRESS assessments.`,
      );
    }

    const storageRef = `proctoring/${sessionId}/${filename}`;
    this.logger.log(`Uploading evidence clip to ${this.bucketBiometric}/${storageRef}`);

    const success = await this.storage.putObject(
      this.bucketBiometric,
      storageRef,
      fileBuffer,
      { "Content-Type": "video/webm" },
    );

    if (!success) {
      throw new BadRequestException("Failed to upload evidence clip to object storage.");
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
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const events = await this.prisma.proctoringEvent.findMany({
      where: { sessionId },
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
    const events = await this.prisma.proctoringEvent.findMany({
      where: { sessionId },
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
      const recentTabSwitch = await this.prisma.eventLog.findFirst({
        where: {
          sessionId,
          eventType: "TAB_SWITCH",
          occurredAt: { gte: tenSecondsAgo },
        },
      });

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

    return null;
  }
}
