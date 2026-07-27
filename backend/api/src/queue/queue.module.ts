import { Module, Global, forwardRef } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { BullmqQueueProvider } from "./bullmq-queue.provider";
import { QueueScheduler } from "./queue.scheduler";
import { HeartbeatService } from "./heartbeat.service";
import { HeartbeatMonitorProcessor } from "./heartbeat-monitor.processor";
import { GraceWindowProcessor } from "./grace-window.processor";
import { SessionModule } from "@app/session/session.module";

@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: "heartbeat-monitor" },
      { name: "grace-window" },
    ),
    forwardRef(() => SessionModule),
  ],
  providers: [
    BullmqQueueProvider,
    HeartbeatMonitorProcessor,
    GraceWindowProcessor,
    QueueScheduler,
    HeartbeatService,
  ],
  exports: [BullmqQueueProvider],
})
export class QueueModule {}
