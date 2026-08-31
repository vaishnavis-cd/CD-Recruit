import { Injectable, OnModuleInit, Inject, forwardRef } from "@nestjs/common";
import { LocalFakeQueueProvider } from "./local-fake-queue.provider";
import { SessionService } from "../session/session.service";
import { HeartbeatService } from "./heartbeat.service";
import { InboundExecutionProcessor } from "./execution/execution-inbound.processor";
import { OutboundExecutionProcessor } from "./execution/execution-outbound.processor";
import { WatchdogExecutionProcessor } from "./execution/execution-watchdog.processor";

@Injectable()
export class LocalFakeQueueHandlersBootstrap implements OnModuleInit {
  constructor(
    @Inject(forwardRef(() => LocalFakeQueueProvider))
    private readonly fakeQueue: LocalFakeQueueProvider,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    private readonly heartbeatService: HeartbeatService,
    private readonly inboundProcessor: InboundExecutionProcessor,
    private readonly outboundProcessor: OutboundExecutionProcessor,
    private readonly watchdogProcessor: WatchdogExecutionProcessor,
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
      "execution-inbound",
      "run",
      async (payload) => {
        await this.inboundProcessor.process({ data: payload as any } as any);
      },
    );

    this.fakeQueue.registerHandler(
      "execution-inbound",
      "submit",
      async (payload) => {
        await this.inboundProcessor.process({ data: payload as any } as any);
      },
    );

    this.fakeQueue.registerHandler(
      "execution-outbound",
      "save-result",
      async (payload) => {
        await this.outboundProcessor.process({ data: payload as any } as any);
      },
    );

    this.fakeQueue.registerHandler(
      "execution-watchdog",
      "check-stuck",
      async (payload) => {
        await this.watchdogProcessor.process({ data: payload as any } as any);
      },
    );
  }
}
