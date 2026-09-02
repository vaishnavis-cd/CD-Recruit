import { Injectable, Logger, Optional, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SubmitTestScenarioDto } from "./dto/test-scenarios.dto";
import { SessionStatus, ModuleType, ExecutionStatus } from "@cd-recruit/shared-types";
import { AiEvaluationService } from "../integrations/ai/ai-evaluation.service";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";

@Injectable()
export class TestScenariosService implements AssessmentModuleEngine, OnModuleInit {
  readonly moduleType = ModuleType.TEST_SCENARIOS;
  private readonly logger = new Logger(TestScenariosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEvaluation: AiEvaluationService,
    @Optional() private readonly engineRegistry?: AssessmentEngineRegistry,
  ) {}

  onModuleInit() {
    this.engineRegistry?.registerEngine(this);
  }

  async validateSubmission(submission: any): Promise<boolean> {
    return !!(submission && (submission.answer || submission.text || submission.response));
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult> {
    const answer = submission.answer || submission.text || submission.response || "";
    const result = await this.submit({
      sessionId,
      questionId,
      answer,
      timeSpentSeconds: submission.timeSpentSeconds,
    });

    const score =
      result.evaluation?.overallScore !== undefined && result.evaluation?.overallScore !== null
        ? Math.max(0.0, Math.min(1.0, result.evaluation.overallScore / 100))
        : 0.0;

    return {
      status: ExecutionStatus.COMPLETED,
      score,
      scoreDetail: result.evaluation || {},
      evaluatedAt: new Date(),
    };
  }

  async submit(dto: SubmitTestScenarioDto) {
    const { sessionId, questionId, answer, timeSpentSeconds } = dto;

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

    let question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      try {
        question = await this.prisma.question.create({
          data: {
            id: questionId,
            moduleType: "TEST_SCENARIOS" as any,
            content: { prompt: "Test Scenario", expectedAnswer: "" },
            role: "General",
            tags: [],
          },
        });
      } catch {
        question = await this.prisma.question.findUnique({ where: { id: questionId } });
      }
    }

    const qContent = (question?.content as any) || {};
    const expectedAnswer = qContent.expectedAnswer || "";
    const promptText = qContent.prompt || qContent.question || "Test Scenario";

    // 1. Run LLM evaluation asynchronously/synchronously
    let evaluationResult: any = null;
    try {
      const evalRes = await this.aiEvaluation.evaluateTestScenarioResponse(
        promptText,
        expectedAnswer,
        answer,
      );
      if (evalRes && typeof evalRes.score === "number") {
        evaluationResult = {
          overallScore: evalRes.score,
          reasoning: evalRes.reasoning,
          feedback: evalRes.feedback,
          providerUsed: evalRes.providerUsed,
        };
      }
    } catch (err: any) {
      this.logger.warn(`LLM Scenario Evaluation failed: ${err.message}`);
    }

    const responsePayload = {
      moduleType: "TEST_SCENARIOS",
      answer,
      evaluation: evaluationResult,
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
        isDraft: false,
        timeSpentSeconds: timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
      create: {
        sessionId,
        questionId,
        responsePayload: responsePayload as any,
        isDraft: false,
        timeSpentSeconds: timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
    });

    return { success: true, responseId: response.id, evaluation: evaluationResult };
  }
}
