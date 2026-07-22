import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SubmitMcqDto, DraftMcqDto } from "./dto/mcq.dto";
import { SessionStatus, ModuleType } from "@cd-recruit/shared-types";

@Injectable()
export class McqService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(dto: SubmitMcqDto) {
    return this.saveResponse(dto.sessionId, dto.questionId, dto.selectedOptions, false, dto.timeSpentSeconds);
  }

  async draft(dto: DraftMcqDto) {
    return this.saveResponse(dto.sessionId, dto.questionId, dto.selectedOptions, true, dto.timeSpentSeconds);
  }

  private async saveResponse(
    sessionId: string,
    questionId: string,
    selectedOptions: string[],
    isDraft: boolean,
    timeSpentSeconds?: number,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.moduleType !== ModuleType.MCQ) {
      throw new NotFoundException("MCQ question not found");
    }

    const responsePayload = {
      moduleType: ModuleType.MCQ,
      selectedOptions,
    };

    const response = await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: {
          sessionId,
          questionId,
        },
      },
      update: {
        responsePayload: responsePayload as any,
        isDraft,
        timeSpentSeconds: timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
      create: {
        sessionId,
        questionId,
        responsePayload: responsePayload as any,
        isDraft,
        timeSpentSeconds: timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
    });

    return { success: true, responseId: response.id };
  }
}
