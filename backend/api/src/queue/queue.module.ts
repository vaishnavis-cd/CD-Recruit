import { Module, Global, forwardRef } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QueueProviderPort } from "./queue-provider.port";
import { BullmqQueueProvider } from "./bullmq-queue.provider";
import { LocalFakeQueueProvider } from "./local-fake-queue.provider";
import { LocalFakeQueueHandlersBootstrap } from "./local-fake-queue-handlers.bootstrap";
import { QueueScheduler } from "./queue.scheduler";
import { HeartbeatService } from "./heartbeat.service";
import { HeartbeatMonitorProcessor } from "./heartbeat-monitor.processor";
import { GraceWindowProcessor } from "./grace-window.processor";
import { SessionModule } from "@app/session/session.module";
<<<<<<< HEAD
=======
import { NosqlModule } from "../modules/nosql/nosql.module";

import { IdentityCaptureService } from "./identity-capture.service";
import { IdentityCaptureMonitorProcessor } from "./identity-capture-monitor.processor";
>>>>>>> origin/dev-phase2

const infraMode = process.env.INFRA_MODE ?? "local";
const isFull = infraMode === "full";

@Global()
@Module({
  imports: [
    ...(isFull
      ? [
          BullModule.registerQueue(
            { name: "heartbeat-monitor" },
            { name: "grace-window" },
<<<<<<< HEAD
=======
            { name: "identity-capture-monitor" },
>>>>>>> origin/dev-phase2
          ),
        ]
      : []),
    forwardRef(() => SessionModule),
<<<<<<< HEAD
  ],
  providers: [
    ...(isFull
      ? [BullmqQueueProvider, HeartbeatMonitorProcessor, GraceWindowProcessor]
=======
    forwardRef(() => NosqlModule),
  ],
  providers: [
    ...(isFull
      ? [BullmqQueueProvider, HeartbeatMonitorProcessor, GraceWindowProcessor, IdentityCaptureMonitorProcessor]
>>>>>>> origin/dev-phase2
      : [LocalFakeQueueProvider, LocalFakeQueueHandlersBootstrap]),
    {
      provide: QueueProviderPort,
      useExisting: isFull ? BullmqQueueProvider : LocalFakeQueueProvider,
    },
    QueueScheduler,
    HeartbeatService,
<<<<<<< HEAD
=======
    IdentityCaptureService,
>>>>>>> origin/dev-phase2
  ],
  exports: [QueueProviderPort],
})
export class QueueModule {}
