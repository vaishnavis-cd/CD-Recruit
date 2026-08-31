import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "@app/prisma/prisma.service";
import { Judge0Service } from "../../integrations/judge0/judge0.service";
import { RedisService } from "../../common/redis/redis.service";
import { ExecutionStatus, SubmissionType } from "@cd-recruit/shared-types";

@Processor("execution-outbound", { concurrency: 20 })
@Injectable()
export class OutboundExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
    private readonly redisService: RedisService,
  ) {
    super();
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

  async process(job: Job<{ executionId: string; judge0Results: any[] }>): Promise<void> {
    const { executionId, judge0Results } = job.data;
    this.logger.log(`[OutboundExecutionProcessor] Processing results for execution ${executionId}`);

    const execution = await this.prisma.codingExecution.findUnique({
      where: { id: executionId },
      include: { question: true },
    });

    if (!execution) {
      this.logger.warn(`Execution ${executionId} not found`);
      return;
    }

    const content = (execution.question?.content as any) || {};
    const testCases = this.getQuestionTestCases(content, execution.submissionType as SubmissionType);

    // Map token to test case
    const resultsMap = new Map<string, any>();
    for (const r of judge0Results) {
      if (r && r.token) {
        resultsMap.set(r.token, r);
      }
    }

    const tokens = (execution.judge0Tokens as string[]) || [];

    const detailedResults = testCases.map((tc, idx) => {
      const token = tokens[idx];
      const response = (token ? resultsMap.get(token) : null) || judge0Results[idx];

      if (!response || !response.status) {
        return {
          passed: false,
          status: ExecutionStatus.FAILED,
          executionTime: 0,
          memoryUsage: 0,
          stdout: "",
          stderr: "Missing test case result",
          compileOutput: "",
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          label: tc.label || `Test Case ${idx + 1}`,
          isHidden: tc.isHidden,
        };
      }

      const mappedStatus = this.judge0Service.mapStatus(response.status.id, response.status.description);
      const decodedStdout = this.judge0Service.decodeBase64(response.stdout).trim();
      const decodedStderr = this.judge0Service.decodeBase64(response.stderr).trim();
      const decodedCompile = this.judge0Service.decodeBase64(response.compile_output).trim();

      const timeInSec = parseFloat(response.time || "0");
      const timeInMs = Math.round(timeInSec * 1000);
      const memoryInKb = response.memory || 0;

      let passed = false;
      if (mappedStatus === ExecutionStatus.COMPLETED) {
        const normOut = this.judge0Service.normalizeOutput(decodedStdout);
        const normExp = this.judge0Service.normalizeOutput(tc.expectedOutput);
        passed = normOut === normExp;
      }

      return {
        passed,
        status: mappedStatus,
        executionTime: timeInMs,
        memoryUsage: memoryInKb,
        stdout: decodedStdout,
        stderr: decodedStderr,
        compileOutput: decodedCompile,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        label: tc.label || `Test Case ${idx + 1}`,
        isHidden: tc.isHidden,
      };
    });

    let totalTime = 0;
    let maxMemory = 0;
    let passedCount = 0;
    let overallStatus = ExecutionStatus.COMPLETED;
    let firstStderr = "";
    let firstStdout = "";
    let firstCompile = "";

    const statusPrecedence = [
      ExecutionStatus.FAILED,
      ExecutionStatus.MEMORY_LIMIT,
      ExecutionStatus.TIMEOUT,
      ExecutionStatus.RUNTIME_ERROR,
      ExecutionStatus.COMPILATION_ERROR,
      ExecutionStatus.COMPLETED,
    ];

    for (const r of detailedResults) {
      totalTime += r.executionTime;
      if (r.memoryUsage > maxMemory) {
        maxMemory = r.memoryUsage;
      }
      if (r.passed) {
        passedCount++;
      }
      if (!firstStderr && r.stderr) {
        firstStderr = r.stderr;
      }
      if (!firstStdout && r.stdout) {
        firstStdout = r.stdout;
      }
      if (!firstCompile && r.compileOutput) {
        firstCompile = r.compileOutput;
      }

      const currIdx = statusPrecedence.indexOf(overallStatus);
      const newIdx = statusPrecedence.indexOf(r.status);
      if (newIdx < currIdx && newIdx !== -1) {
        overallStatus = r.status;
      }
    }

    const updatedExecution = await this.prisma.codingExecution.update({
      where: { id: executionId },
      data: {
        status: overallStatus,
        stdout: firstStdout,
        stderr: firstStderr,
        compileOutput: firstCompile,
        passedTests: passedCount,
        totalTests: testCases.length,
        executionTime: totalTime,
        memoryUsage: maxMemory,
        completedAt: new Date(),
        webhookReceivedAt: new Date(),
      },
    });

    // If Submit, update module_response with score and payload
    if (execution.submissionType === SubmissionType.SUBMIT) {
      const existing = await this.prisma.moduleResponse.findUnique({
        where: {
          sessionId_questionId: {
            sessionId: execution.sessionId,
            questionId: execution.questionId,
          },
        },
      });

      if (existing) {
        const currentPayload = (existing.responsePayload as any) || {};
        const score = testCases.length > 0 ? passedCount / testCases.length : 0;
        await this.prisma.moduleResponse.update({
          where: { id: existing.id },
          data: {
            score,
            responsePayload: {
              ...currentPayload,
              status: overallStatus,
              score,
              passedTests: passedCount,
              totalTests: testCases.length,
              stdout: firstStdout,
              results: detailedResults,
            },
          },
        });
      }
    }

    // Write final result to Redis read-cache for sub-millisecond candidate polling
    const finalResponsePayload = {
      executionId: updatedExecution.id,
      status: updatedExecution.status,
      passedTests: updatedExecution.passedTests,
      totalTests: updatedExecution.totalTests,
      executionTime: updatedExecution.executionTime,
      memoryUsage: updatedExecution.memoryUsage,
      stdout: updatedExecution.stdout || updatedExecution.stderr || updatedExecution.compileOutput || "",
      results: detailedResults,
    };

    await this.redisService.set(
      `execution:${executionId}`,
      JSON.stringify(finalResponsePayload),
      300, // 5 minutes TTL
    );

    this.logger.log(
      `[OutboundExecutionProcessor] Execution ${executionId} completed. Status: ${overallStatus}, Passed: ${passedCount}/${testCases.length}`,
    );
  }
}
