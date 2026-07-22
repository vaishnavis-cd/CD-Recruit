import { Injectable, OnModuleInit } from "@nestjs/common";
import { QueueProviderPort } from "./queue-provider.port";
import { LocalFakeQueueProvider } from "./local-fake-queue.provider";
import { SessionService } from "../session/session.service";
import { HeartbeatService } from "./heartbeat.service";

@Injectable()
export class LocalFakeQueueHandlersBootstrap implements OnModuleInit {
  constructor(
    private readonly queueProvider: QueueProviderPort,
    private readonly sessionService: SessionService,
    private readonly heartbeatService: HeartbeatService,
  ) {}

  onModuleInit() {
    if (this.queueProvider instanceof LocalFakeQueueProvider) {
      this.queueProvider.registerHandler("grace-window", "auto-submit", (payload) =>
        this.sessionService.autoSubmit(payload.sessionId as string),
      );
      this.queueProvider.registerHandler("heartbeat-monitor", "scan", () =>
        this.heartbeatService.scanAndMarkStale(),
      );
      this.queueProvider.registerHandler("heartbeat-monitor", "retention-cleanup", () =>
        this.heartbeatService.cleanupExpiredBiometrics(),
      );
    }
  }
}
