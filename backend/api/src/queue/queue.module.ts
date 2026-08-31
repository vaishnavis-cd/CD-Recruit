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
import { InboundExecutionProcessor } from "./execution/execution-inbound.processor";
import { OutboundExecutionProcessor } from "./execution/execution-outbound.processor";
import { WatchdogExecutionProcessor } from "./execution/execution-watchdog.processor";
import { SessionModule } from "../session/session.module";
import { Judge0Module } from "../integrations/judge0/judge0.module";

import { PrismaModule } from "../prisma/prisma.module";
import { MinioModule } from "../integrations/minio/minio.module";

const infraMode = process.env.INFRA_MODE ?? "local";
const isFull = infraMode === "full";

@Global()
@Module({
  imports: [
    PrismaModule,
    MinioModule,
    Judge0Module,
    ...(isFull
      ? [
          BullModule.registerQueue(
            { name: "heartbeat-monitor" },
            { name: "grace-window" },
            { name: "execution-inbound" },
            { name: "execution-outbound" },
            { name: "execution-watchdog" },
          ),
        ]
      : []),
    forwardRef(() => SessionModule),
  ],
  providers: [
    InboundExecutionProcessor,
    OutboundExecutionProcessor,
    WatchdogExecutionProcessor,
    ...(isFull
      ? [
          BullmqQueueProvider,
          HeartbeatMonitorProcessor,
          GraceWindowProcessor,
        ]
      : [LocalFakeQueueProvider, LocalFakeQueueHandlersBootstrap]),
    {
      provide: QueueProviderPort,
      useExisting: isFull ? BullmqQueueProvider : LocalFakeQueueProvider,
    },
    QueueScheduler,
    HeartbeatService,
  ],
  exports: [QueueProviderPort],
})
export class QueueModule {}

