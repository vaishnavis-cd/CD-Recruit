import { Test, TestingModule } from "@nestjs/testing";
import { Judge0Service } from "./judge0.service";
import { Judge0Client } from "./judge0.client";
import { ExecutionStatus } from "@cd-recruit/shared-types";

describe("Judge0Service", () => {
  let service: Judge0Service;
  let mockClient: jest.Mocked<Partial<Judge0Client>>;

  beforeEach(async () => {
    mockClient = {
      createBatchSubmissions: jest.fn(),
      getBatchSubmissions: jest.fn(),
      getSubmission: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Judge0Service,
        {
          provide: Judge0Client,
          useValue: mockClient,
        },
      ],
    }).compile();

    service = module.get<Judge0Service>(Judge0Service);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
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
