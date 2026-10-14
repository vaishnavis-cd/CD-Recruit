import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "@app/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { ExecutionStatus, SubmissionType } from "@cd-recruit/shared-types";
import { getQuestionTestCases as parseQuestionTestCases } from "../../common/utils/test-case-parser.util";
import { normalizeOutput } from "../../common/utils/comparator.util";

@Processor("execution-outbound", { concurrency: 20 })
@Injectable()
export class OutboundExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  private getQuestionTestCases(
    content: any,
    type: SubmissionType,
  ): Array<{ input: string; expectedOutput: string; isHidden: boolean; label?: string }> {
    return parseQuestionTestCases(content, type);
  }

  async process(job: Job<{ executionId: string }>): Promise<void> {
    const { executionId } = job.data;
    this.logger.log(`[OutboundExecutionProcessor] Processing results for execution ${executionId}`);

    await this.redisService.set(`execution:${executionId}:outbound-start`, "1", 600);

    const execution = await this.prisma.codingExecution.findUnique({
      where: { id: executionId },
      include: { question: true },
    });

    if (!execution) {
      this.logger.warn(`Execution ${executionId} not found`);
      return;
    }

    // Idempotency Guard: Exit immediately if execution is already finalized
    if (execution.status !== ExecutionStatus.PENDING) {
      this.logger.log(`[OutboundExecutionProcessor] Execution ${executionId} already finalized (${execution.status}). Exiting.`);
      return;
    }

    const content = (execution.question?.content as any) || {};
    const testCases = this.getQuestionTestCases(content, execution.submissionType as SubmissionType);

    // 1. Check Redis accumulated results from Piston
    const casesHash = await this.redisService.hgetall(`execution:${executionId}:cases`);
    let detailedResults: any[] = [];

    if (casesHash && Object.keys(casesHash).length > 0) {
      detailedResults = Object.values(casesHash)
        .map((str) => JSON.parse(str))
        .sort((a: any, b: any) => a.caseIndex - b.caseIndex);
    } else {
      this.logger.warn(`[OutboundExecutionProcessor] No Piston cases found in Redis for execution ${executionId}.`);
    }

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

    // Broadcast instant completion event to connected SSE streams (<1ms)
    await this.redisService.publish(
      `execution:events:${executionId}`,
      JSON.stringify(finalResponsePayload),
    );

    this.logger.log(
      `[OutboundExecutionProcessor] Execution ${executionId} completed. Status: ${overallStatus}, Passed: ${passedCount}/${testCases.length}`,
    );
  }
}
