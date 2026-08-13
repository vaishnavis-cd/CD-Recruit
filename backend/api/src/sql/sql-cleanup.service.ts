import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

@Injectable()
export class SqlCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqlCleanupService.name);
  private pool: Pool | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const sandboxUrl =
      this.configService.get<string>("sandboxDatabaseUrl") ||
      this.configService.get<string>("app.sandboxDatabaseUrl") ||
      process.env.SANDBOX_DB_URL;

    if (sandboxUrl) {
      await this.ensureSandboxDatabaseExists(sandboxUrl);

      this.pool = new Pool({
        connectionString: sandboxUrl,
        max: 2,
        connectionTimeoutMillis: 2000,
      });

      // Run cleanup sweep every 5 minutes
      this.cleanupInterval = setInterval(() => {
        this.sweepOrphanSchemas().catch((err) => {
          this.logger.warn(`Orphan schema sweep status: ${err.message}`);
        });
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
   * Ensures the target sandbox database exists on the PostgreSQL server, creating it if missing.
   */
  private async ensureSandboxDatabaseExists(sandboxUrl: string): Promise<void> {
    try {
      const urlObj = new URL(sandboxUrl);
      const targetDb = urlObj.pathname.replace(/^\//, "");
      if (!targetDb || targetDb === "postgres") return;

      // Connect to default 'postgres' database to check/create target db
      urlObj.pathname = "/postgres";
      const adminPool = new Pool({
        connectionString: urlObj.toString(),
        connectionTimeoutMillis: 2000,
      });

      const client = await adminPool.connect();
      try {
        const checkRes = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [targetDb],
        );
        if (checkRes.rowCount === 0) {
          await client.query(`CREATE DATABASE "${targetDb}"`);
          this.logger.log(`Created missing sandbox database "${targetDb}"`);
        }
      } finally {
        client.release();
        await adminPool.end().catch(() => {});
      }
    } catch (err: any) {
      this.logger.debug(`Sandbox DB auto-creation check note: ${err?.message}`);
    }
  }

  /**
   * Sweeps and drops sandbox schemas older than ORPHAN_SCHEMA_MAX_AGE_MINUTES.
   */
  async sweepOrphanSchemas(): Promise<number> {
    if (!this.pool) return 0;
    let client;
    try {
      client = await this.pool.connect();
    } catch (err: any) {
      this.logger.debug(`Could not connect to sandbox database for cleanup: ${err?.message}`);
      return 0;
    }

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
