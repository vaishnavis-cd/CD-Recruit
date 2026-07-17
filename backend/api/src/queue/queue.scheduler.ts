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

    this.logger.log(
      `Heartbeat monitor registered: scanning every ${QueueScheduler.SCAN_INTERVAL_MS / 1000} s`,
    );
  }
}
