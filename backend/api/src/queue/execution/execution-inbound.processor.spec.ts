import { InboundExecutionProcessor } from "./execution-inbound.processor";
import { ExecutionStatus } from "@cd-recruit/shared-types";

describe("InboundExecutionProcessor", () => {
  let processor: InboundExecutionProcessor;
  let mockPrisma: any;
  let mockQueueProvider: any;
  let mockRedis: any;
  let mockConfig: any;
  let mockPistonClient: any;

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
    };
    mockRedis = {
      set: jest.fn().mockResolvedValue(undefined),
      hexists: jest.fn().mockResolvedValue(false),
      eval: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(undefined),
    };
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === "codeExecutionEngine") return "piston";
        return null;
      }),
    };
    mockPistonClient = {
      execute: jest.fn().mockResolvedValue({
        run: {
          stdout: "42\n",
          stderr: "",
          code: 0,
          signal: null,
          wall_time: 120,
          memory: 15000000,
        },
      }),
    };

    processor = new InboundExecutionProcessor(
      mockPrisma,
      mockQueueProvider,
      mockRedis,
      mockConfig,
      mockPistonClient,
    );
  });

  it("should ignore execution if not found or status is not PENDING", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue(null);

    await processor.process({ data: { executionId: "exec-1", type: "run" } } as any);
    expect(mockPistonClient.execute).not.toHaveBeenCalled();

    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.COMPLETED,
    });
    await processor.process({ data: { executionId: "exec-1", type: "run" } } as any);
    expect(mockPistonClient.execute).not.toHaveBeenCalled();
  });

  it("should process test cases via Piston, accumulate results and trigger outbound enqueue when all complete", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.PENDING,
      sourceCode: "print(42)",
      languageId: 71, // Python
      question: {
        content: {
          visibleTestCases: [
            { input: "1", expectedOutput: "42", label: "TC 1" },
            { input: "2", expectedOutput: "42", label: "TC 2" },
          ],
        },
      },
    });

    // Case 0 returns 0, Case 1 returns 1 (completes all tests)
    mockRedis.eval
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    await processor.process({ data: { executionId: "exec-1", type: "run" } } as any);

    // Watchdog scheduled
    expect(mockQueueProvider.enqueueDelayed).toHaveBeenCalledWith(
      "execution-watchdog",
      "check-stuck",
      { executionId: "exec-1" },
      expect.objectContaining({ jobId: "watchdog-exec-1" }),
    );

    // Both test cases executed
    expect(mockPistonClient.execute).toHaveBeenCalledTimes(2);

    // Outbound enqueued with deterministic jobId
    expect(mockQueueProvider.enqueue).toHaveBeenCalledWith(
      "execution-outbound",
      "process-results",
      { executionId: "exec-1" },
      { jobId: "outbound-exec-1", priority: 1 },
    );
  });

  it("should skip test cases already recorded in accumulator (HEXISTS check)", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-2",
      status: ExecutionStatus.PENDING,
      sourceCode: "print(42)",
      languageId: 71,
      question: {
        content: {
          visibleTestCases: [
            { input: "1", expectedOutput: "42" },
            { input: "2", expectedOutput: "42" },
          ],
        },
      },
    });

    // First case already exists
    mockRedis.hexists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await processor.process({ data: { executionId: "exec-2", type: "run" } } as any);

    // Only second case executed
    expect(mockPistonClient.execute).toHaveBeenCalledTimes(1);
  });

  it("should mark execution as FAILED without scoring when infra retries exhaust", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-3",
      status: ExecutionStatus.PENDING,
      sourceCode: "print(42)",
      languageId: 71,
      question: {
        content: {
          visibleTestCases: [{ input: "1", expectedOutput: "42" }],
        },
      },
    });

    mockPistonClient.execute.mockRejectedValue(new Error("Piston connection refused"));

    await processor.process({ data: { executionId: "exec-3", type: "run" } } as any);

    // Retried 3 times
    expect(mockPistonClient.execute).toHaveBeenCalledTimes(3);

    // DB updated to FAILED with infra error
    expect(mockPrisma.codingExecution.update).toHaveBeenCalledWith({
      where: { id: "exec-3" },
      data: expect.objectContaining({
        status: ExecutionStatus.FAILED,
        stderr: expect.stringContaining("Infrastructure error: sandbox execution failed after retries"),
      }),
    });

    // Outbound NOT enqueued
    expect(mockQueueProvider.enqueue).not.toHaveBeenCalled();
  });
});
