import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ReconciliationService } from "./reconciliation.service";

@Injectable()
export class ReconciliationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly reconciliationService: ReconciliationService) {}

  onModuleInit(): void {
    // Avoid scheduling timer in Jest test runs to keep test runners clean and prevent open handles
    if (process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === "test") {
      this.logger.log("[ReconciliationScheduler] Test environment detected; automated nightly timer disabled.");
      return;
    }

    this.scheduleNextNightlyAudit();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedules execution for 02:00 UTC every day.
   */
  private scheduleNextNightlyAudit(): void {
    const now = new Date();
    const next2AmUtc = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + (now.getUTCHours() >= 2 ? 1 : 0),
        2,
        0,
        0,
        0,
      ),
    );
    const delayMs = Math.max(1000, next2AmUtc.getTime() - now.getTime());

    this.logger.log(
      `[ReconciliationScheduler] Next nightly reconciliation scheduled in ${Math.round(
        delayMs / 1000 / 60,
      )} minutes (at ${next2AmUtc.toISOString()})`,
    );

    this.timer = setTimeout(async () => {
      try {
        this.logger.log("[ReconciliationScheduler] Executing scheduled nightly reconciliation audit...");
        const result = await this.reconciliationService.runNightlyAudit();
        this.logger.log(
          `[ReconciliationScheduler] Scheduled nightly reconciliation completed: status=${result.status}, driftDetected=${result.driftDetected}`,
        );
      } catch (err: any) {
        this.logger.error(
          `[ReconciliationScheduler] Scheduled nightly reconciliation failed: ${err.message}`,
          err.stack,
        );
      } finally {
        this.scheduleNextNightlyAudit();
      }
    }, delayMs);
  }
}
