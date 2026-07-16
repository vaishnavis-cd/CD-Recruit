import { Module, forwardRef } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

import { HeartbeatMonitorProcessor } from "./heartbeat-monitor.processor";
import { GraceWindowProcessor } from "./grace-window.processor";
import { QueueScheduler } from "./queue.scheduler";
import { SessionModule } from "@app/session/session.module";

/**
 * QueueModule — registers BullMQ queues and their processors.
 *
 * Queues:
 *   heartbeat-monitor — repeating scan every 10 s; detects stale sessions
 *   grace-window      — delayed per-session job; auto-submits after grace window
 *
 * Circular dependency: SessionModule imports QueueModule (for the grace-window
 * queue token), and QueueModule imports SessionModule (for SessionService used
 * by processors).  Resolved via forwardRef on both sides.
 *
 * The Redis connection is configured in AppModule via BullModule.forRootAsync() —
 * no connection config needed here.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: "heartbeat-monitor" }),
    BullModule.registerQueue({ name: "grace-window" }),
    forwardRef(() => SessionModule),
  ],
  providers: [HeartbeatMonitorProcessor, GraceWindowProcessor, QueueScheduler],
  exports: [BullModule],
})
export class QueueModule {}
