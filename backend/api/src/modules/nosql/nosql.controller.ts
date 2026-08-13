import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NosqlValidatorService } from "./nosql-validator.service";
import { NosqlSandboxService } from "./nosql-sandbox.service";
import { NosqlExecutionService } from "./nosql-execution.service";
import { ResultComparatorService } from "../../sql/result-comparator.service";
import { SessionOwnerGuard } from "../../common/guards/session-owner.guard";
import { ThrottlerGuard } from "@nestjs/throttler";
import { QueueProviderPort } from "../../queue/queue-provider.port";
import { StartNosqlDto, RunNosqlDto, ResetNosqlDto, SubmitNosqlDto } from "./dto/nosql.dto";
import { SessionStatus, ModuleType } from "@prisma/client";

@Controller("nosql")
export class NosqlController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validatorService: NosqlValidatorService,
    private readonly sandboxService: NosqlSandboxService,
    private readonly executionService: NosqlExecutionService,
    private readonly comparatorService: ResultComparatorService,
    private readonly queueProvider: QueueProviderPort,
  ) {}

  /**
   * Helper to validate that a session exists and is in progress.
   */
  private async validateActiveSession(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException(`Session is not in progress (current status: ${session.status})`);
    }
  }

  /**
   * Helper to query and snapshot database collections for state comparison.
   */
  private async snapshotDatabase(sandboxDbName: string, collections: string[]): Promise<Record<string, any[]>> {
    const snapshot: Record<string, any[]> = {};
    for (const col of collections) {
      try {
        const execRes = await this.executionService.execute(sandboxDbName, {
          collection: col,
          operator: "find",
          payload: { filter: {}, options: { limit: 1000 } },
        });
        snapshot[col] = execRes.result || [];
      } catch (err: any) {
        snapshot[col] = [];
      }
    }
    return snapshot;
  }

  @Post("start")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async start(@Body() dto: StartNosqlDto) {
    await this.validateActiveSession(dto.sessionId);

    // Get question details
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.NOSQL) {
      throw new NotFoundException("NoSQL question not found");
    }

    // Create sandbox database and load seed data
    const { sandboxDbName } = await this.sandboxService.createSandbox(dto.sessionId, dto.questionId);

    // Retrieve seeded state of all collections for preview
    const content = question.content as any;
    const collections = content?.collections || [];
    const seededState = await this.snapshotDatabase(sandboxDbName, collections);

    // Strip expectedOperation
    const { expectedOperation, ...safeContent } = content;

    return {
      sandboxDbName,
      question: {
        ...question,
        content: safeContent,
      },
      seededState,
    };
  }

  @Post("run")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard, ThrottlerGuard)
  async run(@Body() dto: RunNosqlDto) {
    await this.validateActiveSession(dto.sessionId);

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.NOSQL) {
      throw new NotFoundException("NoSQL question not found");
    }

    const content = question.content as any;

    // Validate operation structure & blocklist/whitelist
    const validation = this.validatorService.validateOperation(dto.operation, content);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason || "Invalid operation");
    }

    // Retrieve active attempt sandbox DB name
    const attempt = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
    });

    const sandboxDbName = attempt?.sandboxDbName;
    if (!sandboxDbName) {
      throw new BadRequestException("Sandbox not started. Call /nosql/start first.");
    }

    // Increment execution count and save last operation
    await this.prisma.moduleResponse.update({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
      data: {
        executionCount: { increment: 1 },
        lastOperation: dto.operation as any,
      },
    });

    // Execute operation against target sandbox DB name
    const { result, executionTimeMs } = await this.executionService.execute(sandboxDbName, dto.operation);

    // Retrieve the question to get the expected query
    const expectedOperation = content?.expectedOperation;

    let passed = false;
    if (expectedOperation) {
      const validatorType = content?.validatorType || "OUTPUT_COMPARISON";
      if (validatorType === "OUTPUT_COMPARISON") {
        const expExec = await this.executionService.execute(sandboxDbName, expectedOperation);
        passed = this.comparatorService.compareOutput(result, expExec.result);
      } else if (validatorType === "STATE_COMPARISON") {
        const collections = content?.collections || [];
        const candSnapshot = await this.snapshotDatabase(sandboxDbName, collections);

        await this.sandboxService.resetSandbox(sandboxDbName, dto.questionId);
        await this.executionService.execute(sandboxDbName, expectedOperation);
        const expSnapshot = await this.snapshotDatabase(sandboxDbName, collections);

        passed = this.comparatorService.compareState(candSnapshot, expSnapshot);

        // Restore sandbox state
        await this.sandboxService.resetSandbox(sandboxDbName, dto.questionId);
        await this.executionService.execute(sandboxDbName, dto.operation);
      }
    }

    return {
      result,
      executionTimeMs,
      passed,
    };
  }

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async reset(@Body() dto: ResetNosqlDto) {
    await this.validateActiveSession(dto.sessionId);

    const attempt = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
    });

    const sandboxDbName = attempt?.sandboxDbName;
    if (!sandboxDbName) {
      throw new BadRequestException("Sandbox not started. Call /nosql/start first.");
    }

    await this.sandboxService.resetSandbox(sandboxDbName, dto.questionId);

    return { success: true };
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async submit(@Body() dto: SubmitNosqlDto) {
    await this.validateActiveSession(dto.sessionId);

    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.NOSQL) {
      throw new NotFoundException("NoSQL question not found");
    }

    const content = question.content as any;
    const collections = content?.collections || [];
    const expectedOperation = content?.expectedOperation;

    if (!expectedOperation) {
      throw new BadRequestException("Question is missing validation criteria");
    }

    // 1. Validate candidate operation
    const validation = this.validatorService.validateOperation(dto.operation, content);
    if (!validation.valid) {
      throw new BadRequestException(validation.reason || "Invalid operation");
    }

    const attempt = await this.prisma.moduleResponse.findUnique({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
    });

    const sandboxDbName = attempt?.sandboxDbName;
    if (!sandboxDbName) {
      throw new BadRequestException("Sandbox not started. Call /nosql/start first.");
    }

    let passed = false;

    // 2. Perform comparison depending on validator type
    const validatorType = content?.validatorType || "OUTPUT_COMPARISON";

    if (validatorType === "OUTPUT_COMPARISON") {
      // Execute candidate operation
      const candExec = await this.executionService.execute(sandboxDbName, dto.operation);
      // Execute expected operation
      const expExec = await this.executionService.execute(sandboxDbName, expectedOperation);

      // Compare outputs
      passed = this.comparatorService.compareOutput(candExec.result, expExec.result);
    } else if (validatorType === "STATE_COMPARISON") {
      // Re-seed candidate path
      await this.sandboxService.resetSandbox(sandboxDbName, dto.questionId);
      // Execute candidate operation
      await this.executionService.execute(sandboxDbName, dto.operation);
      const candSnapshot = await this.snapshotDatabase(sandboxDbName, collections);

      // Re-seed expected path
      await this.sandboxService.resetSandbox(sandboxDbName, dto.questionId);
      // Execute expected operation
      await this.executionService.execute(sandboxDbName, expectedOperation);
      const expSnapshot = await this.snapshotDatabase(sandboxDbName, collections);

      // Compare resulting database state snapshots
      passed = this.comparatorService.compareState(candSnapshot, expSnapshot);
    }

    // 3. Write score/evaluation to attempt row (ModuleResponse)
    const responsePayload = {
      moduleType: ModuleType.NOSQL,
      query: dto.query || "",
      operation: dto.operation,
      executionResult: {
        passed,
        status: passed ? "SUCCESS" : "FAILED",
      },
    };

    await this.prisma.moduleResponse.update({
      where: {
        sessionId_questionId: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
        },
      },
      data: {
        responsePayload: responsePayload as any,
        isDraft: false,
        timeSpentSeconds: dto.timeSpentSeconds || null,
        lastAutosavedAt: new Date(),
      },
    });

    // 4. Enqueue cleanup job (immediate)
    await this.queueProvider.enqueueDelayed(
      "heartbeat-monitor",
      "drop-sandbox",
      { sandboxDbName },
      { delayMs: 0 },
    );

    return { passed };
  }

  @Get("question/:questionId")
  async getQuestion(@Param("questionId") questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.moduleType !== ModuleType.NOSQL) {
      throw new NotFoundException("NoSQL question not found");
    }
    const { expectedOperation, ...safeContent } = question.content as any;
    return {
      ...question,
      content: safeContent,
    };
  }

  @Get("question")
  async getQuestionQuery(@Query("questionId") questionId: string) {
    if (!questionId) {
      throw new BadRequestException("questionId query parameter is required");
    }
    return this.getQuestion(questionId);
  }
}
