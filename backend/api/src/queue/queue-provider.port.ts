export abstract class QueueProviderPort {
  abstract enqueue(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts?: { delayMs?: number; jobId?: string; priority?: number },
  ): Promise<void>;

  abstract enqueueDelayed(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    opts: { delayMs: number; jobId?: string; priority?: number },
  ): Promise<void>;

  abstract upsertRepeatable(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    everyMs: number,
    repeatKey: string,
  ): Promise<void>;

  abstract getJobState(
    queueName: string,
    jobId: string,
  ): Promise<string | null>;
}
