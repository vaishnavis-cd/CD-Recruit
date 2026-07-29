export abstract class QueueProviderPort {
  abstract enqueueDelayed(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts: { delayMs: number; jobId?: string },
  ): Promise<void>;

  abstract upsertRepeatable(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    everyMs: number,
    repeatKey: string,
  ): Promise<void>;

  abstract removeJob(queueName: string, jobId: string): Promise<void>;
}
