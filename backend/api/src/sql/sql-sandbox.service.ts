import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../config/configuration";
import { Client } from "pg";
import * as crypto from "crypto";
import { SqlQueryResult } from "./sql.types";
import { SQL_DEFAULTS } from "./sql.constants";

@Injectable()
export class SqlSandboxService {
  private readonly logger = new Logger(SqlSandboxService.name);
  private readonly databaseUrl: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.databaseUrl = this.configService.get<string>("databaseUrl", { infer: true });
  }

  async executeQuery(
    schemaSql: string,
    seedSql: string,
    query: string,
  ): Promise<SqlQueryResult> {
    const sandboxId = crypto.randomUUID().replace(/-/g, "_");
    const schemaName = `sandbox_${sandboxId}`;

    const client = new Client({
      connectionString: this.databaseUrl,
    });

    await client.connect();

    try {
      // 1. Create temporary schema
      await client.query(`CREATE SCHEMA "${schemaName}";`);

      // 2. Set search path to point only to this schema
      await client.query(`SET search_path TO "${schemaName}";`);

      // 3. Load question schema (DDL)
      if (schemaSql && schemaSql.trim()) {
        await client.query(schemaSql);
      }

      // 4. Load seed data (DML)
      if (seedSql && seedSql.trim()) {
        await client.query(seedSql);
      }

      // 5. Set statement timeout to prevent infinite execution/hanging queries
      await client.query(`SET statement_timeout = ${SQL_DEFAULTS.EXECUTION_TIMEOUT_MS};`);

      // 6. Run candidate/expected query
      const res = await client.query(query);

      // Extract columns and rows
      const columns = res.fields ? res.fields.map((f) => f.name) : [];
      const rows = res.rows || [];

      return {
        columns,
        rows,
        rowCount: res.rowCount !== null ? res.rowCount : rows.length,
      };
    } catch (err: any) {
      this.logger.error(`Error executing query in sandbox schema ${schemaName}: ${err.message}`);
      throw err;
    } finally {
      try {
        // Reset search path and drop the temporary schema cascadingly
        await client.query(`RESET search_path;`);
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
      } catch (cleanupErr: any) {
        this.logger.error(`Failed to clean up sandbox schema ${schemaName}: ${cleanupErr.message}`);
      }
      await client.end();
    }
  }
}
