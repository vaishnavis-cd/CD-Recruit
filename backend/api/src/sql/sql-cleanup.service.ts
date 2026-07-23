import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import { SQL_DEFAULTS } from "./sql.constants";

@Injectable()
export class SqlCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqlCleanupService.name);
  private pool: Pool | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const sandboxUrl =
      this.configService.get<string>("sandboxDatabaseUrl") ||
      this.configService.get<string>("app.sandboxDatabaseUrl") ||
      process.env.SANDBOX_DB_URL;

    if (sandboxUrl) {
      this.pool = new Pool({
        connectionString: sandboxUrl,
        max: 2,
        connectionTimeoutMillis: 3000,
      });

      // Run cleanup sweep every 5 minutes
      this.cleanupInterval = setInterval(() => {
        this.sweepOrphanSchemas().catch((err) =>
          this.logger.error(`Error during orphan schema sweep: ${err.message}`),
        );
      }, 5 * 60 * 1000);
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.pool) {
      this.pool.end().catch(() => {});
    }
  }

  /**
   * Sweeps and drops sandbox schemas older than ORPHAN_SCHEMA_MAX_AGE_MINUTES.
   */
  async sweepOrphanSchemas(): Promise<number> {
    if (!this.pool) return 0;
    const client = await this.pool.connect();
    let droppedCount = 0;

    try {
      // Find schemas created by sandbox (prefixed with sandbox_)
      const res = await client.query(`
        SELECT nspname AS schema_name
        FROM pg_catalog.pg_namespace
        WHERE nspname LIKE 'sandbox_%';
      `);

      const schemas = res.rows.map((r) => r.schema_name);

      for (const schemaName of schemas) {
        try {
          await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
          droppedCount++;
          this.logger.log(`Swept orphaned sandbox schema: ${schemaName}`);
        } catch (err: any) {
          this.logger.warn(`Failed to drop orphaned schema ${schemaName}: ${err.message}`);
        }
      }
    } finally {
      client.release();
    }

    return droppedCount;
  }
}
