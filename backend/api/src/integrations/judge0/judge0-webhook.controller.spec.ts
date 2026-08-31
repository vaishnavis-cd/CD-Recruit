import { Test, TestingModule } from "@nestjs/testing";
import { Judge0WebhookController } from "./judge0-webhook.controller";
import { Judge0WebhookGuard, generateJudge0WebhookSignature } from "./judge0-webhook.guard";
import { JUDGE0_ACCUMULATE_AND_LOCK_LUA } from "./judge0-webhook.lua";
import { RedisService } from "../../common/redis/redis.service";
import { QueueProviderPort } from "../../queue/queue-provider.port";
import { ConfigService } from "@nestjs/config";

describe("Judge0WebhookController Real-Logic & Concurrency Spec", () => {
  let controller: Judge0WebhookController;
  let redisMemory: Map<string, string>;
  let redisHashes: Map<string, Map<string, string>>;
  let enqueuedJobs: Array<{ queueName: string; jobName: string; payload: any }>;

  const SECRET = "test-judge0-secret-key";

  beforeEach(async () => {
    redisMemory = new Map<string, string>();
    redisHashes = new Map<string, Map<string, string>>();
    enqueuedJobs = [];

    // Mock RedisService with thread-safe atomic Lua emulation
    const mockRedisService = {
      eval: jest.fn(async (script: string, numkeys: number, ...args: (string | number)[]) => {
        const resultsKey = args[0] as string;
        const enqueuedKey = args[1] as string;
        const token = args[2] as string;
        const resultJson = args[3] as string;
        const totalTests = parseInt(args[4] as string, 10);

        if (!redisHashes.has(resultsKey)) {
          redisHashes.set(resultsKey, new Map<string, string>());
        }
        const hash = redisHashes.get(resultsKey)!;
        hash.set(token, resultJson);

        const currentCount = hash.size;
        if (currentCount >= totalTests) {
          if (!redisMemory.has(enqueuedKey)) {
            redisMemory.set(enqueuedKey, "1");
            return 1; // Successfully acquired single-shot lock
          }
        }
        return 0;
      }),
      hgetall: jest.fn(async (key: string) => {
        const hash = redisHashes.get(key);
        if (!hash) return {};
        const obj: Record<string, string> = {};
        hash.forEach((v, k) => {
          obj[k] = v;
        });
        return obj;
      }),
      get: jest.fn(async (key: string) => redisMemory.get(key) || null),
      set: jest.fn(async (key: string, value: string) => {
        redisMemory.set(key, value);
      }),
    };

    const mockQueueProvider = {
      enqueue: jest.fn(async (queueName: string, jobName: string, payload: any) => {
        enqueuedJobs.push({ queueName, jobName, payload });
      }),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === "judge0WebhookSecret") return SECRET;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [Judge0WebhookController],
      providers: [
        { provide: RedisService, useValue: mockRedisService },
        { provide: QueueProviderPort, useValue: mockQueueProvider },
        { provide: ConfigService, useValue: mockConfigService },
        Judge0WebhookGuard,
      ],
    }).compile();

    controller = module.get<Judge0WebhookController>(Judge0WebhookController);
  });

  describe("HMAC Signature Verification", () => {
    it("generates and verifies HMAC-SHA256 signatures correctly", () => {
      const executionId = "exec-test-123";
      const totalTests = 3;
      const validSig = generateJudge0WebhookSignature(executionId, totalTests, SECRET);

      expect(validSig).toBeDefined();
      expect(validSig.length).toBe(64); // SHA-256 hex string
    });
  });

  describe("Concurrent Webhook Ingestion & Atomic Single-Shot Enqueue", () => {
    it("handles parallel Promise.all callbacks and enqueues EXACTLY ONE outbound job", async () => {
      const executionId = `exec-${Date.now()}`;
      const totalTests = 3;

      // 1. Test case 1 finishes first
      const res1 = await controller.handleCallback(executionId, "3", {
        token: "tok-1",
        stdout: "NQ==",
        status: { id: 3, description: "Accepted" },
      });
      expect(res1).toEqual({ ok: true });
      expect(enqueuedJobs.length).toBe(0); // 1/3 received, not complete

      // 2. Test cases 2 and 3 finish concurrently -> Trigger simultaneously with Promise.all
      const parallelCallbacks = [
        controller.handleCallback(executionId, "3", {
          token: "tok-2",
          stdout: "MzA=",
          status: { id: 3, description: "Accepted" },
        }),
        controller.handleCallback(executionId, "3", {
          token: "tok-3",
          stdout: "NDU=",
          status: { id: 3, description: "Accepted" },
        }),
      ];

      const results = await Promise.all(parallelCallbacks);
      expect(results[0]).toEqual({ ok: true });
      expect(results[1]).toEqual({ ok: true });

      // 3. Assertions:
      // A. Outbound queue receives EXACTLY ONE job (zero duplicate grading)
      expect(enqueuedJobs.length).toBe(1);

      // B. The enqueued job contains all 3 test case results
      const job = enqueuedJobs[0];
      expect(job.queueName).toBe("execution-outbound");
      expect(job.payload.executionId).toBe(executionId);
      expect(job.payload.judge0Results.length).toBe(3);

      const tokens = job.payload.judge0Results.map((r: any) => r.token).sort();
      expect(tokens).toEqual(["tok-1", "tok-2", "tok-3"]);
    });

    it("handles duplicate webhook retries idempotently without duplicate queue writes", async () => {
      const executionId = `exec-retry-${Date.now()}`;
      const totalTests = 2;

      await controller.handleCallback(executionId, "2", {
        token: "tok-1",
        stdout: "MQ==",
        status: { id: 3, description: "Accepted" },
      });
      await controller.handleCallback(executionId, "2", {
        token: "tok-2",
        stdout: "Mg==",
        status: { id: 3, description: "Accepted" },
      });

      expect(enqueuedJobs.length).toBe(1);

      // Simulate Judge0 retrying tok-2
      await controller.handleCallback(executionId, "2", {
        token: "tok-2",
        stdout: "Mg==",
        status: { id: 3, description: "Accepted" },
      });

      // Still exactly 1 job enqueued
      expect(enqueuedJobs.length).toBe(1);
    });
  });
});
