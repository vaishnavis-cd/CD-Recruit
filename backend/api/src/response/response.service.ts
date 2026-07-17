import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SessionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@app/prisma/prisma.service";
import { DraftResponseDto, SubmitResponseDto } from "./dto/response.dto";

@Injectable()
export class ResponseService {
  private readonly logger = new Logger(ResponseService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async validateSessionAndOwnership(
    sessionId: string,
    questionId: string,
  ) {
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
        message: "Cannot save or submit responses when session is not IN_PROGRESS.",
      });
    }

    if (!session.driveId) {
      throw new UnprocessableEntityException({
        code: "NO_DRIVE_ASSIGNED",
        message: "Session has no assigned drive.",
      });
    }

    // Validate question ownership: Session → Drive → DriveQuestion → Question
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

    return session;
  }

  async saveDraft(
    sessionId: string,
    dto: DraftResponseDto,
  ): Promise<{ ok: boolean }> {
    await this.validateSessionAndOwnership(sessionId, dto.questionId);

    const existing = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: { sessionId, questionId: dto.questionId },
      },
    });

    if (existing && existing.isDraft === false) {
      throw new UnprocessableEntityException({
        code: "RESPONSE_ALREADY_SUBMITTED",
        message: "Cannot modify a response that has already been submitted.",
      });
    }

    await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: { sessionId, questionId: dto.questionId },
      },
      update: {
        responsePayload: dto.content as Prisma.InputJsonValue,
        isDraft: true,
        lastAutosavedAt: new Date(),
      },
      create: {
        sessionId,
        questionId: dto.questionId,
        responsePayload: dto.content as Prisma.InputJsonValue,
        isDraft: true,
        lastAutosavedAt: new Date(),
      },
    });

    this.logger.debug(
      `Draft saved — session=${sessionId} question=${dto.questionId}`,
    );

    return { ok: true };
  }

  async submitResponse(
    sessionId: string,
    dto: SubmitResponseDto,
  ): Promise<{ ok: boolean; score?: number | null }> {
    await this.validateSessionAndOwnership(sessionId, dto.questionId);

    const existing = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: { sessionId, questionId: dto.questionId },
      },
    });

    if (existing && existing.isDraft === false) {
      throw new UnprocessableEntityException({
        code: "RESPONSE_ALREADY_SUBMITTED",
        message: "This response has already been submitted and cannot be changed.",
      });
    }

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });

    if (!question) {
      throw new NotFoundException({
        code: "QUESTION_NOT_FOUND",
        message: "Question not found.",
      });
    }

    let score: number | null = null;

    if (dto.moduleType === "MCQ" && question.scoringConfig) {
      const config = question.scoringConfig as Record<string, unknown>;
      const correctIndex = config["correctIndex"] as number | undefined;
      const selectedIndex = (dto.content as Record<string, unknown>)[
        "selectedIndex"
      ] as number | undefined;

      if (correctIndex !== undefined && selectedIndex !== undefined) {
        score = selectedIndex === correctIndex ? 1 : 0;
      }
    }

    await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: { sessionId, questionId: dto.questionId },
      },
      update: {
        responsePayload: dto.content as Prisma.InputJsonValue,
        isDraft: false,
        lastAutosavedAt: new Date(),
      },
      create: {
        sessionId,
        questionId: dto.questionId,
        responsePayload: dto.content as Prisma.InputJsonValue,
        isDraft: false,
        lastAutosavedAt: new Date(),
      },
    });

    this.logger.log(
      `Response submitted — session=${sessionId} question=${dto.questionId} ` +
        `moduleType=${dto.moduleType} score=${score ?? "n/a"}`,
    );

    return { ok: true, score };
  }
}
