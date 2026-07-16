import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SqlSandboxService } from "./sql-sandbox.service";
import { ResultComparatorService } from "./result-comparator.service";
import { RunSqlDto, SubmitSqlDto, DraftSqlDto } from "./dto/sql.dto";
import { SqlQuestionContentJson } from "./sql.types";
import { SubmissionType, SqlExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";

@Injectable()
export class SqlService {
  private readonly logger = new Logger(SqlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxService: SqlSandboxService,
    private readonly comparatorService: ResultComparatorService,
  ) {}

  /**
   * Run candidate SQL query in sandbox and compare with expected output.
   */
  async run(dto: RunSqlDto) {
    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    // 2. Validate question
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.SQL) {
      throw new NotFoundException("SQL question not found");
    }

    const content = question.content as unknown as SqlQuestionContentJson;

    const start = Date.now();
    let status = SqlExecutionStatus.COMPLETED;
    let resultJson: any = null;
    let passed = false;
    let rowsCount = 0;

    try {
      // Execute candidate query
      const candidateResult = await this.sandboxService.executeQuery(
        content.schema,
        content.seedData,
        dto.query,
      );

      resultJson = candidateResult;
      rowsCount = candidateResult.rowCount;

      // Execute expected query if available
      if (content.expectedQuery) {
        try {
          const expectedResult = await this.sandboxService.executeQuery(
            content.schema,
            content.seedData,
            content.expectedQuery,
          );
          passed = this.comparatorService.compare(candidateResult, expectedResult);
        } catch (err: any) {
          this.logger.error(`Failed to execute expected query in comparison: ${err.message}`);
          passed = false;
        }
      }
    } catch (err: any) {
      passed = false;
      const errMsg = err.message || "";
      if (errMsg.includes("timeout")) {
        status = SqlExecutionStatus.TIMEOUT;
        resultJson = { error: "Query execution timed out" };
      } else {
        status = SqlExecutionStatus.QUERY_ERROR;
        resultJson = { error: errMsg };
      }
    }

    const elapsed = Date.now() - start;

    // 3. Create SQLExecution record
    const execution = await this.prisma.sQLExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        submissionType: SubmissionType.RUN,
        query: dto.query,
        status: status as any,
        resultJson: resultJson as any,
        passed,
        executionTime: elapsed,
        completedAt: new Date(),
      },
    });

    return {
      executionId: execution.id,
      status: execution.status,
      passed: execution.passed,
      executionTime: execution.executionTime,
      resultRows: rowsCount,
    };
  }

  /**
   * Final submit of candidate SQL answer: runs queries, evaluates equivalence, saves to ModuleResponse.
   */
  async submit(dto: SubmitSqlDto) {
    // 1. Validate session
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session) {
      throw new NotFoundException("Session not found");
    }
    if (session.status !== SessionStatus.IN_PROGRESS && session.status !== SessionStatus.DISCONNECTED) {
      throw new BadRequestException("Session is not in progress");
    }

    // 2. Validate question
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
    });
    if (!question || question.moduleType !== ModuleType.SQL) {
      throw new NotFoundException("SQL question not found");
    }

    const content = question.content as unknown as SqlQuestionContentJson;

    const start = Date.now();
    let status = SqlExecutionStatus.COMPLETED;
    let resultJson: any = null;
    let passed = false;
    let rowsCount = 0;

    try {
      // Execute candidate query
      const candidateResult = await this.sandboxService.executeQuery(
        content.schema,
        content.seedData,
        dto.query,
      );

      resultJson = candidateResult;
      rowsCount = candidateResult.rowCount;

      // Execute expected query
      if (content.expectedQuery) {
        try {
          const expectedResult = await this.sandboxService.executeQuery(
            content.schema,
            content.seedData,
            content.expectedQuery,
          );
          passed = this.comparatorService.compare(candidateResult, expectedResult);
        } catch (err: any) {
          this.logger.error(`Failed to execute expected query in comparison: ${err.message}`);
          passed = false;
        }
      }
    } catch (err: any) {
      passed = false;
      const errMsg = err.message || "";
      if (errMsg.includes("timeout")) {
        status = SqlExecutionStatus.TIMEOUT;
        resultJson = { error: "Query execution timed out" };
      } else {
        status = SqlExecutionStatus.QUERY_ERROR;
        resultJson = { error: errMsg };
      }
    }

    const elapsed = Date.now() - start;

    // 3. Create SQLExecution record
    const execution = await this.prisma.sQLExecution.create({
      data: {
        sessionId: dto.sessionId,
        questionId: dto.questionId,
        submissionType: SubmissionType.SUBMIT,
        query: dto.query,
        status: status as any,
        resultJson: resultJson as any,
        passed,
        executionTime: elapsed,
        completedAt: new Date(),
      },
    });

    // 4. Save final response in ModuleResponse
    const responsePayload = {
      moduleType: ModuleType.SQL,
      query: dto.query,
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

    return {
      executionId: execution.id,
      status: execution.status,
      passed: execution.passed,
      executionTime: execution.executionTime,
      resultRows: rowsCount,
    };
  }

  /**
   * Save draft version of candidate SQL query.
   */
  async draft(dto: DraftSqlDto) {
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

    const responsePayload = {
      moduleType: ModuleType.SQL,
      query: dto.query,
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

    return { success: true };
  }
}
