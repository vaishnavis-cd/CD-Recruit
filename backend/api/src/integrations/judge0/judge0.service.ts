import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { Judge0Client } from "./judge0.client";
import { JUDGE0_POLLING, JUDGE0_STATUS } from "./judge0.constants";
import { ExecutionStatus } from "@cd-recruit/shared-types";
import { Judge0ExecutionResponse } from "./judge0.types";

import { Judge0Language, JUDGE0_LANGUAGE_SLUG_MAP } from "./judge0-language.enum";

@Injectable()
export class Judge0Service {
  private readonly logger = new Logger(Judge0Service.name);

  constructor(private readonly client: Judge0Client) {}

  /**
   * Map a language slug to a Judge0 language ID using typed Judge0Language enum.
   * Throws BadRequestException for unknown languages so NestJS returns 400.
   */
  getLanguageId(language: string): number {
    if (!language) return Judge0Language.PYTHON;
    const clean = language.toLowerCase().trim();

    if (JUDGE0_LANGUAGE_SLUG_MAP[clean]) {
      return JUDGE0_LANGUAGE_SLUG_MAP[clean];
    }

    if (clean.includes("cpp") || clean.includes("c++")) return Judge0Language.CPP;
    if (clean.includes("python")) return Judge0Language.PYTHON;
    if (clean.includes("javascript") || clean.includes("js") || clean.includes("node")) return Judge0Language.JAVASCRIPT;
    if (clean.includes("typescript") || clean.includes("ts")) return Judge0Language.TYPESCRIPT;
    if (clean.includes("java")) return Judge0Language.JAVA;
    if (clean.includes("go")) return Judge0Language.GO;

    const supported = ["python", "javascript", "typescript", "java", "cpp", "go"];
    throw new BadRequestException(
      `Language "${language}" is not supported. Supported: ${supported.join(", ")}`,
    );
  }

  /**
   * Maps Judge0 status IDs and descriptions to CD Recruit execution status.
   */
  mapStatus(statusId: number, description?: string): ExecutionStatus {
    const desc = (description || "").toLowerCase();
    if (desc.includes("memory limit exceeded")) {
      return ExecutionStatus.MEMORY_LIMIT;
    }

    switch (statusId) {
      case JUDGE0_STATUS.IN_QUEUE:
        return ExecutionStatus.PENDING;
      case JUDGE0_STATUS.PROCESSING:
        return ExecutionStatus.RUNNING;
      case JUDGE0_STATUS.ACCEPTED:
      case JUDGE0_STATUS.WRONG_ANSWER:
        return ExecutionStatus.COMPLETED;
      case JUDGE0_STATUS.TIME_LIMIT_EXCEEDED:
        return ExecutionStatus.TIMEOUT;
      case JUDGE0_STATUS.COMPILATION_ERROR:
        return ExecutionStatus.COMPILATION_ERROR;
      case JUDGE0_STATUS.SIGSEGV:
      case JUDGE0_STATUS.SIGXFSZ:
      case JUDGE0_STATUS.SIGFPE:
      case JUDGE0_STATUS.SIGABRT:
      case JUDGE0_STATUS.NZEC:
      case JUDGE0_STATUS.OTHER_RUNTIME_ERROR:
        return ExecutionStatus.RUNTIME_ERROR;
      case JUDGE0_STATUS.INTERNAL_ERROR:
      case JUDGE0_STATUS.EXEC_FORMAT_ERROR:
      default:
        return ExecutionStatus.FAILED;
    }
  }

  /**
   * Hook for wrapping candidate code before submission (no-op for stdin/stdout approach).
   */
  wrapCode(sourceCode: string, questionId: string): string {
    return sourceCode;
  }

  /**
   * Helper to normalize output strings for comparison.
   */
  normalizeOutput(str: string): string {
    return str.replace(/\s+/g, "").trim().toLowerCase();
  }

  /**
   * Helper to decode Base64 string safely.
   */
  decodeBase64(str: string | null): string {
    if (!str) return "";
    return Buffer.from(str, "base64").toString("utf-8");
  }

  /**
   * Helper to encode Base64.
   */
  encodeBase64(str: string): string {
    return Buffer.from(str).toString("base64");
  }

  /**
   * Polls a single Judge0 submission until completion or timeout.
   */
  async pollSubmission(token: string): Promise<Judge0ExecutionResponse> {
    let attempts = 0;
    while (attempts < JUDGE0_POLLING.MAX_ATTEMPTS) {
      attempts++;
      try {
        const response = await this.client.getSubmission(token);
        const statusId = response.status.id;

        if (statusId !== JUDGE0_STATUS.IN_QUEUE && statusId !== JUDGE0_STATUS.PROCESSING) {
          return response;
        }
      } catch (err: any) {
        this.logger.error(`Error polling token ${token}: ${err.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, JUDGE0_POLLING.INTERVAL_MS));
    }

    this.logger.warn(`Polling exceeded max attempts (${JUDGE0_POLLING.MAX_ATTEMPTS}) for token: ${token}`);
    return {
      status: { id: JUDGE0_STATUS.TIME_LIMIT_EXCEEDED, description: "Time Limit Exceeded (Polling Timeout)" },
      stdout: null,
      stderr: null,
      compile_output: null,
      time: null,
      memory: null,
    };
  }

  /**
   * Polls a batch of tokens in single requests until all tokens complete or timeout.
   * Diffing per-token status on each poll tick fires onEachResult callback as individual test cases finish.
   * Detects stuck queue workers (tokens stuck IN_QUEUE for 15s) and throws JUDGE0_QUEUE_STALLED.
   */
  async pollBatchSubmissions(
    tokens: string[],
    onEachResult?: (token: string, result: Judge0ExecutionResponse) => void,
    pollIntervalMs: number = JUDGE0_POLLING.INTERVAL_MS,
  ): Promise<Map<string, Judge0ExecutionResponse>> {
    let pendingTokens = [...tokens];
    const resultsMap = new Map<string, Judge0ExecutionResponse>();
    const finishedTokens = new Set<string>();
    let attempts = 0;
    let inQueueStallCount = 0;

    while (pendingTokens.length > 0 && attempts < JUDGE0_POLLING.MAX_ATTEMPTS) {
      attempts++;
      try {
        const responses = await this.client.getBatchSubmissions(pendingTokens);
        const stillPending: string[] = [];
        let allInQueue = true;

        for (const resp of responses) {
          if (!resp || !resp.token) continue;
          const statusId = resp.status?.id;
          if (statusId !== JUDGE0_STATUS.IN_QUEUE && statusId !== JUDGE0_STATUS.PROCESSING) {
            resultsMap.set(resp.token, resp);
            allInQueue = false;
            if (!finishedTokens.has(resp.token)) {
              finishedTokens.add(resp.token);
              if (onEachResult) {
                onEachResult(resp.token, resp);
              }
            }
          } else {
            stillPending.push(resp.token);
            if (statusId !== JUDGE0_STATUS.IN_QUEUE) {
              allInQueue = false;
            }
          }
        }
        pendingTokens = stillPending;

        if (pendingTokens.length > 0 && allInQueue) {
          inQueueStallCount++;
          if (inQueueStallCount >= 15) {
            this.logger.warn(`[Judge0Service] Queue worker is idle/stalled (tokens stuck IN_QUEUE for 15s). Failing execution...`);
            throw new Error("JUDGE0_QUEUE_STALLED");
          }
        } else {
          inQueueStallCount = 0;
        }
      } catch (err: any) {
        if (err.message === "JUDGE0_QUEUE_STALLED") throw err;
        this.logger.error(`Error polling batch tokens: ${err.message}`);
      }

      if (pendingTokens.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    for (const token of pendingTokens) {
      if (!resultsMap.has(token)) {
        resultsMap.set(token, {
          status: { id: JUDGE0_STATUS.TIME_LIMIT_EXCEEDED, description: "Time Limit Exceeded (Polling Timeout)" },
          stdout: null,
          stderr: null,
          compile_output: null,
          time: null,
          memory: null,
        });
      }
    }

    return resultsMap;
  }

  /**
   * Run coding code against a set of test cases using high-performance Batch APIs.
   */
  async runTests(
    sourceCode: string,
    languageId: number,
    questionId: string,
    testCases: Array<{ input: string; expectedOutput: string; label?: string }>,
  ): Promise<{
    status: ExecutionStatus;
    passedTests: number;
    totalTests: number;
    executionTime: number;
    memoryUsage: number;
    stdout: string;
    stderr: string;
    compileOutput: string;
    results: Array<{
      passed: boolean;
      status: ExecutionStatus;
      executionTime: number;
      memoryUsage: number;
      stdout: string;
      stderr: string;
      compileOutput: string;
    }>;
  }> {
    if (!testCases || testCases.length === 0) {
      return {
        status: ExecutionStatus.COMPLETED,
        passedTests: 0,
        totalTests: 0,
        executionTime: 0,
        memoryUsage: 0,
        stdout: "",
        stderr: "",
        compileOutput: "",
        results: [],
      };
    }

    this.logger.log(`Submitting code batch for languageId: ${languageId} to primary Judge0 API sandbox...`);

    const wrappedCode = this.wrapCode(sourceCode, questionId);
    const sourceCodeBase64 = this.encodeBase64(wrappedCode);

    const batchItems = testCases.map((tc) => ({
      sourceCodeBase64,
      languageId,
      stdinBase64: this.encodeBase64(tc.input),
      expectedOutputBase64: this.encodeBase64(tc.expectedOutput),
    }));

    let submissionResponses: Array<{ token: string }> = [];
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 500;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        submissionResponses = await this.client.createBatchSubmissions(batchItems);
        if (submissionResponses && submissionResponses.length === testCases.length) {
          break;
        }
      } catch (err: any) {
        this.logger.warn(`Attempt ${attempts}/${maxAttempts} - Failed to connect to Judge0 API: ${err.message}`);
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
        }
      }
    }

    if (!submissionResponses || submissionResponses.length === 0 || submissionResponses.length !== testCases.length) {
      this.logger.error(
        `[INFRA_FAILURE_ALERT] Judge0 Sandboxed Execution Environment unavailable after ${maxAttempts} attempts. Flagging infra failure for ops intervention.`,
      );
      return {
        status: ExecutionStatus.FAILED,
        passedTests: 0,
        totalTests: testCases.length,
        executionTime: 0,
        memoryUsage: 0,
        stdout: "",
        stderr: "Judge0 sandboxed execution environment unavailable (Infra error). Please retry or notify administrator.",
        compileOutput: "",
        results: testCases.map((tc) => ({
          passed: false,
          status: ExecutionStatus.FAILED,
          executionTime: 0,
          memoryUsage: 0,
          stdout: "",
          stderr: "Judge0 sandbox execution unavailable",
          compileOutput: "",
        })),
      };
    }

    const tokens = submissionResponses.map((r) => r.token);
    const resultsMap = new Map<string, Judge0ExecutionResponse>();

    try {
      const polledMap = await this.pollBatchSubmissions(tokens);
      polledMap.forEach((val, key) => resultsMap.set(key, val));
    } catch (err: any) {
      this.logger.error(
        `[INFRA_FAILURE_ALERT] Judge0 execution queue failed or stalled: ${err.message}. Flagging infra failure for ops intervention.`,
      );
    }

    const results = testCases.map((tc, idx) => {
      const token = tokens[idx];
      const response = resultsMap.get(token);

      if (!response || !response.status) {
        return {
          passed: false,
          status: ExecutionStatus.FAILED,
          time: 0,
          memory: 0,
          stdout: "",
          stderr: "Failed to receive submission response",
          compileOutput: "",
        };
      }

      const mappedStatus = this.mapStatus(response.status.id, response.status.description);
      const decodedStdout = this.decodeBase64(response.stdout).trim();
      const decodedStderr = this.decodeBase64(response.stderr).trim();
      const decodedCompile = this.decodeBase64(response.compile_output).trim();

      const timeInSec = parseFloat(response.time || "0");
      const timeInMs = Math.round(timeInSec * 1000);
      const memoryInKb = response.memory || 0;

      let passed = false;
      if (mappedStatus === ExecutionStatus.COMPLETED) {
        const normOut = this.normalizeOutput(decodedStdout);
        const normExp = this.normalizeOutput(tc.expectedOutput);
        passed = normOut === normExp;
      }

      return {
        passed,
        status: mappedStatus,
        time: timeInMs,
        memory: memoryInKb,
        stdout: decodedStdout,
        stderr: decodedStderr,
        compileOutput: decodedCompile,
      };
    });

    // Aggregate values
    let totalTime = 0;
    let maxMemory = 0;
    let passedCount = 0;
    let overallStatus = ExecutionStatus.COMPLETED;
    let firstStderr = "";
    let firstStdout = "";
    let firstCompile = "";

    for (const r of results) {
      totalTime += r.time;
      if (r.memory > maxMemory) {
        maxMemory = r.memory;
      }
      if (r.passed) {
        passedCount++;
      }
      if (!firstStderr && r.stderr) {
        firstStderr = r.stderr;
      }
      if (!firstStdout && r.stdout) {
        firstStdout = r.stdout;
      }
      if (!firstCompile && r.compileOutput) {
        firstCompile = r.compileOutput;
      }

      // Status escalation: FAILED > MEMORY_LIMIT > TIMEOUT > RUNTIME_ERROR > COMPILATION_ERROR > COMPLETED
      const statusPrecedence = [
        ExecutionStatus.FAILED,
        ExecutionStatus.MEMORY_LIMIT,
        ExecutionStatus.TIMEOUT,
        ExecutionStatus.RUNTIME_ERROR,
        ExecutionStatus.COMPILATION_ERROR,
        ExecutionStatus.PENDING,
        ExecutionStatus.RUNNING,
        ExecutionStatus.COMPLETED,
      ];

      if (statusPrecedence.indexOf(r.status) < statusPrecedence.indexOf(overallStatus)) {
        overallStatus = r.status;
      }
    }

    return {
      status: overallStatus,
      passedTests: passedCount,
      totalTests: testCases.length,
      executionTime: totalTime,
      memoryUsage: maxMemory,
      stdout: firstStdout,
      stderr: firstStderr,
      compileOutput: firstCompile,
      results: results.map((r) => ({
        passed: r.passed,
        status: r.status,
        executionTime: r.time,
        memoryUsage: r.memory,
        stdout: r.stdout,
        stderr: r.stderr,
        compileOutput: r.compileOutput,
      })),
    };
  }

  /*
   * NOTE: runLocalFallback and evaluateLocalCode were physically removed per P0 security requirements.
   * Executing candidate-submitted code directly on the host process (bare child_process) under any
   * failure condition is strictly prohibited. Infrastructure failures must surface ops alerts & infra errors.
   */
}
