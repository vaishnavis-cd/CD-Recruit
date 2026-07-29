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
import { InfraScalingProcessor } from "./infra-scaling.processor";
import { SessionModule } from "@app/session/session.module";
import { Judge0Module } from "../integrations/judge0/judge0.module";

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
            { name: "infra-scaling" },
          ),
          Judge0Module,
        ]
      : []),
    forwardRef(() => SessionModule),
  ],
  providers: [
    ...(isFull
      ? [
          BullmqQueueProvider,
          HeartbeatMonitorProcessor,
          GraceWindowProcessor,
          InfraScalingProcessor,
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
