import { OutboundExecutionProcessor } from "./execution-outbound.processor";
import { ExecutionStatus, SubmissionType } from "@cd-recruit/shared-types";

describe("OutboundExecutionProcessor", () => {
  let processor: OutboundExecutionProcessor;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {
      codingExecution: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: "exec-1",
          ...data,
        })),
      },
      moduleResponse: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockRedis = {
      set: jest.fn().mockResolvedValue(undefined),
      hgetall: jest.fn().mockResolvedValue({}),
      publish: jest.fn().mockResolvedValue(1),
    };

    processor = new OutboundExecutionProcessor(
      mockPrisma,
      mockRedis,
    );
  });

  it("should exit immediately and do nothing if execution is already finalized (Idempotency Guard)", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.COMPLETED, // Already finalized
    });

    await processor.process({ data: { executionId: "exec-1" } } as any);

    expect(mockPrisma.codingExecution.update).not.toHaveBeenCalled();
    expect(mockPrisma.moduleResponse.update).not.toHaveBeenCalled();
    expect(mockRedis.publish).not.toHaveBeenCalled();
  });

  it("should read Piston accumulated cases from Redis and finalize execution", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      status: ExecutionStatus.PENDING,
      submissionType: SubmissionType.RUN,
      question: {
        content: {
          visibleTestCases: [{ input: "1", expectedOutput: "10" }],
        },
      },
    });

    mockRedis.hgetall.mockResolvedValue({
      "0": JSON.stringify({
        caseIndex: 0,
        passed: true,
        status: ExecutionStatus.COMPLETED,
        executionTime: 45,
        memoryUsage: 12000,
        stdout: "10",
        stderr: "",
        compileOutput: "",
        input: "1",
        expectedOutput: "10",
        label: "Visible Test Case 1",
        isHidden: false,
      }),
    });

    await processor.process({ data: { executionId: "exec-1" } } as any);

    // Database updated with COMPLETED
    expect(mockPrisma.codingExecution.update).toHaveBeenCalledWith({
      where: { id: "exec-1" },
      data: expect.objectContaining({
        status: ExecutionStatus.COMPLETED,
        passedTests: 1,
        totalTests: 1,
        executionTime: 45,
        memoryUsage: 12000,
      }),
    });

    // Redis cached and event published
    expect(mockRedis.set).toHaveBeenCalledWith(
      "execution:exec-1",
      expect.stringContaining('"status":"COMPLETED"'),
      300,
    );
    expect(mockRedis.publish).toHaveBeenCalledWith(
      "execution:events:exec-1",
      expect.stringContaining('"status":"COMPLETED"'),
    );
  });

  it("should update ModuleResponse with score when submissionType is SUBMIT", async () => {
    mockPrisma.codingExecution.findUnique.mockResolvedValue({
      id: "exec-submit-1",
      sessionId: "session-1",
      questionId: "q-1",
      status: ExecutionStatus.PENDING,
      submissionType: SubmissionType.SUBMIT,
      question: {
        content: {
          visibleTestCases: [{ input: "1", expectedOutput: "10" }],
          hiddenTestCases: [{ input: "2", expectedOutput: "20" }],
        },
      },
    });

    mockRedis.hgetall.mockResolvedValue({
      "0": JSON.stringify({
        caseIndex: 0,
        passed: true,
        status: ExecutionStatus.COMPLETED,
        executionTime: 40,
        memoryUsage: 12000,
        stdout: "10",
        stderr: "",
        compileOutput: "",
        input: "1",
        expectedOutput: "10",
        label: "TC 1",
        isHidden: false,
      }),
      "1": JSON.stringify({
        caseIndex: 1,
        passed: false,
        status: ExecutionStatus.RUNTIME_ERROR,
        executionTime: 50,
        memoryUsage: 12000,
        stdout: "",
        stderr: "ZeroDivisionError",
        compileOutput: "",
        input: "2",
        expectedOutput: "20",
        label: "TC 2",
        isHidden: true,
      }),
    });

    mockPrisma.moduleResponse.findUnique.mockResolvedValue({
      id: "mr-1",
      responsePayload: {},
    });

    await processor.process({ data: { executionId: "exec-submit-1" } } as any);

    // Module response updated with 50% score (1/2 passed)
    expect(mockPrisma.moduleResponse.update).toHaveBeenCalledWith({
      where: { id: "mr-1" },
      data: {
        responsePayload: expect.objectContaining({
          status: ExecutionStatus.RUNTIME_ERROR,
          score: 0.5,
          passedTests: 1,
          totalTests: 2,
        }),
      },
    });
  });
});
