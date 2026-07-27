import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QueueProviderPort } from "./queue-provider.port";

@Injectable()
export class BullmqQueueProvider extends QueueProviderPort {
  constructor(
    @InjectQueue("heartbeat-monitor")
    private readonly heartbeatQueue: Queue,
    @InjectQueue("grace-window")
    private readonly graceWindowQueue: Queue,
  ) {
    super();
  }

  private resolveQueue(queueName: string): Queue {
    switch (queueName) {
      case "heartbeat-monitor":
        return this.heartbeatQueue;
      case "grace-window":
        return this.graceWindowQueue;
      default:
        throw new Error(`BullmqQueueProvider: unknown queue "${queueName}"`);
    }
  }

  async enqueueDelayed(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts: { delayMs: number; jobId?: string },
  ): Promise<void> {
    await this.resolveQueue(queueName).add(jobName, payload, {
      delay: opts.delayMs,
      jobId: opts.jobId,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async upsertRepeatable(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    everyMs: number,
    repeatKey: string,
  ): Promise<void> {
    const queue = this.resolveQueue(queueName);
    const existing = await queue.getRepeatableJobs();
    // Remove matches by key or by job name
    for (const job of existing) {
      if (job.key === repeatKey || job.name === jobName || job.id === repeatKey) {
        await queue.removeRepeatableByKey(job.key);
      }
    }
    await queue.add(
      jobName,
      payload,
      {
        repeat: { every: everyMs },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
