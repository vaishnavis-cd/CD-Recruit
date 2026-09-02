import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "@app/prisma/prisma.service";
import { Judge0Client } from "../../integrations/judge0/judge0.client";
import { QueueProviderPort } from "../queue-provider.port";
import { ExecutionStatus } from "@cd-recruit/shared-types";

@Processor("execution-watchdog")
@Injectable()
export class WatchdogExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(WatchdogExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Client: Judge0Client,
    private readonly queueProvider: QueueProviderPort,
  ) {
    super();
  }

  async process(job: Job<{ executionId: string }>): Promise<void> {
    const { executionId } = job.data;
    this.logger.log(`[WatchdogExecutionProcessor] Checking status for execution ${executionId}`);

    const execution = await this.prisma.codingExecution.findUnique({
      where: { id: executionId },
    });

    if (!execution || execution.status !== ExecutionStatus.PENDING) {
      // Execution already completed or failed normally
      return;
    }

    const tokens = execution.judge0Token
      ? execution.judge0Token.split(",").filter(Boolean)
      : [];
    if (tokens.length === 0) {
      this.logger.warn(`[WatchdogExecutionProcessor] Execution ${executionId} has no tokens recorded. Marking TIMEOUT.`);
      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.TIMEOUT,
          stderr: "Execution timed out before submission to sandbox engine.",
          completedAt: new Date(),
        },
      });
      return;
    }

    this.logger.warn(
      `[WatchdogExecutionProcessor] Execution ${executionId} still PENDING after watchdog delay. Falling back to manual Judge0 poll for tokens: ${tokens.join(", ")}`,
    );

    try {
      const batchResults = await this.judge0Client.getBatchSubmissions(tokens);
      if (batchResults && batchResults.length > 0) {
        await this.queueProvider.enqueue(
          "execution-outbound",
          "save-result",
          {
            executionId,
            judge0Results: batchResults,
          },
        );
      } else {
        await this.prisma.codingExecution.update({
          where: { id: executionId },
          data: {
            status: ExecutionStatus.TIMEOUT,
            stderr: "Execution timed out waiting for sandbox results.",
            completedAt: new Date(),
          },
        });
      }
    } catch (err: any) {
      this.logger.error(
        `[WatchdogExecutionProcessor] Fallback poll failed for execution ${executionId}: ${err.message}`,
      );
      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.TIMEOUT,
          stderr: `Execution timed out: ${err.message}`,
          completedAt: new Date(),
        },
      });
    }
  }
}
