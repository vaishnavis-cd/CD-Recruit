import { Test, TestingModule } from "@nestjs/testing";
import { Judge0Service } from "./judge0.service";
import { Judge0Client } from "./judge0.client";
import { ConfigService } from "@nestjs/config";
import { ExecutionStatus } from "@cd-recruit/shared-types";

jest.setTimeout(20000);

describe("Judge0Service", () => {
  let service: Judge0Service;
  let mockClient: jest.Mocked<Partial<Judge0Client>>;

  beforeEach(() => {
    mockClient = {
      createBatchSubmissions: jest.fn(),
      getBatchSubmissions: jest.fn(),
      getSubmission: jest.fn(),
    };

    service = new Judge0Service(mockClient as unknown as Judge0Client);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should process batch submissions via token polling and aggregate results", async () => {
    (mockClient.createBatchSubmissions as jest.Mock).mockResolvedValueOnce([
      { token: "test-token-1" },
    ]);
    (mockClient.getBatchSubmissions as jest.Mock).mockResolvedValueOnce([
      {
        token: "test-token-1",
        status: { id: 3, description: "Accepted" },
        stdout: Buffer.from("3\n").toString("base64"),
        stderr: null,
        compile_output: null,
        time: "0.01",
        memory: 1024,
      },
    ]);

    const testCases = [
      { input: "1,2", expectedOutput: "3", label: "Case 1" },
    ];

    const result = await service.runTests(
      "console.log(3);",
      63,
      "test-q-1",
      testCases,
    );

    expect(result.status).toBe(ExecutionStatus.COMPLETED);
    expect(result.passedTests).toBe(1);
    expect(result.results[0].passed).toBe(true);
  });

  it("should trigger onEachResult callback per token across multiple polling ticks", async () => {
    const tokens = ["token-1", "token-2", "token-3"];
    const callbackHits: Array<{ token: string; statusId: number }> = [];

    // Tick 1: token-1 finishes (Accepted=3), token-2 is In Queue(1), token-3 is Processing(2)
    // Tick 2: token-2 & token-3 finish (Accepted=3)
    (mockClient.getBatchSubmissions as jest.Mock)
      .mockResolvedValueOnce([
        { token: "token-1", status: { id: 3, description: "Accepted" }, stdout: "b2sx" },
        { token: "token-2", status: { id: 1, description: "In Queue" } },
        { token: "token-3", status: { id: 2, description: "Processing" } },
      ])
      .mockResolvedValueOnce([
        { token: "token-2", status: { id: 3, description: "Accepted" }, stdout: "b2sy" },
        { token: "token-3", status: { id: 3, description: "Accepted" }, stdout: "b2sz" },
      ])
      .mockResolvedValue([]);

    const resultMap = await service.pollBatchSubmissions(
      tokens,
      (token, result) => {
        callbackHits.push({ token, statusId: result.status.id });
      },
      0,
    );

    expect(resultMap.size).toBe(3);
    expect(callbackHits.length).toBe(3);

    // Verify Tick 1 fired for token-1
    expect(callbackHits[0]).toEqual({ token: "token-1", statusId: 3 });

    // Verify Tick 2 fired for token-2 and token-3
    expect(callbackHits[1]).toEqual({ token: "token-2", statusId: 3 });
    expect(callbackHits[2]).toEqual({ token: "token-3", statusId: 3 });
  });

  it("should fail gracefully with infrastructure failure when Judge0 API fails, without host fallback", async () => {
    (mockClient.createBatchSubmissions as jest.Mock).mockRejectedValue(
      new Error("Judge0 connection refused"),
    );

    const testCases = [
      { input: "1,2", expectedOutput: "3", label: "Case 1" },
    ];

    const result = await service.runTests(
      "console.log(3);",
      63,
      "test-q-1",
      testCases,
    );

    // Must return FAILED status due to infrastructure failure, never executing on host OS
    expect(result.status).toBe(ExecutionStatus.FAILED);
    expect(result.stderr).toContain("Judge0 sandboxed execution environment unavailable");
  });
});
