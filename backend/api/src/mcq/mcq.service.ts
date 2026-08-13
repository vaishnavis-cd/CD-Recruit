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
    let session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: { OR: [{ token: sessionId }, { id: sessionId }] },
        include: { session: true },
      });
      if (invite?.session) session = invite.session;
    }
    if (!session) {
      try {
        let roleTemplate = await this.prisma.roleTemplate.findFirst();
        if (!roleTemplate) roleTemplate = await this.prisma.roleTemplate.create({ data: { roleName: "Dev", durationMinutes: 60, weightingPreset: {} } });
        let candidate = await this.prisma.candidate.findFirst({ where: { email: `${sessionId}@example.com` } });
        if (!candidate) candidate = await this.prisma.candidate.create({ data: { email: `${sessionId}@example.com`, name: sessionId === "demo-session" ? "Demo Candidate" : `Candidate-${sessionId.slice(0, 8)}` } });
        session = await this.prisma.session.upsert({
          where: { id: sessionId },
          update: {},
          create: {
            id: sessionId,
            candidate: { connect: { id: candidate.id } },
            roleTemplate: { connect: { id: roleTemplate.id } },
            status: SessionStatus.IN_PROGRESS as any,
            cvMode: "FACE_ONLY" as any,
          },
        });
      } catch {
        session = await this.prisma.session.findUnique({ where: { id: sessionId } });
      }
    }

    let question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      try {
        question = await this.prisma.question.create({
          data: { id: questionId, moduleType: ModuleType.MCQ as any, content: { options: selectedOptions }, role: "General", tags: [] },
        });
      } catch {
        question = await this.prisma.question.findUnique({ where: { id: questionId } });
      }
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
