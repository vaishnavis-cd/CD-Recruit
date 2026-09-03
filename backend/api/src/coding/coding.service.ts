import { Injectable, NotFoundException, BadRequestException, Logger, MessageEvent } from "@nestjs/common";
import { Request } from "express";
import { Observable } from "rxjs";
import { PrismaService } from "@app/prisma/prisma.service";
import { Judge0Service } from "../integrations/judge0/judge0.service";
import { QaAutomationSandboxService } from "../execution/qa-automation-sandbox.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { CodingQuestionContentJson } from "./coding.types";
import { SubmissionType, ExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";

import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";

import { QueueProviderPort } from "../queue/queue-provider.port";
import { RedisService } from "../common/redis/redis.service";

@Injectable()
export class CodingService implements AssessmentModuleEngine {
  readonly moduleType = ModuleType.CODING;
  private readonly logger = new Logger(CodingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
    private readonly qaAutomationSandboxService: QaAutomationSandboxService,
    private readonly queueProvider: QueueProviderPort,
    private readonly redisService: RedisService,
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
   * Run candidate code against sample test cases only (Asynchronous BullMQ + Webhook pipeline).
   */
  async run(dto: RunCodingDto, req?: Request) {
    const code = dto.sourceCode || dto.code || "";
    this.validateSourceCodePayload(code);

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

    // 4. Pre-seed Redis read-cache for sub-millisecond polling
    await this.redisService.set(
      `execution:${execution.id}`,
      JSON.stringify({
        executionId: execution.id,
        status: ExecutionStatus.PENDING,
        passedTests: 0,
        totalTests: isAutomation ? 1 : visibleTests.length,
        executionTime: null,
        memoryUsage: null,
        stdout: "",
        results: [],
      }),
      300,
    );

    // 5. Enqueue to Inbound Execution Queue
    if (isAutomation) {
      setImmediate(async () => {
        const sandboxRes = await this.qaAutomationSandboxService.runAutomationScript(
          content?.framework || "SELENIUM",
          dto.language || content?.language || "python",
          code,
        );
        await this.prisma.codingExecution.update({
          where: { id: execution.id },
          data: {
            status: sandboxRes.status as any,
            stdout: sandboxRes.stdout,
            stderr: sandboxRes.stderr,
            compileOutput: sandboxRes.compileOutput || "",
            executionTime: sandboxRes.executionTime,
            memoryUsage: sandboxRes.memoryUsage,
            passedTests: sandboxRes.passedTests,
            totalTests: sandboxRes.totalTests,
            completedAt: new Date(),
          },
        });
      });
    } else {
      await this.queueProvider.enqueue("execution-inbound", "run", {
        executionId: execution.id,
        type: "run",
      });
    }

    // 6. Return instant 200 OK PENDING acknowledgment (<25ms)
    return {
      executionId: execution.id,
      status: ExecutionStatus.PENDING,
      passedTests: 0,
      totalTests: isAutomation ? 1 : visibleTests.length,
      executionTime: null,
      memoryUsage: null,
      stdout: "",
      results: [],
    };
  }

  /**
   * Retrieve execution details by ID with sub-millisecond Redis read-cache.
   */
  async getExecution(id: string) {
    // 1. Check Redis read-cache first (sub-millisecond)
    const cached = await this.redisService.get(`execution:${id}`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fallback to DB if JSON parse fails
      }
    }

    // 2. Fallback to PostgreSQL
    const execution = await this.prisma.codingExecution.findUnique({
      where: { id },
      include: { question: true },
    });
    if (!execution) {
      throw new NotFoundException("Execution not found");
    }

    const payload = {
      executionId: execution.id,
      status: execution.status,
      passedTests: execution.passedTests,
      totalTests: execution.totalTests,
      executionTime: execution.executionTime,
      memoryUsage: execution.memoryUsage,
      stdout: execution.stdout || execution.stderr || execution.compileOutput || "",
      results: [],
    };

    if (execution.status !== ExecutionStatus.PENDING) {
      await this.redisService.set(`execution:${id}`, JSON.stringify(payload), 300);
    }

    return payload;
  }

  /**
   * Server-Sent Events (SSE) Unidirectional Webhook Stream for sub-millisecond execution delivery.
   * Utilizes the Cache-First Handshake + Redis Pub/Sub broadcast.
   */
  getExecutionEvents(id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let isClosed = false;

      // 1. Cache-First Handshake: Check if execution is already COMPLETED in Redis cache
      this.redisService.get(`execution:${id}`).then((cached) => {
        if (isClosed) return;

        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (
              parsed.status &&
              parsed.status !== ExecutionStatus.PENDING &&
              parsed.status !== ExecutionStatus.RUNNING
            ) {
              this.logger.log(`[SSE] Cache-first hit for execution ${id}. Emitting instantly.`);
              subscriber.next({ data: parsed } as MessageEvent);
              subscriber.complete();
              return;
            }
          } catch {
            // Fallback to Pub/Sub if parse fails
          }
        }

        // 2. Subscribe to Redis Pub/Sub channel for live worker broadcast
        const subClient = this.redisService.createSubscriberClient();
        if (!subClient) {
          this.logger.warn(`[SSE] Redis subscriber unavailable for execution ${id}`);
          subscriber.error(new Error("Redis subscriber unavailable"));
          return;
        }

        const channel = `execution:events:${id}`;
        subClient.subscribe(channel, (err) => {
          if (err) {
            this.logger.warn(`[SSE] Failed to subscribe to channel ${channel}: ${err.message}`);
            subscriber.error(err);
          }
        });

        subClient.on("message", (ch, message) => {
          if (ch === channel) {
            this.logger.log(`[SSE] Live completion event received for execution ${id}`);
            try {
              const data = JSON.parse(message);
              subscriber.next({ data } as MessageEvent);
            } catch {
              subscriber.next({ data: message } as MessageEvent);
            }
            subscriber.complete();
          }
        });

        // 3. Keep-alive heartbeat interval (every 15s) to prevent intermediate proxy drops
        const heartbeatInterval = setInterval(() => {
          if (!isClosed) {
            subscriber.next({ data: { type: "heartbeat", timestamp: Date.now() } } as MessageEvent);
          }
        }, 15000);

        // 4. Safety timeout (auto-close after 35s)
        const safetyTimeout = setTimeout(() => {
          if (!isClosed) {
            this.logger.log(`[SSE] Stream safety timeout reached for execution ${id}`);
            subscriber.complete();
          }
        }, 35000);

        // 5. Cleanup on stream close / unsubscribe
        return () => {
          isClosed = true;
          clearInterval(heartbeatInterval);
          clearTimeout(safetyTimeout);
          subClient.unsubscribe(channel).catch(() => {});
          subClient.quit().catch(() => {});
        };
      }).catch((err) => {
        this.logger.error(`[SSE] Error during cache lookup for execution ${id}: ${err.message}`);
        subscriber.error(err);
      });
    });
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

    // 3. Pre-seed Redis cache
    await this.redisService.set(
      `execution:${execution.id}`,
      JSON.stringify({
        executionId: execution.id,
        status: "SUBMITTED",
        passedTests: 0,
        totalTests: isAutomation ? 1 : allTests.length,
        executionTime: null,
        memoryUsage: null,
        stdout: "Submission saved successfully. Grading is in progress.",
      }),
      300,
    );

    // 4. Enqueue to Inbound Execution Queue (or background QA for automation)
    if (isAutomation) {
      setImmediate(() => {
        this.gradeSubmissionAsync(execution.id, dto, content).catch((err) =>
          this.logger.error(`Background automation grading error: ${err}`),
        );
      });
    } else {
      await this.queueProvider.enqueue("execution-inbound", "submit", {
        executionId: execution.id,
        type: "submit",
      });
    }

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
