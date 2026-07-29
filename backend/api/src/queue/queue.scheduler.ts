import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { QueueProviderPort } from "./queue-provider.port";

@Injectable()
export class QueueScheduler implements OnModuleInit {
  private readonly logger = new Logger(QueueScheduler.name);

  private static readonly SCAN_INTERVAL_MS = 10_000;

  constructor(
    private readonly queueProvider: QueueProviderPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queueProvider.upsertRepeatable(
      "heartbeat-monitor",
      "scan",
      {},
      QueueScheduler.SCAN_INTERVAL_MS,
      "heartbeat-scan",
    );

    await this.queueProvider.upsertRepeatable(
      "heartbeat-monitor",
      "retention-cleanup",
      {},
      60_000, // every 60 seconds
      "biometric-retention-cleanup",
    );

    await this.queueProvider.upsertRepeatable(
      "infra-scaling",
      "check-queue-health",
      {},
      120_000, // every 120 seconds (2 minutes)
      "judge0-queue-health",
    );

    this.logger.log(
      `Heartbeat monitor registered: scanning every ${QueueScheduler.SCAN_INTERVAL_MS / 1000} s, retention cleanup scanning every 60 s, and queue-health check scheduled every 120 s`,
    );
  }
}
