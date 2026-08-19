import { Test, TestingModule } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { NosqlController } from "./nosql.controller";
import { NosqlValidatorService } from "./nosql-validator.service";
import { NosqlSandboxService } from "./nosql-sandbox.service";
import { NosqlExecutionService } from "./nosql-execution.service";
import { ResultComparatorService } from "../../sql/result-comparator.service";
import { PrismaService } from "../../prisma/prisma.service";
import { MinioService } from "../../integrations/minio/minio.service";
import { QueueProviderPort } from "../../queue/queue-provider.port";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import { Readable } from "stream";
import { ModuleType, SessionStatus } from "@prisma/client";

describe("NoSQL Integration Test", () => {
  let controller: NosqlController;
  let sandboxService: NosqlSandboxService;
  let executionService: NosqlExecutionService;
  let prisma: PrismaService;
  let queueProvider: QueueProviderPort;

  // Mock data
  const mockSessionId = "68c72b2f-9b1d-8e25-d8f6-d65400000001";
  const mockQuestionId = "68c72b2f-9b1d-8e25-d8f6-d65400000002";
  let createdSandboxDbName = "";

  const mockQuestion = {
    id: mockQuestionId,
    moduleType: ModuleType.NOSQL,
    content: {
      title: "High Earners",
      prompt: "Find all employees with salary > 50000",
      datasetRef: "datasets/employees.json",
      collections: ["employees"],
      allowedOperations: ["find", "insertOne"],
      validatorType: "OUTPUT_COMPARISON",
      expectedOperation: {
        collection: "employees",
        operator: "find",
        payload: { filter: { salary: { $gt: 50000 } } },
      },
    },
    scoringConfig: {},
  };

  const mockSession = {
    id: mockSessionId,
    status: SessionStatus.IN_PROGRESS,
    roleTemplateId: "dev-template",
  };

  const mockSeedData = {
    employees: [
      { _id: { $oid: "60c72b2f9b1d8e25d8f6d654" }, name: "Alice", salary: 95000 },
      { _id: { $oid: "60c72b2f9b1d8e25d8f6d655" }, name: "Bob", salary: 45000 },
    ],
  };

  beforeAll(async () => {
    // Mock ConfigService
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === "mongodbUrl" || key === "app.mongodbUrl") {
          return process.env.MONGODB_URL || "mongodb://admin:adminpassword@localhost:27017/admin";
        }
        if (key === "minio.bucketGeneral" || key === "app.minio.bucketGeneral") {
          return "cd-recruit-general";
        }
        return null;
      }),
    };

    // Mock MinioService
    const mockMinioService = {
      getObjectStream: jest.fn(async () => {
        const readable = new Readable();
        readable.push(JSON.stringify(mockSeedData));
        readable.push(null);
        return readable;
      }),
    };

    // Mock PrismaService
    const mockPrismaService = {
      session: {
        findUnique: jest.fn(async () => mockSession),
      },
      question: {
        findUnique: jest.fn(async () => mockQuestion),
      },
      moduleResponse: {
        findUnique: jest.fn(async () => ({
          sessionId: mockSessionId,
          questionId: mockQuestionId,
          sandboxDbName: createdSandboxDbName,
        })),
        upsert: jest.fn(async (args) => {
          createdSandboxDbName = args.create.sandboxDbName;
          return { sandboxDbName: createdSandboxDbName };
        }),
        update: jest.fn(async () => ({})),
      },
    };

    // Mock QueueProviderPort
    const mockQueueProvider = {
      enqueueDelayed: jest.fn(async () => ({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
      ],
      controllers: [NosqlController],
      providers: [
        NosqlValidatorService,
        NosqlSandboxService,
        NosqlExecutionService,
        ResultComparatorService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MinioService, useValue: mockMinioService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: QueueProviderPort, useValue: mockQueueProvider },
      ],
    }).compile();

    controller = module.get<NosqlController>(NosqlController);
    sandboxService = module.get<NosqlSandboxService>(NosqlSandboxService);
    executionService = module.get<NosqlExecutionService>(NosqlExecutionService);
    prisma = module.get<PrismaService>(PrismaService);
    queueProvider = module.get<QueueProviderPort>(QueueProviderPort);
  });

  afterAll(async () => {
    // Drop sandbox after tests finish
    if (createdSandboxDbName) {
      await sandboxService.dropSandbox(createdSandboxDbName);
    }
  });

  it("should successfully start sandbox and load seed data", async () => {
    const startRes = await controller.start({
      sessionId: mockSessionId,
      questionId: mockQuestionId,
    });

    expect(startRes.sandboxDbName).toBeDefined();
    expect(startRes.seededState.employees).toBeDefined();
    expect(startRes.seededState.employees.length).toBe(2);
    expect(startRes.seededState.employees[0].name).toBe("Alice");
    expect(startRes.question.content.expectedOperation).toBeUndefined(); // Verify stripped expectedOperation
  });

  it("should successfully run whitelisted query", async () => {
    const runRes = await controller.run({
      sessionId: mockSessionId,
      questionId: mockQuestionId,
      operation: {
        collection: "employees",
        operator: "find",
        payload: { filter: { salary: { $gt: 50000 } } },
      },
    });

    expect(runRes.result).toBeDefined();
    expect(runRes.result.length).toBe(1);
    expect(runRes.result[0].name).toBe("Alice");
    expect(runRes.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(runRes.passed).toBe(true);
  });

  it("should reject queries with non-whitelisted operator (e.g. updateOne)", async () => {
    await expect(
      controller.run({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        operation: {
          collection: "employees",
          operator: "updateOne",
          payload: { filter: { name: "Bob" }, update: { $set: { salary: 60000 } } },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should reject queries containing blocklisted keys (e.g. drop)", async () => {
    await expect(
      controller.run({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        operation: {
          collection: "employees",
          operator: "find",
          payload: {
            filter: {
              $expr: { drop: 1 },
            },
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("should evaluate submit correctly, update attempt row, and enqueue cleanup job", async () => {
    const submitRes = await controller.submit({
      sessionId: mockSessionId,
      questionId: mockQuestionId,
      operation: {
        collection: "employees",
        operator: "find",
        payload: { filter: { salary: { $gt: 50000 } } },
      },
    });

    expect(submitRes.passed).toBe(true);

    // Verify DB update and queue enqueuing
    expect(prisma.moduleResponse.update).toHaveBeenCalled();
    expect(queueProvider.enqueueDelayed).toHaveBeenCalledWith(
      "heartbeat-monitor",
      "drop-sandbox",
      expect.objectContaining({ sandboxDbName: createdSandboxDbName }),
      expect.any(Object),
    );
  });
});
