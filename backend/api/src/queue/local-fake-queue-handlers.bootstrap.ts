import { Injectable, OnModuleInit, Inject, forwardRef } from "@nestjs/common";
import { LocalFakeQueueProvider } from "./local-fake-queue.provider";
import { SessionService } from "@app/session/session.service";
import { HeartbeatService } from "./heartbeat.service";

@Injectable()
export class LocalFakeQueueHandlersBootstrap implements OnModuleInit {
  constructor(
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

    this.fakeQueue.registerHandler(
      "infra-scaling",
      "scale-up-judge0",
      async (payload) => {
        console.log(`[LocalFakeQueue] scale-up-judge0 dummy handler triggered for drive ${payload.driveId}`);
      },
    );

    this.fakeQueue.registerHandler(
      "infra-scaling",
      "scale-down-judge0",
      async (payload) => {
        console.log(`[LocalFakeQueue] scale-down-judge0 dummy handler triggered for drive ${payload.driveId}`);
      },
    );

    this.fakeQueue.registerHandler(
      "infra-scaling",
      "check-queue-health",
      async () => {
        // no-op locally
      },
    );
  }
}
