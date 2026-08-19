import { Injectable, OnModuleInit, Inject, forwardRef } from "@nestjs/common";
import { LocalFakeQueueProvider } from "./local-fake-queue.provider";
import { SessionService } from "@app/session/session.service";
import { HeartbeatService } from "./heartbeat.service";
<<<<<<< HEAD
=======
import { NosqlSandboxService } from "../modules/nosql/nosql-sandbox.service";

import { IdentityCaptureService } from "./identity-capture.service";
>>>>>>> origin/dev-phase2

@Injectable()
export class LocalFakeQueueHandlersBootstrap implements OnModuleInit {
  constructor(
    private readonly fakeQueue: LocalFakeQueueProvider,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    private readonly heartbeatService: HeartbeatService,
<<<<<<< HEAD
=======
    private readonly nosqlSandboxService: NosqlSandboxService,
    private readonly identityCaptureService: IdentityCaptureService,
>>>>>>> origin/dev-phase2
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
<<<<<<< HEAD
=======

    this.fakeQueue.registerHandler(
      "heartbeat-monitor",
      "drop-sandbox",
      async (payload) => {
        const sandboxDbName = payload.sandboxDbName as string;
        if (sandboxDbName) {
          await this.nosqlSandboxService.dropSandbox(sandboxDbName);
        }
      },
    );

    this.fakeQueue.registerHandler(
      "identity-capture-monitor",
      "scan",
      async () => {
        await this.identityCaptureService.scanAndMarkMissed();
      },
    );
>>>>>>> origin/dev-phase2
  }
}
