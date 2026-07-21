import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Judge0Service } from "../integrations/judge0/judge0.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { CodingQuestionContentJson } from "./coding.types";
import { SubmissionType, ExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";

import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";

@Injectable()
export class CodingService implements AssessmentModuleEngine {
  readonly moduleType = ModuleType.CODING;

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
  ) {}

  async validateSubmission(submission: any): Promise<boolean> {
    return !!(submission && submission.code && submission.language);
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult> {
    const res = await this.submit({
      sessionId,
      questionId,
      sourceCode: submission.code,
      language: submission.language,
    });
    return {
      status: res.status as any,
      score: res.passedTests / (res.totalTests || 1),
      scoreDetail: res,
      evaluatedAt: new Date(),
    };
  }

  private getQuestionTestCases(content: any): Array<{ input: string; expectedOutput: string; isHidden: boolean; label?: string }> {
    let list: any[] = [];
    if (Array.isArray(content.testCases)) {
      list = content.testCases.map((tc: any) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: !!tc.isHidden,
        label: tc.label,
      }));
    }
    if (Array.isArray(content.hiddenTests)) {
      const hiddenMapped = content.hiddenTests.map((tc: any) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: true,
        label: tc.label || "Hidden Test Case",
      }));
      list = [...list, ...hiddenMapped];
    }
    return list;
  }

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

    const content = question.content as any;
    const allTests = this.getQuestionTestCases(content);
    // Only run visible (sample) tests
    const visibleTests = allTests.filter((t) => !t.isHidden);

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
        totalTests: visibleTests.length,
      },
    });

    // 4. Run execution tests against sample cases
    const result = await this.judge0Service.runTests(
      dto.sourceCode,
      languageId,
      dto.questionId,
      visibleTests,
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
      results: result.results.map((r, idx) => ({
        passed: r.passed,
        status: r.status,
        executionTime: r.executionTime,
        memoryUsage: r.memoryUsage,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
        input: visibleTests[idx]?.input,
        expectedOutput: visibleTests[idx]?.expectedOutput,
        label: visibleTests[idx]?.label || `Test Case ${idx + 1}`,
        isHidden: false,
      })),
    };
  }

  /**
   * Retrieve execution details by ID.
   */
  async getExecution(id: string) {
    const execution = await this.prisma.codingExecution.findUnique({
      where: { id },
      include: { question: true },
    });
    if (!execution) {
      throw new NotFoundException("Execution not found");
    }

    const content = execution.question.content as any;
    const allTests = this.getQuestionTestCases(content);
    const targetTests = execution.submissionType === SubmissionType.RUN
      ? allTests.filter((t) => !t.isHidden)
      : allTests;

    return {
      executionId: execution.id,
      status: execution.status,
      passedTests: execution.passedTests,
      totalTests: execution.totalTests,
      executionTime: execution.executionTime,
      memoryUsage: execution.memoryUsage,
      stdout: execution.stdout || execution.stderr || execution.compileOutput || "",
      results: [], // Polling client relies on RUN/SUBMIT endpoint return value mostly
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

    const content = question.content as any;
    const allTests = this.getQuestionTestCases(content);

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
      languageId,
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

    // 7. Return summary response to frontend (hide details of hidden tests)
    return {
      executionId: updatedExecution.id,
      status: updatedExecution.status,
      passedTests: updatedExecution.passedTests,
      totalTests: updatedExecution.totalTests,
      executionTime: updatedExecution.executionTime,
      memoryUsage: updatedExecution.memoryUsage,
      results: result.results.map((r, idx) => {
        const tc = allTests[idx];
        if (tc?.isHidden) {
          return {
            passed: r.passed,
            status: r.status,
            isHidden: true,
            label: tc.label || `Hidden Case ${idx + 1}`,
          };
        }
        return {
          passed: r.passed,
          status: r.status,
          executionTime: r.executionTime,
          memoryUsage: r.memoryUsage,
          stdout: r.stdout,
          stderr: r.stderr,
          compileOutput: r.compileOutput,
          input: tc?.input,
          expectedOutput: tc?.expectedOutput,
          label: tc?.label || `Test Case ${idx + 1}`,
          isHidden: false,
        };
      }),
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
