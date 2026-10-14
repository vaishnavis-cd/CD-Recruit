import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import { PrismaService } from "@app/prisma/prisma.service";
import { QueueProviderPort } from "../queue-provider.port";
import { RedisService } from "../../common/redis/redis.service";
import { ExecutionStatus, SubmissionType } from "@cd-recruit/shared-types";
import { AppConfig } from "../../config/configuration";

@Processor("execution-watchdog")
@Injectable()
export class WatchdogExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(WatchdogExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProvider: QueueProviderPort,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  async process(job: Job<{ executionId: string; attempt?: number }>): Promise<void> {
    const { executionId } = job.data;
    const attempt = job.data.attempt ?? 1;

    this.logger.log(`[WatchdogExecutionProcessor] Checking status for execution ${executionId} (attempt ${attempt})`);

    const execution = await this.prisma.codingExecution.findUnique({
      where: { id: executionId },
      include: { question: true },
    });

    if (!execution || execution.status !== ExecutionStatus.PENDING) {
      // Execution already completed or failed normally
      return;
    }

    await this.handlePistonWatchdog(execution, executionId, attempt);
  }

  /**
   * Piston Watchdog Handler:
   * 1. Inspects Redis HLEN: if all cases arrived, enqueues outbound recovery.
   * 2. Inspects BullMQ job state (waiting/active/delayed): reschedules up to 3 times (90s max age).
   * 3. If attempt > 3: triggers one-time priority-1 requeue.
   * 4. If permanently stalled: marks ExecutionStatus.FAILED.
   */
  private async handlePistonWatchdog(execution: any, executionId: string, attempt: number): Promise<void> {
    const casesKey = `execution:${executionId}:cases`;
    const totalTests = execution.totalTests || (execution.question?.content as any)?.visibleTestCases?.length || 1;

    // 1. Check if all cases already accumulated in Redis
    const currentCount = await this.redisService.hlen(casesKey);
    if (currentCount >= totalTests && totalTests > 0) {
      this.logger.log(
        `[WatchdogExecutionProcessor] Execution ${executionId} has all ${currentCount}/${totalTests} cases in Redis. Triggering outbound recovery.`,
      );
      await this.queueProvider.enqueue(
        "execution-outbound",
        "recover-results",
        { executionId },
        { jobId: `outbound-${executionId}`, priority: 1 },
      );
      return;
    }

    // 2. Inspect BullMQ inbound job state
    const jobState = await this.queueProvider.getJobState("execution-inbound", executionId);

    // If job is actively processing or waiting in queue, reschedule up to 3 times (max 90s)
    if (jobState === "waiting" || jobState === "active" || jobState === "delayed") {
      if (attempt <= 3) {
        this.logger.warn(
          `[WatchdogExecutionProcessor] Inbound job ${executionId} is still '${jobState}' (attempt ${attempt}/3). Rescheduling watchdog in 25s.`,
        );
        await this.queueProvider.enqueueDelayed(
          "execution-watchdog",
          "check-stuck",
          { executionId, attempt: attempt + 1 },
          { delayMs: 25000, jobId: `watchdog-${executionId}-attempt-${attempt + 1}` },
        );
        return;
      }

      // If attempt > 3, try one-time priority-1 requeue before failing
      const requeueKey = `execution:${executionId}:watchdog-requeued`;
      const alreadyRequeued = await this.redisService.get(requeueKey);
      if (!alreadyRequeued) {
        this.logger.warn(
          `[WatchdogExecutionProcessor] Execution ${executionId} exceeded 90s active time. Triggering one-time priority-1 requeue.`,
        );
        await this.redisService.set(requeueKey, "1", 300);

        const subType = execution.submissionType === SubmissionType.SUBMIT ? "submit" : "run";
        await this.queueProvider.enqueue(
          "execution-inbound",
          subType,
          { executionId, type: subType },
          { jobId: `requeue-${executionId}`, priority: 1 },
        );

        await this.queueProvider.enqueueDelayed(
          "execution-watchdog",
          "check-stuck",
          { executionId, attempt: attempt + 1 },
          { delayMs: 25000, jobId: `watchdog-${executionId}-post-requeue` },
        );
        return;
      }
    }

    // 3. Mark FAILED if job is lost, finished without completing all cases, or stalled after requeue
    this.logger.error(
      `[WatchdogExecutionProcessor] Execution ${executionId} stalled permanently after attempt ${attempt} (state: ${jobState || "not_found"}). Marking FAILED.`,
    );
    await this.prisma.codingExecution.update({
      where: { id: executionId },
      data: {
        status: ExecutionStatus.FAILED,
        stderr: `Execution stalled: sandbox worker timed out after ${attempt} watchdog attempts (state: ${jobState || "not_found"}).`,
        completedAt: new Date(),
      },
    });
  }
}
