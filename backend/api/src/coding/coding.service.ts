import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Judge0Service } from "../integrations/judge0/judge0.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { CodingQuestionContentJson } from "./coding.types";
import { SubmissionType, ExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";

@Injectable()
export class CodingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
  ) {}

  /**
   * Run candidate code against sample test cases only.
   */
  async run(dto: RunCodingDto) {
    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    // 2. Validate question
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.CODING) {
      throw new NotFoundException("Coding question not found");
    }

    const content = question.content as unknown as CodingQuestionContentJson;
    const sampleTests = content.testCases || [];

    // 3. Create CodingExecution record as PENDING
    const languageId = this.judge0Service.getLanguageId(dto.language);
    const execution = await this.prisma.codingExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        languageId,
        submissionType: SubmissionType.RUN,
        sourceCode: dto.sourceCode,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: sampleTests.length,
      },
    });

    // 4. Execute tests asynchronously/synchronously in background, but wait for it to return response to frontend.
    // Since run is expected to return the result to frontend, we wait for it.
    const result = await this.judge0Service.runTests(
      dto.sourceCode,
      dto.language,
      dto.questionId,
      sampleTests,
    );

    // 5. Update database record with final results
    const updatedExecution = await this.prisma.codingExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status as any,
        stdout: result.stdout,
        stderr: result.stderr,
        compileOutput: result.compileOutput,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        executionTime: result.executionTime,
        memoryUsage: result.memoryUsage,
        completedAt: new Date(),
      },
    });

    // 6. Return response to frontend
    return {
      executionId: updatedExecution.id,
      status: updatedExecution.status,
      passedTests: updatedExecution.passedTests,
      totalTests: updatedExecution.totalTests,
      executionTime: updatedExecution.executionTime,
      memoryUsage: updatedExecution.memoryUsage,
      stdout: updatedExecution.stdout || updatedExecution.stderr || updatedExecution.compileOutput || "",
    };
  }

  /**
   * Retrieve execution details by ID.
   */
  async getExecution(id: string) {
    const execution = await this.prisma.codingExecution.findUnique({
      where: { id },
    });
    if (!execution) {
      throw new NotFoundException("Execution not found");
    }

    return {
      executionId: execution.id,
      status: execution.status,
      passedTests: execution.passedTests,
      totalTests: execution.totalTests,
      executionTime: execution.executionTime,
      memoryUsage: execution.memoryUsage,
      stdout: execution.stdout || execution.stderr || execution.compileOutput || "",
    };
  }

  /**
   * Final submit of candidate code: runs all test cases (sample + hidden) and marks ModuleResponse as completed.
   */
  async submit(dto: SubmitCodingDto) {
    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    // 2. Validate question
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.CODING) {
      throw new NotFoundException("Coding question not found");
    }

    const content = question.content as unknown as CodingQuestionContentJson;
    const sampleTests = content.testCases || [];
    const hiddenTests = content.hiddenTests || [];
    const allTests = [...sampleTests, ...hiddenTests];

    // 3. Create CodingExecution record as PENDING
    const languageId = this.judge0Service.getLanguageId(dto.language);
    const execution = await this.prisma.codingExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        languageId,
        submissionType: SubmissionType.SUBMIT,
        sourceCode: dto.sourceCode,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: allTests.length,
      },
    });

    // 4. Run execution tests against sample + hidden cases
    const result = await this.judge0Service.runTests(
      dto.sourceCode,
      dto.language,
      dto.questionId,
      allTests,
    );

    // 5. Update database record with final results
    const updatedExecution = await this.prisma.codingExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status as any,
        stdout: result.stdout,
        stderr: result.stderr,
        compileOutput: result.compileOutput,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        executionTime: result.executionTime,
        memoryUsage: result.memoryUsage,
        completedAt: new Date(),
      },
    });

    // 6. Save final response in ModuleResponse
    const responsePayload = {
      moduleType: ModuleType.CODING,
      code: dto.sourceCode,
      language: dto.language,
    };

    await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
      update: {
        responsePayload: responsePayload as any,
        isDraft: false,
        timeSpentSeconds: dto.timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
      create: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        responsePayload: responsePayload as any,
        isDraft: false,
        timeSpentSeconds: dto.timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
    });

    // 7. Return summary response to frontend (no stdout/stderr/compileOutput returned to candidate to prevent reverse engineering of hidden tests)
    return {
      executionId: updatedExecution.id,
      status: updatedExecution.status,
      passedTests: updatedExecution.passedTests,
      totalTests: updatedExecution.totalTests,
      executionTime: updatedExecution.executionTime,
      memoryUsage: updatedExecution.memoryUsage,
    };
  }

  /**
   * Save draft version of candidate code.
   */
  async draft(dto: DraftCodingDto) {
    // Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    const responsePayload = {
      moduleType: ModuleType.CODING,
      code: dto.sourceCode,
      language: dto.language,
    };

    await this.prisma.moduleResponse.upsert({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
      update: {
        responsePayload: responsePayload as any,
        isDraft: true,
        timeSpentSeconds: dto.timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
      create: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        responsePayload: responsePayload as any,
        isDraft: true,
        timeSpentSeconds: dto.timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
    });

    return { success: true };
  }
}
