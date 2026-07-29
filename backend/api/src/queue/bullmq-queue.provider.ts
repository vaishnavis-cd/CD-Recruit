import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QueueProviderPort } from "./queue-provider.port";

@Injectable()
export class BullmqQueueProvider extends QueueProviderPort {
  private readonly logger = new Logger(BullmqQueueProvider.name);

  constructor(
    @InjectQueue("heartbeat-monitor")
    private readonly heartbeatQueue: Queue,
    @InjectQueue("grace-window")
    private readonly graceWindowQueue: Queue,
    @InjectQueue("infra-scaling")
    private readonly infraScalingQueue: Queue,
  ) {
    super();
  }

  private resolveQueue(queueName: string): Queue {
    switch (queueName) {
      case "heartbeat-monitor":
        return this.heartbeatQueue;
      case "grace-window":
        return this.graceWindowQueue;
      case "infra-scaling":
        return this.infraScalingQueue;
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

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.resolveQueue(queueName);
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (err: any) {
      this.logger.warn(`Failed to remove job ${jobId} from queue ${queueName}: ${err.message}`);
    }
  }
}
