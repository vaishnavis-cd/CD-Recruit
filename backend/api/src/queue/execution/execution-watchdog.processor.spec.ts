import { WatchdogExecutionProcessor } from "./execution-watchdog.processor";
import { ExecutionStatus, SubmissionType } from "@cd-recruit/shared-types";

describe("WatchdogExecutionProcessor", () => {
  let processor: WatchdogExecutionProcessor;
  let mockPrisma: any;
  let mockQueueProvider: any;
  let mockRedis: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      codingExecution: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockQueueProvider = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      enqueueDelayed: jest.fn().mockResolvedValue(undefined),
      getJobState: jest.fn().mockResolvedValue("active"),
    };
    mockRedis = {
      hlen: jest.fn().mockResolvedValue(0),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === "codeExecutionEngine") return "piston";
        return null;
      }),
    };

    processor = new WatchdogExecutionProcessor(
      mockPrisma,
      mockQueueProvider,
      mockRedis,
      mockConfig,
    );
  });

  it("should ignore execution if not found or not PENDING", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue(null);
    await processor.process({ data: { executionId: "exec-1" } } as any);
    expect(mockQueueProvider.enqueue).not.toHaveBeenCalled();

    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.COMPLETED,
    });
    await processor.process({ data: { executionId: "exec-1" } } as any);
    expect(mockQueueProvider.enqueue).not.toHaveBeenCalled();
  });

  it("should recover and enqueue outbound if all cases are already accumulated in Redis HLEN", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.PENDING,
      totalTests: 3,
    });
    // Redis has all 3 cases
    mockRedis.hlen.mockResolvedValue(3);

    await processor.process({ data: { executionId: "exec-1", attempt: 1 } } as any);

    expect(mockQueueProvider.enqueue).toHaveBeenCalledWith(
      "execution-outbound",
      "recover-results",
      { executionId: "exec-1" },
      { jobId: "outbound-exec-1", priority: 1 },
    );
    expect(mockPrisma.codingExecution.update).not.toHaveBeenCalled();
  });

  it("should reschedule watchdog if inbound job is active/waiting and attempt <= 3 (up to 90s)", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.PENDING,
      totalTests: 3,
    });
    mockRedis.hlen.mockResolvedValue(1); // 1/3 cases done
    mockQueueProvider.getJobState.mockResolvedValue("active");

    await processor.process({ data: { executionId: "exec-1", attempt: 1 } } as any);

    // Rescheduled with attempt: 2
    expect(mockQueueProvider.enqueueDelayed).toHaveBeenCalledWith(
      "execution-watchdog",
      "check-stuck",
      { executionId: "exec-1", attempt: 2 },
      { delayMs: 25000, jobId: "watchdog-exec-1-attempt-2" },
    );
    expect(mockPrisma.codingExecution.update).not.toHaveBeenCalled();
  });

  it("should trigger one-time priority-1 requeue if attempt > 3 and job still active", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.PENDING,
      submissionType: SubmissionType.RUN,
      totalTests: 3,
    });
    mockRedis.hlen.mockResolvedValue(1);
    mockQueueProvider.getJobState.mockResolvedValue("active");
    mockRedis.get.mockResolvedValue(null); // not yet requeued

    await processor.process({ data: { executionId: "exec-1", attempt: 4 } } as any);

    // Requeued to execution-inbound with priority 1
    expect(mockQueueProvider.enqueue).toHaveBeenCalledWith(
      "execution-inbound",
      "run",
      { executionId: "exec-1", type: "run" },
      { jobId: "requeue-exec-1", priority: 1 },
    );

    // Scheduled post-requeue check
    expect(mockQueueProvider.enqueueDelayed).toHaveBeenCalledWith(
      "execution-watchdog",
      "check-stuck",
      { executionId: "exec-1", attempt: 5 },
      { delayMs: 25000, jobId: "watchdog-exec-1-post-requeue" },
    );
  });

  it("should mark execution as FAILED if stalled permanently after requeue or not_found", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.PENDING,
      submissionType: SubmissionType.RUN,
      totalTests: 3,
    });
    mockRedis.hlen.mockResolvedValue(0);
    mockQueueProvider.getJobState.mockResolvedValue(null); // not found

    await processor.process({ data: { executionId: "exec-1", attempt: 4 } } as any);

    expect(mockPrisma.codingExecution.update).toHaveBeenCalledWith({
      where: { id: "exec-1" },
      data: expect.objectContaining({
        status: ExecutionStatus.FAILED,
        stderr: expect.stringContaining("Execution stalled: sandbox worker timed out"),
      }),
    });
  });
});
