import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import { PrismaService } from "@app/prisma/prisma.service";
import { Judge0Client } from "../../integrations/judge0/judge0.client";
import { Judge0Service } from "../../integrations/judge0/judge0.service";
import { generateJudge0WebhookSignature } from "../../integrations/judge0/judge0-webhook.guard";
import { QueueProviderPort } from "../queue-provider.port";
import { AppConfig } from "../../config/configuration";
import { SubmissionType, ExecutionStatus } from "@cd-recruit/shared-types";

@Processor("execution-inbound", { concurrency: 50 })
@Injectable()
export class InboundExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundExecutionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Client: Judge0Client,
    private readonly judge0Service: Judge0Service,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly queueProvider: QueueProviderPort,
  ) {
    super();
  }

  private getQuestionTestCases(
    content: any,
    type: "run" | "submit",
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

    if (type === "submit") {
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

  async process(job: Job<{ executionId: string; type: "run" | "submit" }>): Promise<void> {
    const { executionId, type } = job.data;
    this.logger.log(`[InboundExecutionProcessor] Processing ${type} execution ${executionId}`);

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

    const secret =
      this.configService.get<string>("judge0WebhookSecret", { infer: true }) ||
      "cdrecruit-judge0-secret-key";
    const callbackBase =
      this.configService.get<string>("judge0CallbackUrlBase", { infer: true }) ||
      process.env.JUDGE0_CALLBACK_URL_BASE ||
      "http://host.docker.internal:3001";

    const signature = generateJudge0WebhookSignature(executionId, testCases.length, secret);
    const callbackUrl = `${callbackBase.replace(/\/+$/, "")}/api/v1/webhooks/judge0?executionId=${executionId}&totalTests=${testCases.length}&sig=${signature}`;

    const sourceCodeBase64 = this.judge0Service.encodeBase64(execution.sourceCode);
    const batchItems = testCases.map((tc) => ({
      sourceCodeBase64,
      languageId: execution.languageId,
      stdinBase64: this.judge0Service.encodeBase64(tc.input),
      expectedOutputBase64: this.judge0Service.encodeBase64(tc.expectedOutput),
      callbackUrl,
    }));

    try {
      const submissionTokens = await this.judge0Client.createBatchSubmissions(batchItems);
      const tokens = submissionTokens.map((s) => s.token);

      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          judge0Tokens: tokens,
          totalTests: testCases.length,
        },
      });

      // Compute dynamic watchdog timeout based on CPU time limit & total tests
      const cpuLimit = this.configService.get<number>("judge0CpuTimeLimit", { infer: true }) ?? 5.0;
      const dynamicDelayMs = Math.max(15000, Math.round(cpuLimit * testCases.length * 1000) + 10000);

      await this.queueProvider.enqueueDelayed(
        "execution-watchdog",
        "check-stuck",
        { executionId },
        { delayMs: dynamicDelayMs, jobId: `watchdog-${executionId}` },
      );

      this.logger.log(
        `[InboundExecutionProcessor] Dispatched ${testCases.length} tests for execution ${executionId} to Judge0. Watchdog delay: ${dynamicDelayMs}ms`,
      );
    } catch (err: any) {
      this.logger.error(
        `[InboundExecutionProcessor] Failed to dispatch execution ${executionId} to Judge0: ${err.message}`,
      );
      await this.prisma.codingExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.FAILED,
          stderr: `Failed to dispatch to Judge0 sandbox: ${err.message}`,
          completedAt: new Date(),
        },
      });
    }
  }
}
