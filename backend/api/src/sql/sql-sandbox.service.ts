import { Injectable, Logger, OnModuleInit, OnModuleDestroy, InternalServerErrorException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, PoolClient } from "pg";
import * as crypto from "crypto";
import { SqlQueryResult } from "./sql.types";
import { SQL_DEFAULTS } from "./sql.constants";
import { SqlQuestionType } from "./sql-validator.service";

export interface ExecutionOptions {
  schemaSql: string;
  seedSql: string;
  query: string;
  questionType?: SqlQuestionType;
}

export interface ExecutionResult {
  queryResult: SqlQueryResult;
  executionTimeMs: number;
  poolWaitTimeMs: number;
}

@Injectable()
export class SqlSandboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqlSandboxService.name);
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const sandboxUrl =
      this.configService.get<string>("sandboxDatabaseUrl") ||
      this.configService.get<string>("app.sandboxDatabaseUrl") ||
      process.env.SANDBOX_DB_URL;

    if (!sandboxUrl) {
      throw new InternalServerErrorException(
        "SANDBOX_DB_URL is required for SqlSandboxService and cannot be empty.",
      );
    }

    this.pool = new Pool({
      connectionString: sandboxUrl,
      max: SQL_DEFAULTS.POOL_MAX_CONNECTIONS,
      connectionTimeoutMillis: SQL_DEFAULTS.POOL_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: SQL_DEFAULTS.POOL_IDLE_TIMEOUT_MS,
    });
  }

  onModuleDestroy() {
    if (this.pool) {
      this.pool.end().catch(() => {});
    }
  }

  /**
   * Run query within an isolated, per-request schema.
   */
  async executeQuery(options: ExecutionOptions): Promise<ExecutionResult> {
    if (!this.pool) {
      throw new InternalServerErrorException("Sandbox DB connection pool is not initialized.");
    }

    const { schemaSql, seedSql, query, questionType = "SELECT_ONLY" } = options;
    const sandboxId = crypto.randomUUID().replace(/-/g, "_");
    const schemaName = `sandbox_${sandboxId}`;

    const poolWaitStart = Date.now();
    const client: PoolClient = await this.pool.connect();
    const poolWaitTimeMs = Date.now() - poolWaitStart;

    const execStart = Date.now();
    try {
      // 1. Create temporary isolated schema
      await client.query(`CREATE SCHEMA "${schemaName}";`);
      await client.query(`SET search_path TO "${schemaName}";`);

      // 2. Load DDL (schema) & DML (seed)
      if (schemaSql && schemaSql.trim()) {
        await client.query(schemaSql);
      }
      if (seedSql && seedSql.trim()) {
        await client.query(seedSql);
      }

      // 4. Set strict session timeouts & memory caps
      await client.query(`SET statement_timeout = '${SQL_DEFAULTS.STATEMENT_TIMEOUT_MS}ms';`);
      await client.query(`SET lock_timeout = '${SQL_DEFAULTS.LOCK_TIMEOUT_MS}ms';`);
      await client.query(`SET idle_in_transaction_session_timeout = '${SQL_DEFAULTS.IDLE_IN_TRANSACTION_TIMEOUT_MS}ms';`);
      await client.query(`SET work_mem = '${SQL_DEFAULTS.WORK_MEM}';`);

      // 3. Grant scoped access to runner role (or execute under strict session bounds)
      try {
        await client.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO sql_sandbox_runner;`);
        await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schemaName}" TO sql_sandbox_runner;`);
        if (questionType === "DML_ALLOWED") {
          await client.query(`GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schemaName}" TO sql_sandbox_runner;`);
        }
        await client.query(`SET ROLE sql_sandbox_runner;`);
      } catch (grantErr: any) {
        // Fallback: If roles aren't bootstrapped in dev environment, continue with current connection
        this.logger.debug(`Grant/role switch to sql_sandbox_runner skipped or failed: ${grantErr.message}`);
      }

      // 5. Run candidate or expected query
      let res;
      const isSelectOrWith = /^\s*(SELECT|WITH)\b/i.test(query);

      if (isSelectOrWith) {
        await client.query("BEGIN;");
        try {
          await client.query(`DECLARE candidate_cursor CURSOR FOR ${query};`);
          res = await client.query("FETCH 1001 FROM candidate_cursor;");
          await client.query("CLOSE candidate_cursor;");
          await client.query("COMMIT;");
        } catch (cursorErr) {
          await client.query("ROLLBACK;");
          throw cursorErr;
        }
      } else {
        res = await client.query(query);
      }

      const executionTimeMs = Date.now() - execStart;

      const columns = res.fields ? res.fields.map((f) => f.name) : [];
      const rows = res.rows || [];

      if (rows.length > 1000) {
        throw new BadRequestException("Query returned too many rows (exceeded limit of 1000). Please refine your query conditions.");
      }

      return {
        queryResult: {
          columns,
          rows,
          rowCount: res.rowCount !== null && res.rowCount !== undefined ? res.rowCount : rows.length,
        },
        executionTimeMs,
        poolWaitTimeMs,
      };
    } catch (err: any) {
      this.logger.error(`Sandbox execution error in schema ${schemaName}: ${err.message}`);
      throw err;
    } finally {
      // 6. Always clean up isolated schema
      try {
        await client.query(`RESET ROLE;`);
        await client.query(`RESET ALL;`);
      } catch (resetErr: any) {
        this.logger.debug(`RESET connection state failed: ${resetErr.message}`);
      }
      try {
        await client.query(`RESET search_path;`);
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
      } catch (cleanupErr: any) {
        this.logger.error(`Failed to drop schema ${schemaName}: ${cleanupErr.message}`);
      }
      client.release();
    }
  }
}
