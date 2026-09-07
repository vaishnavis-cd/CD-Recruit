import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SubmitMcqDto, DraftMcqDto } from "./dto/mcq.dto";
import { SessionStatus, ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";

@Injectable()
export class McqService implements AssessmentModuleEngine, OnModuleInit {
  readonly moduleType = ModuleType.MCQ;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly engineRegistry?: AssessmentEngineRegistry,
  ) {}

  onModuleInit() {
    this.engineRegistry?.registerEngine(this);
  }

  async validateSubmission(submission: any): Promise<boolean> {
    if (!submission || typeof submission !== "object") return false;
    return !!(
      Array.isArray(submission.selectedOptions) ||
      typeof submission.selectedOption === "string" ||
      typeof submission.answer === "string"
    );
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult> {
    const rawOptions =
      submission.selectedOptions ??
      (submission.selectedOption ? [submission.selectedOption] : submission.answer ? [submission.answer] : []);
    const selectedOptions = Array.isArray(rawOptions) ? rawOptions.map(String) : [String(rawOptions)];

    await this.submit({
      sessionId,
      questionId,
      selectedOptions,
      timeSpentSeconds: submission.timeSpentSeconds,
    });

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });

    const content = (question?.content || {}) as any;
    const correctAnswer = content.correctAnswer || content.answer || "";
    const correctOptions: string[] = Array.isArray(content.correctOptions)
      ? content.correctOptions.map(String)
      : correctAnswer
      ? [String(correctAnswer)]
      : [];

    let isCorrect = false;
    if (correctOptions.length > 0) {
      const candNorm = selectedOptions.map((o: any) => String(o).trim().toLowerCase()).sort();
      const corrNorm = correctOptions.map((o: any) => String(o).trim().toLowerCase()).sort();
      isCorrect =
        candNorm.length === corrNorm.length &&
        candNorm.every((val: string, idx: number) => val === corrNorm[idx]);
    }

    const score = isCorrect ? 1.0 : 0.0;

    return {
      status: ExecutionStatus.COMPLETED,
      score,
      scoreDetail: {
        isCorrect,
        selectedOptions,
        correctOptions,
      },
      evaluatedAt: new Date(),
    };
  }

  async submit(dto: SubmitMcqDto) {
    return this.saveResponse(dto.sessionId, dto.questionId, dto.selectedOptions || [], false, dto.timeSpentSeconds);
  }

  async draft(dto: DraftMcqDto) {
    return this.saveResponse(dto.sessionId, dto.questionId, dto.selectedOptions || [], true, dto.timeSpentSeconds);
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
      const isDemoOrDev =
        sessionId === "demo-session" ||
        sessionId.startsWith("demo-") ||
        process.env.ALLOW_SYNTHETIC_SESSIONS === "true" ||
        process.env.NODE_ENV === "test";

      if (isDemoOrDev) {
        try {
          let roleTemplate = await this.prisma.roleTemplate.findFirst();
          if (!roleTemplate) {
            roleTemplate = await this.prisma.roleTemplate.create({
              data: { roleName: "Dev", durationMinutes: 60, weightingPreset: {} },
            });
          }
          let candidate = await this.prisma.candidate.findFirst({ where: { email: `${sessionId}@example.com` } });
          if (!candidate) {
            candidate = await this.prisma.candidate.create({
              data: {
                email: `${sessionId}@example.com`,
                name: sessionId === "demo-session" ? "Demo Candidate" : `Candidate-${sessionId.slice(0, 8)}`,
              },
            });
          }
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
      } else {
        throw new NotFoundException(`Session not found with ID ${sessionId}`);
      }
    }

    if (
      session &&
      (session.status === SessionStatus.AUTO_SUBMITTED ||
        session.status === SessionStatus.CLOSED ||
        session.status === SessionStatus.ABANDONED)
    ) {
      throw new BadRequestException(`Cannot update MCQ response for session in status ${session.status}`);
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
