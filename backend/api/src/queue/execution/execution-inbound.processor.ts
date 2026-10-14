import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import pLimit from "p-limit";
import { PrismaService } from "@app/prisma/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import { QueueProviderPort } from "../queue-provider.port";
import { AppConfig } from "../../config/configuration";
import { SubmissionType, ExecutionStatus } from "@cd-recruit/shared-types";
import { getQuestionTestCases as parseQuestionTestCases } from "../../common/utils/test-case-parser.util";
import { resolveJavaFileName } from "../../common/utils/java-resolver.util";
import { PistonClient } from "../../integrations/piston/piston.client";
import { mapPistonResponseToCaseResult } from "../../integrations/piston/piston-verdict-mapper";
import { resolvePistonLanguage } from "../../integrations/piston/piston-language.util";
import { PISTON_ACCUMULATE_AND_CHECK_LUA } from "../../integrations/piston/piston-accumulate.lua";
import { PistonRawResponse } from "../../integrations/piston/piston.contracts";

@Processor("execution-inbound", { concurrency: 1 })
@Injectable()
export class InboundExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProvider: QueueProviderPort,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly pistonClient: PistonClient,
  ) {
    super();
  }

  private getQuestionTestCases(
    content: any,
    type: "run" | "submit",
  ): Array<{ input: string; expectedOutput: string; isHidden: boolean; label?: string }> {
    return parseQuestionTestCases(content, type);
  }

  async process(job: Job<{ executionId: string; type: "run" | "submit" }>): Promise<void> {
    const { executionId, type } = job.data;
    this.logger.log(`[InboundExecutionProcessor] Processing ${type} execution ${executionId}`);

    await this.redisService.set(`execution:${executionId}:inbound-start`, "1", 600);

    const execution = await this.prisma.codingExecution.findUnique({
      where: { id: executionId },
      include: { question: true },
    });

    if (!execution || execution.status !== ExecutionStatus.PENDING) {
      return;
    }

    const content = (execution.question?.content as any) || {};
    const testCases = this.getQuestionTestCases(content, type);

    if (testCases.length === 0) {
      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.COMPLETED,
          passedTests: 0,
          totalTests: 0,
          completedAt: new Date(),
        },
      });
      return;
    }

    await this.processWithPiston(execution, content, testCases, executionId);
  }

  /**
   * Piston Execution Pipeline with concurrency 1 worker, p-limit(3) per-case concurrency,
   * HEXISTS deduplication, 3x retry on infra error, and atomic Lua accumulation.
   */
  private async processWithPiston(
    execution: any,
    content: any,
    testCases: Array<{ input: string; expectedOutput: string; isHidden: boolean; label?: string }>,
    executionId: string,
  ): Promise<void> {
    const langTarget = resolvePistonLanguage(execution.languageId || content.language);

    let fileName = langTarget.defaultFileName;
    let sourceCode = execution.sourceCode;
    if (langTarget.language === "java") {
      const resolved = resolveJavaFileName(execution.sourceCode);
      fileName = resolved.fileName;
      sourceCode = resolved.sanitizedCode;
    }
    const files = [{ name: fileName, content: sourceCode }];

    const casesKey = `execution:${executionId}:cases`;
    const lockKey = `execution:${executionId}:enqueued`;
    const ttlSeconds = 600;

    await this.prisma.codingExecution.update({
      where: { id: executionId },
      data: { totalTests: testCases.length },
    });

    await this.redisService.set(`execution:${executionId}:dispatched`, "1", ttlSeconds);

    // Dynamic watchdog timeout cap: 5s per test + 10s buffer, minimum 15s
    const watchdogDelayMs = Math.max(15000, testCases.length * 5000 + 10000);
    await this.queueProvider.enqueueDelayed(
      "execution-watchdog",
      "check-stuck",
      { executionId },
      { delayMs: watchdogDelayMs, jobId: `watchdog-${executionId}` },
    );

    const limit = pLimit(3);
    let infraError: string | null = null;

    const tasks = testCases.map((tc, caseIndex) =>
      limit(async () => {
        if (infraError) return;

        // Skip test cases already recorded in accumulator (handles worker crash / retry)
        const alreadyDone = await this.redisService.hexists(casesKey, String(caseIndex));
        if (alreadyDone) {
          this.logger.log(
            `[InboundExecutionProcessor] Case ${caseIndex} for ${executionId} already completed. Skipping.`,
          );
          return;
        }

        let rawResponse: PistonRawResponse | null = null;
        let attempt = 0;
        const maxRetries = 3;
        let elapsedMs = 0;

        while (attempt < maxRetries) {
          attempt++;
          const start = Date.now();
          try {
            rawResponse = await this.pistonClient.execute(
              langTarget.language,
              langTarget.version,
              files,
              {
                stdin: tc.input,
                run_timeout: 5000,
                compile_timeout: 10000,
                run_memory_limit: 268435456, // 256MB cap
                compile_memory_limit: 536870912, // 512MB cap
              },
            );
            elapsedMs = Date.now() - start;

            // Internal engine / sandbox fault (XX): retry up to 3x
            if (rawResponse.run?.status === "XX") {
              if (attempt < maxRetries) {
                this.logger.warn(
                  `[InboundExecutionProcessor] Piston internal error XX on attempt ${attempt} for case ${caseIndex}. Retrying...`,
                );
                await new Promise((r) => setTimeout(r, 100 * attempt));
                continue;
              }
            }
            break;
          } catch (err: any) {
            elapsedMs = Date.now() - start;
            if (attempt < maxRetries) {
              this.logger.warn(
                `[InboundExecutionProcessor] Transient error on attempt ${attempt} for case ${caseIndex} (${err.message}). Retrying...`,
              );
              await new Promise((r) => setTimeout(r, 100 * attempt));
              continue;
            }
            infraError = err.message;
            return;
          }
        }

        if (!rawResponse || rawResponse.run?.status === "XX") {
          infraError = rawResponse?.run?.output || "Internal sandbox fault (XX)";
          return;
        }

        // Pure deterministic verdict mapping
        const label =
          tc.label ||
          (tc.isHidden ? `Hidden Test Case ${caseIndex + 1}` : `Visible Test Case ${caseIndex + 1}`);

        const caseResult = mapPistonResponseToCaseResult(
          caseIndex,
          rawResponse,
          tc.expectedOutput,
          tc.input,
          label,
          tc.isHidden,
          elapsedMs,
        );

        // Store result atomically via Lua script
        const luaRes = await this.redisService.eval(
          PISTON_ACCUMULATE_AND_CHECK_LUA,
          2,
          casesKey,
          lockKey,
          String(caseIndex),
          JSON.stringify(caseResult),
          testCases.length,
          ttlSeconds,
        );

        if (Number(luaRes) === 1) {
          this.logger.log(
            `[InboundExecutionProcessor] All ${testCases.length} cases accumulated for ${executionId}. Enqueuing execution-outbound.`,
          );
          await this.queueProvider.enqueue(
            "execution-outbound",
            "process-results",
            { executionId },
            { jobId: `outbound-${executionId}`, priority: 1 },
          );
        }
      }),
    );

    await Promise.all(tasks);

    // If retries exhaust on infra error, mark CodingExecution as FAILED without scoring
    if (infraError) {
      this.logger.error(
        `[InboundExecutionProcessor] Infra retries exhausted for execution ${executionId}: ${infraError}`,
      );
      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.FAILED,
          stderr: `Infrastructure error: sandbox execution failed after retries (${infraError})`,
          completedAt: new Date(),
        },
      });
      await this.redisService.del(lockKey);
    }
  }
}
