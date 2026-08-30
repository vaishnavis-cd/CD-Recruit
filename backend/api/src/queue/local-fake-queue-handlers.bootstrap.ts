import { Injectable, OnModuleInit, Inject, forwardRef } from "@nestjs/common";
import { LocalFakeQueueProvider } from "./local-fake-queue.provider";
import { SessionService } from "../session/session.service";
import { HeartbeatService } from "./heartbeat.service";

@Injectable()
export class LocalFakeQueueHandlersBootstrap implements OnModuleInit {
  constructor(
    @Inject(forwardRef(() => LocalFakeQueueProvider))
    private readonly fakeQueue: LocalFakeQueueProvider,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    private readonly heartbeatService: HeartbeatService,
  ) {}

  onModuleInit() {
    this.fakeQueue.registerHandler(
      "grace-window",
      "disconnect-grace-window",
      async (payload) => {
        const sessionId = payload.sessionId as string;
        if (sessionId) {
          await this.sessionService.autoSubmit(sessionId);
        }
      },
    );

    this.fakeQueue.registerHandler(
      "heartbeat-monitor",
      "scan",
      async () => {
        await this.heartbeatService.scanAndMarkStale();
      },
    );

    this.fakeQueue.registerHandler(
      "heartbeat-monitor",
      "retention-cleanup",
      async () => {
        await this.heartbeatService.cleanupExpiredBiometrics();
      },
    );
  }
}
