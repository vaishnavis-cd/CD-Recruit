import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Optional } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";
import { Judge0Service } from "../integrations/judge0/judge0.service";
import { QaAutomationSandboxService } from "../execution/qa-automation-sandbox.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { CodingQuestionContentJson } from "./coding.types";
import { SubmissionType, ExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";

@Injectable()
export class CodingService implements AssessmentModuleEngine, OnModuleInit {
  readonly moduleType = ModuleType.CODING;

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
    private readonly qaAutomationSandboxService: QaAutomationSandboxService,
    @Optional() private readonly engineRegistry?: AssessmentEngineRegistry,
  ) {}

  onModuleInit() {
    this.engineRegistry?.registerEngine(this);
  }

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

  private getQuestionTestCases(
    content: any,
    type: SubmissionType,
  ): Array<{ input: string; expectedOutput: string; isHidden: boolean; label?: string }> {
    let list: any[] = [];
    if (Array.isArray(content.visibleTestCases)) {
      list = content.visibleTestCases.map((tc: any) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: false,
        label: tc.label || "Visible Test Case",
      }));
    } else if (Array.isArray(content.testCases)) {
      list = content.testCases
        .filter((tc: any) => !tc.isHidden)
        .map((tc: any) => ({
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          isHidden: false,
          label: tc.label || "Visible Test Case",
        }));
    }

    if (type === SubmissionType.SUBMIT) {
      if (Array.isArray(content.hiddenTestCases)) {
        const hiddenMapped = content.hiddenTestCases.map((tc: any) => ({
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          isHidden: true,
          label: tc.label || "Hidden Test Case",
        }));
        list = [...list, ...hiddenMapped];
      } else if (Array.isArray(content.hiddenTests)) {
        const hiddenMapped = content.hiddenTests.map((tc: any) => ({
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          isHidden: true,
          label: tc.label || "Hidden Test Case",
        }));
        list = [...list, ...hiddenMapped];
      } else if (Array.isArray(content.testCases)) {
        const hiddenMapped = content.testCases
          .filter((tc: any) => tc.isHidden)
          .map((tc: any) => ({
            input: tc.input || "",
            expectedOutput: tc.expectedOutput || "",
            isHidden: true,
            label: tc.label || "Hidden Test Case",
          }));
        list = [...list, ...hiddenMapped];
      }
    }
    return list;
  }

  /**
   * Run candidate code against sample test cases only.
   */
  async run(dto: RunCodingDto) {
    this.validateSourceCodePayload(dto.sourceCode);

    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (
      session.status === SessionStatus.SUBMITTED ||
      session.status === SessionStatus.AUTO_SUBMITTED ||
      session.status === SessionStatus.CLOSED ||
      session.status === SessionStatus.ABANDONED
    ) {
      throw new BadRequestException(`Session is already ${session.status.toLowerCase()} and cannot accept new code runs.`);
    }
    if (session.status === SessionStatus.NOT_STARTED) {
      const now = new Date();
      await this.prisma.session.update({
        where: { id: dto.sessionId },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: session.startedAt || now },
      });
      session.status = SessionStatus.IN_PROGRESS;
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException(`Session is not in progress (current status: ${session.status})`);
    }

    // 2. Validate question
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || (question.moduleType !== ModuleType.CODING && question.moduleType !== ModuleType.DEBUGGING)) {
      throw new NotFoundException("Coding/Debugging question not found");
    }

    const content = question.content as any;
    const isAutomation = content?.category === "AUTOMATION";
    const visibleTests = this.getQuestionTestCases(content, SubmissionType.RUN);

    // 3. Create CodingExecution record as PENDING
    const languageId = isAutomation ? 99 : this.judge0Service.getLanguageId(dto.language);
    const execution = await this.prisma.codingExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        languageId,
        submissionType: SubmissionType.RUN,
        sourceCode: dto.sourceCode,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: isAutomation ? 1 : visibleTests.length,
      },
    });

    // 4. Run execution tests (Route to QA Automation Sandbox for AUTOMATION, Judge0 for ALGORITHM)
    let result: any;
    try {
      if (isAutomation) {
        const sandboxRes = await this.qaAutomationSandboxService.runAutomationScript(
          content?.framework || "SELENIUM",
          dto.language || content?.language || "python",
          dto.sourceCode,
        );
        result = {
          status: sandboxRes.status,
          passedTests: sandboxRes.passedTests,
          totalTests: sandboxRes.totalTests,
          stdout: sandboxRes.stdout,
          stderr: sandboxRes.stderr,
          compileOutput: sandboxRes.compileOutput || "",
          executionTime: sandboxRes.executionTime,
          memoryUsage: sandboxRes.memoryUsage,
          results: [
            {
              passed: sandboxRes.status === ExecutionStatus.COMPLETED,
              status: sandboxRes.status,
              executionTime: sandboxRes.executionTime,
              memoryUsage: sandboxRes.memoryUsage,
              stdout: sandboxRes.stdout,
              stderr: sandboxRes.stderr,
            },
          ],
        };
      } else {
        result = await this.judge0Service.runTests(
          dto.sourceCode,
          languageId,
          dto.questionId,
          visibleTests,
        );
      }
    } catch (err: any) {
      await this.prisma.codingExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          stderr: err.message || "Execution runner failed",
          completedAt: new Date(),
        },
      });
      throw err;
    }

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
      results: result.results.map((r: any, idx: number) => ({
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

    return {
      executionId: execution.id,
      status: execution.status,
      passedTests: execution.passedTests,
      totalTests: execution.totalTests,
      executionTime: execution.executionTime,
      memoryUsage: execution.memoryUsage,
      stdout: execution.stdout || execution.stderr || execution.compileOutput || "",
      results: [],
    };
  }

  /**
   * Final submit of candidate code: runs all test cases (sample + hidden) and marks ModuleResponse as completed.
   */
  async submit(dto: SubmitCodingDto) {
    this.validateSourceCodePayload(dto.sourceCode);

    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (
      session.status === SessionStatus.SUBMITTED ||
      session.status === SessionStatus.AUTO_SUBMITTED ||
      session.status === SessionStatus.CLOSED ||
      session.status === SessionStatus.ABANDONED
    ) {
      throw new BadRequestException(`Session is already ${session.status.toLowerCase()} and cannot accept new submissions.`);
    }
    if (session.status === SessionStatus.NOT_STARTED) {
      const now = new Date();
      await this.prisma.session.update({
        where: { id: dto.sessionId },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: now },
      });
      session.status = SessionStatus.IN_PROGRESS;
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException(`Session is not in progress (current status: ${session.status})`);
    }

    // 2. Validate question
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || (question.moduleType !== ModuleType.CODING && question.moduleType !== ModuleType.DEBUGGING)) {
      throw new NotFoundException("Coding/Debugging question not found");
    }

    const content = question.content as any;
    const isAutomation = content?.category === "AUTOMATION";
    const allTests = this.getQuestionTestCases(content, SubmissionType.SUBMIT);

    // 3. Create CodingExecution record as PENDING
    const languageId = isAutomation ? 99 : this.judge0Service.getLanguageId(dto.language);
    const execution = await this.prisma.codingExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        languageId,
        submissionType: SubmissionType.SUBMIT,
        sourceCode: dto.sourceCode,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: isAutomation ? 1 : allTests.length,
      },
    });

    // 4. Run execution tests (Route to QA Automation Sandbox for AUTOMATION, Judge0 for ALGORITHM)
    let result: any;
    try {
      if (isAutomation) {
        const sandboxRes = await this.qaAutomationSandboxService.runAutomationScript(
          content?.framework || "SELENIUM",
          dto.language || content?.language || "python",
          dto.sourceCode,
        );
        result = {
          status: sandboxRes.status,
          passedTests: sandboxRes.passedTests,
          totalTests: sandboxRes.totalTests,
          stdout: sandboxRes.stdout,
          stderr: sandboxRes.stderr,
          compileOutput: sandboxRes.compileOutput || "",
          executionTime: sandboxRes.executionTime,
          memoryUsage: sandboxRes.memoryUsage,
        };
      } else {
        result = await this.judge0Service.runTests(
          dto.sourceCode,
          languageId,
          dto.questionId,
          allTests,
        );
      }
    } catch (err: any) {
      await this.prisma.codingExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          stderr: err.message || "Execution runner failed",
          completedAt: new Date(),
        },
      });
      throw err;
    }

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
      moduleType: question.moduleType,
      code: dto.sourceCode,
      sourceCode: dto.sourceCode,
      language: dto.language,
      status: result.status,
      passedTests: result.passedTests,
      totalTests: result.totalTests,
      stdout: result.stdout,
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
      results: result.results.map((r: any, idx: number) => {
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
    if (
      session.status === SessionStatus.SUBMITTED ||
      session.status === SessionStatus.AUTO_SUBMITTED ||
      session.status === SessionStatus.CLOSED ||
      session.status === SessionStatus.ABANDONED
    ) {
      throw new BadRequestException(`Session is already ${session.status.toLowerCase()} and cannot accept drafts.`);
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });

    const responsePayload = {
      moduleType: question?.moduleType || ModuleType.CODING,
      code: dto.sourceCode,
      sourceCode: dto.sourceCode,
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

    return { status: "saved" };
  }

  /**
   * Security Guardrails: Validate candidate source code length and scan for blacklisted exfiltration patterns.
   */
  private validateSourceCodePayload(sourceCode?: string): void {
    if (!sourceCode) return;

    // 1. Max Payload Length (64 KB)
    if (sourceCode.length > 65536) {
      throw new BadRequestException("Source code payload exceeds maximum allowable length of 64 KB.");
    }

    // Strip single-line (//, #) and multi-line (/* */) comments to avoid false-positives in candidate explanations
    const sanitized = sourceCode
      .replace(/\/\*[\s\S]*?\*\//g, "") // C/JS/Java multi-line comments
      .replace(/\/\/.*$/gm, "")         // C/JS/Java single-line comments
      .replace(/#.*$/gm, "")            // Python single-line comments
      .toLowerCase();

    // 2. Scan for malicious system exfiltration attempts
    const blacklisted = [
      "process.env",
      "os.environ",
      "system.getenv",
      "/etc/passwd",
      "/etc/shadow",
      "cat /etc",
    ];

    for (const token of blacklisted) {
      if (sanitized.includes(token)) {
        throw new BadRequestException(
          `Submission rejected: Usage of forbidden system inspection keyword ("${token}") is restricted for platform security.`,
        );
      }
    }
  }
}
