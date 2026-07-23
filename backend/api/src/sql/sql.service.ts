import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SqlSandboxService } from "./sql-sandbox.service";
import { ResultComparatorService } from "./result-comparator.service";
import { SqlValidatorService, SqlQuestionType } from "./sql-validator.service";
import { RunSqlDto, SubmitSqlDto, DraftSqlDto } from "./dto/sql.dto";
import { SqlQuestionContentJson } from "./sql.types";
import { SubmissionType, SqlExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "../assessment/assessment-module-engine.interface";

@Injectable()
export class SqlService implements AssessmentModuleEngine {
  readonly moduleType = ModuleType.SQL;
  private readonly logger = new Logger(SqlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxService: SqlSandboxService,
    private readonly comparatorService: ResultComparatorService,
    private readonly validatorService: SqlValidatorService,
  ) {}

  async validateSubmission(submission: any): Promise<boolean> {
    return !!(submission && submission.sql);
  }

  async evaluateSubmission(
    sessionId: string,
    questionId: string,
    submission: any,
  ): Promise<ModuleEvaluationResult> {
    const res = await this.run({
      sessionId,
      questionId,
      query: submission.sql,
    });
    return {
      status: res.status as any,
      score: res.passed ? 1.0 : 0.0,
      scoreDetail: res,
      evaluatedAt: new Date(),
    };
  }

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
    if (session.status === SessionStatus.NOT_STARTED) {
      const now = new Date();
      await this.prisma.session.update({
        where: { id: dto.sessionId },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: now },
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
    if (!question || question.moduleType !== ModuleType.SQL) {
      throw new NotFoundException("SQL question not found");
    }

    const content = question.content as unknown as SqlQuestionContentJson;
    const questionType: SqlQuestionType = (question as any).questionType || "SELECT_ONLY";

    // Fast-fail pre-check validation gate
    this.validatorService.validateCandidateQuery(dto.query, questionType);

    const start = Date.now();
    let status = SqlExecutionStatus.COMPLETED;
    let resultJson: any = null;
    let passed = false;
    let rowsCount = 0;
    let executionTimeMs = 0;
    let poolWaitTimeMs = 0;

    try {
      // Execute candidate query in sandbox
      const candExec = await this.sandboxService.executeQuery({
        schemaSql: content.schema,
        seedSql: content.seedData,
        query: dto.query,
        questionType,
      });

      const candidateResult = candExec.queryResult;
      executionTimeMs = candExec.executionTimeMs;
      poolWaitTimeMs = candExec.poolWaitTimeMs;

      resultJson = candidateResult;
      rowsCount = candidateResult.rowCount;

      // Execute expected query if available (never exposed to client)
      if (content.expectedQuery) {
        try {
          const expExec = await this.sandboxService.executeQuery({
            schemaSql: content.schema,
            seedSql: content.seedData,
            query: content.expectedQuery,
            questionType,
          });
          passed = this.comparatorService.compare(candidateResult, expExec.queryResult);
        } catch (err: any) {
          this.logger.error(`Failed to execute expected query in comparison: ${err.message}`);
          passed = false;
        }
      }
    } catch (err: any) {
      passed = false;
      const errMsg = err.message || "";
      if (errMsg.includes("timeout") || errMsg.includes("timed out")) {
        status = SqlExecutionStatus.TIMEOUT;
        resultJson = { error: "Your query took too long to execute (>5s). Consider optimizing your query." };
      } else if (errMsg.includes("permission denied") || errMsg.includes("must be owner")) {
        status = SqlExecutionStatus.FAILED;
        resultJson = { error: "This operation is not permitted in the SQL sandbox environment." };
      } else {
        status = SqlExecutionStatus.QUERY_ERROR;
        resultJson = { error: errMsg };
      }
    }

    const totalElapsed = Date.now() - start;
    this.logger.log(
      `SQL Run Execution [Session: ${dto.sessionId}, Question: ${dto.questionId}] Passed: ${passed}, ExecTime: ${executionTimeMs}ms, PoolWait: ${poolWaitTimeMs}ms`,
    );

    // 3. Create SQLExecution record with safety net
    try {
      const execution = await this.prisma.sQLExecution.create({
        data: {
          sessionId: dto.sessionId,
          questionId: dto.questionId,
          submissionType: SubmissionType.RUN,
          query: dto.query,
          status: status as any,
          resultJson: resultJson as any,
          passed,
          executionTime: totalElapsed,
          completedAt: new Date(),
        },
      });

      return {
        executionId: execution.id,
        status: execution.status,
        passed,
        executionTime: execution.executionTime,
        resultRows: rowsCount,
        result: resultJson,
      };
    } catch (dbErr: any) {
      this.logger.error(`Failed to persist SQLExecution record: ${dbErr.message}`);
      return {
        executionId: "unknown",
        status,
        passed: false,
        executionTime: totalElapsed,
        resultRows: rowsCount,
        result: resultJson,
      };
    }
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
    if (session.status === SessionStatus.NOT_STARTED) {
      const now = new Date();
      await this.prisma.session.update({
        where: { id: dto.sessionId },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: now },
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
    if (!question || question.moduleType !== ModuleType.SQL) {
      throw new NotFoundException("SQL question not found");
    }

    const content = question.content as unknown as SqlQuestionContentJson;
    const questionType: SqlQuestionType = (question as any).questionType || "SELECT_ONLY";

    // Fast-fail pre-check validation gate
    this.validatorService.validateCandidateQuery(dto.query, questionType);

    const start = Date.now();
    let status = SqlExecutionStatus.COMPLETED;
    let resultJson: any = null;
    let passed = false;
    let rowsCount = 0;
    let executionTimeMs = 0;

    try {
      // Execute candidate query
      const candExec = await this.sandboxService.executeQuery({
        schemaSql: content.schema,
        seedSql: content.seedData,
        query: dto.query,
        questionType,
      });

      const candidateResult = candExec.queryResult;
      executionTimeMs = candExec.executionTimeMs;
      resultJson = candidateResult;
      rowsCount = candidateResult.rowCount;

      // Execute expected query (never exposed to client)
      if (content.expectedQuery) {
        try {
          const expExec = await this.sandboxService.executeQuery({
            schemaSql: content.schema,
            seedSql: content.seedData,
            query: content.expectedQuery,
            questionType,
          });
          passed = this.comparatorService.compare(candidateResult, expExec.queryResult);
        } catch (err: any) {
          this.logger.error(`Failed to execute expected query in comparison: ${err.message}`);
          passed = false;
        }
      }
    } catch (err: any) {
      passed = false;
      const errMsg = err.message || "";
      if (errMsg.includes("timeout") || errMsg.includes("timed out")) {
        status = SqlExecutionStatus.TIMEOUT;
        resultJson = { error: "Your query took too long to execute (>5s)." };
      } else if (errMsg.includes("permission denied") || errMsg.includes("must be owner")) {
        status = SqlExecutionStatus.FAILED;
        resultJson = { error: "This operation is not permitted in the SQL sandbox environment." };
      } else {
        status = SqlExecutionStatus.QUERY_ERROR;
        resultJson = { error: errMsg };
      }
    }

    const totalElapsed = Date.now() - start;

    try {
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
          executionTime: totalElapsed,
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
        passed,
        executionTime: execution.executionTime,
        resultRows: rowsCount,
      };
    } catch (persistErr: any) {
      this.logger.error(`Failed to persist submit response or execution record: ${persistErr.message}`);
      return {
        executionId: "unknown",
        status: SqlExecutionStatus.COMPLETED,
        passed: false,
        executionTime: totalElapsed,
        resultRows: rowsCount,
      };
    }
  }

  /**
   * Save draft version of candidate SQL query.
   */
  async draft(dto: DraftSqlDto) {
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
