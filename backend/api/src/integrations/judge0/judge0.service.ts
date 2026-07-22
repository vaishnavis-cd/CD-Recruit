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
    const id = JUDGE0_LANGUAGE_SLUG_MAP[language.toLowerCase()];
    if (!id) {
      const supported = ["python", "javascript", "typescript", "java", "cpp", "go"];
      throw new BadRequestException(
        `Language "${language}" is not supported. Supported: ${supported.join(", ")}`,
      );
    }
    return id;
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

        // Status IDs 1 (In Queue) and 2 (Processing) mean execution is still pending.
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
   * Run coding code against a set of test cases.
   * @param languageId Already-resolved Judge0 language ID (call getLanguageId first).
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
    executionTime: number; // in ms
    memoryUsage: number; // in KB
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

    const wrappedCode = this.wrapCode(sourceCode, questionId);
    const sourceCodeBase64 = this.encodeBase64(wrappedCode);

    // Submit all test cases to Judge0 in parallel
    const submissionPromises = testCases.map(async (tc) => {
      const stdinBase64 = this.encodeBase64(tc.input);
      try {
        const token = await this.client.createSubmission(sourceCodeBase64, languageId, stdinBase64);
        return { token, testCase: tc };
      } catch (err: any) {
        this.logger.error(`Failed to submit test case: ${err.message}`);
        return { token: null, testCase: tc };
      }
    });

    const submissions = await Promise.all(submissionPromises);

    // Poll submissions in parallel
    const pollPromises = submissions.map(async (sub) => {
      if (!sub.token) {
        return {
          passed: false,
          status: ExecutionStatus.FAILED,
          time: 0,
          memory: 0,
          stdout: "",
          stderr: "Failed to submit to Judge0",
          compileOutput: "",
        };
      }

      const response = await this.pollSubmission(sub.token);
      this.logger.warn(`RAW JUDGE0 RESPONSE: ${JSON.stringify(response)}`);
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
        const normExp = this.normalizeOutput(sub.testCase.expectedOutput);
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

    const results = await Promise.all(pollPromises);

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
}
