import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "@app/prisma/prisma.service";
import { Judge0Service } from "../integrations/judge0/judge0.service";
import { QaAutomationSandboxService } from "../execution/qa-automation-sandbox.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { CodingQuestionContentJson } from "./coding.types";
import { SubmissionType, ExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";

import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";

@Injectable()
export class CodingService implements AssessmentModuleEngine {
  readonly moduleType = ModuleType.CODING;
  private readonly logger = new Logger(CodingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
    private readonly qaAutomationSandboxService: QaAutomationSandboxService,
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
  async run(dto: RunCodingDto, req?: Request) {
    const code = dto.sourceCode || dto.code || "";
    this.validateSourceCodePayload(code);

    let isCancelled = false;
    if (req) {
      req.on("aborted", () => {
        if (!isCancelled) {
          isCancelled = true;
          this.logger.log(`[Run Cancelled] Client aborted connection for session ${dto.sessionId}, question ${dto.questionId}`);
        }
      });
    }

    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status === SessionStatus.NOT_STARTED || session.status === SessionStatus.AUTO_SUBMITTED) {
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

    if (isCancelled || (req as any)?.aborted) {
      this.logger.log(`[Run Aborted] Halting execution setup for cancelled session ${dto.sessionId}`);
      throw new BadRequestException("Run request cancelled by client");
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
        sourceCode: code,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: isAutomation ? 1 : visibleTests.length,
      },
    });

    if (isCancelled || (req as any)?.aborted) {
      this.logger.log(`[Run Aborted] Client disconnected after execution record creation ${execution.id}`);
      await this.prisma.codingExecution.update({
        where: { id: execution.id },
        data: { status: ExecutionStatus.RUNTIME_ERROR as any, stderr: "Run cancelled by client", completedAt: new Date() },
      });
      throw new BadRequestException("Run request cancelled by client");
    }

    // 4. Run execution tests (Route to QA Automation Sandbox for AUTOMATION, Judge0 for ALGORITHM)
    let result: any;
    if (isAutomation) {
      const sandboxRes = await this.qaAutomationSandboxService.runAutomationScript(
        content?.framework || "SELENIUM",
        dto.language || content?.language || "python",
        code,
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
        code,
        languageId,
        dto.questionId,
        visibleTests,
      );
    }

    if (isCancelled || (req as any)?.aborted) {
      this.logger.log(`[Run Aborted] Client disconnected before returning results for execution ${execution.id}`);
      await this.prisma.codingExecution.update({
        where: { id: execution.id },
        data: { status: ExecutionStatus.RUNTIME_ERROR as any, stderr: "Run cancelled by client", completedAt: new Date() },
      });
      throw new BadRequestException("Run request cancelled by client");
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

    const content = execution.question.content as any;
    const allTests = this.getQuestionTestCases(content, execution.submissionType as SubmissionType);
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
   * Fast DB-only submission write. Saves final candidate code to ModuleResponse as isDraft: false.
   * Zero Judge0 calls involved. (Fix D)
   */
  async saveFinalSubmission(dto: SubmitCodingDto) {
    const code = dto.sourceCode || dto.code || "";
    this.validateSourceCodePayload(code);

    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException(`Session is not in progress (current status: ${session.status})`);
    }

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || (question.moduleType !== ModuleType.CODING && question.moduleType !== ModuleType.DEBUGGING)) {
      throw new NotFoundException("Coding/Debugging question not found");
    }

    const responsePayload = {
      moduleType: question.moduleType,
      code,
      sourceCode: code,
      language: dto.language,
      status: "SUBMITTED",
    };

    const moduleResponse = await this.prisma.moduleResponse.upsert({
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

    return { session, question, moduleResponse, code };
  }

  /**
   * Standalone, decoupled grading trigger for an existing submission execution. (Fix D)
   */
  async gradeSubmissionAsync(executionId: string, dto: SubmitCodingDto, content: any): Promise<void> {
    try {
      const code = dto.sourceCode || dto.code || "";
      const isAutomation = content?.category === "AUTOMATION";
      const allTests = this.getQuestionTestCases(content, SubmissionType.SUBMIT);
      const languageId = isAutomation ? 99 : (dto.language ? this.judge0Service.getLanguageId(dto.language) : 71);

      let result: any;
      if (isAutomation) {
        const sandboxRes = await this.qaAutomationSandboxService.runAutomationScript(
          content?.framework || "SELENIUM",
          dto.language || content?.language || "python",
          code,
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
          code,
          languageId,
          dto.questionId,
          allTests,
        );
      }

      await this.prisma.codingExecution.update({
        where: { id: executionId },
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

      const existing = await this.prisma.moduleResponse.findUnique({
        where: {
          sessionId_questionId: {
            sessionId: dto.sessionId,
            questionId: dto.questionId,
          },
        },
      });

      if (existing) {
        const currentPayload = (existing.responsePayload as any) || {};
        await this.prisma.moduleResponse.update({
          where: { id: existing.id },
          data: {
            responsePayload: {
              ...currentPayload,
              status: result.status,
              passedTests: result.passedTests,
              totalTests: result.totalTests,
              stdout: result.stdout,
            },
          },
        });
      }
    } catch (err: any) {
      this.logger.error(`[Async Grading Failed] Execution ${executionId} error: ${err?.message || err}`);
      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.RUNTIME_ERROR as any,
          stderr: err?.message || "Grading execution failed",
          completedAt: new Date(),
        },
      }).catch((e) => this.logger.warn(`Failed updating failed execution: ${e}`));
    }
  }

  /**
   * Final submit of candidate code: saves submission to DB immediately and triggers decoupled grading in background. (Fix D)
   */
  async submit(dto: SubmitCodingDto) {
    const code = dto.sourceCode || dto.code || "";
    // 1. Fast DB write — save candidate code immediately without Judge0 dependency
    const { question } = await this.saveFinalSubmission(dto);

    const content = question.content as any;
    const isAutomation = content?.category === "AUTOMATION";
    const allTests = this.getQuestionTestCases(content, SubmissionType.SUBMIT);
    const languageId = isAutomation ? 99 : (dto.language ? this.judge0Service.getLanguageId(dto.language) : 71);

    // 2. Create CodingExecution record as PENDING
    const execution = await this.prisma.codingExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        languageId,
        submissionType: SubmissionType.SUBMIT,
        sourceCode: code,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: isAutomation ? 1 : allTests.length,
      },
    });

    // 3. Trigger decoupled grading in background (non-blocking) with high-visibility failure alerting
    setImmediate(() => {
      this.gradeSubmissionAsync(execution.id, dto, content).catch(async (err) => {
        this.logger.error(
          `[INTERIM_ASYNC_GRADING_ALERT] Critical: Unhandled failure in background grading for execution ${execution.id} (session ${dto.sessionId}): ${err?.message || err}`,
        );
        try {
          await this.prisma.codingExecution.update({
            where: { id: execution.id },
            data: {
              status: ExecutionStatus.FAILED as any,
              stderr: `Async grading error: ${err?.message || err}`,
              completedAt: new Date(),
            },
          });
        } catch (dbErr) {
          this.logger.error(`Failed to record failed status for execution ${execution.id}: ${dbErr}`);
        }
      });
    });

    // 4. Return instant submission receipt confirmation to candidate
    return {
      executionId: execution.id,
      status: "SUBMITTED",
      passedTests: 0,
      totalTests: isAutomation ? 1 : allTests.length,
      executionTime: null,
      memoryUsage: null,
      stdout: "Submission saved successfully. Grading is in progress.",
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
  private validateSourceCodePayload(sourceCode: string): void {
    if (!sourceCode) return;

    // 1. Max Payload Length (64 KB)
    if (sourceCode.length > 65536) {
      throw new BadRequestException("Source code payload exceeds maximum allowable length of 64 KB.");
    }

    // 2. Scan for malicious system exfiltration attempts
    const lower = sourceCode.toLowerCase();
    const blacklisted = [
      "process.env",
      "os.environ",
      "system.getenv",
      "/etc/passwd",
      "/etc/shadow",
      "cat /etc",
    ];

    for (const token of blacklisted) {
      if (lower.includes(token)) {
        throw new BadRequestException(
          `Submission rejected: Usage of forbidden system inspection keyword ("${token}") is restricted for platform security.`,
        );
      }
    }
  }
}
