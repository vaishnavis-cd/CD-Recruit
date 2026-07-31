import { spawnSync } from "child_process";
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
   * Polls a batch of tokens in a single request until completion or timeout.
   * Detects stuck queue workers (IN_QUEUE > 3s) and throws so fallback runner takes over.
   */
  async pollBatchSubmissions(tokens: string[]): Promise<Map<string, Judge0ExecutionResponse>> {
    let pendingTokens = [...tokens];
    const resultsMap = new Map<string, Judge0ExecutionResponse>();
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
          if (inQueueStallCount >= 3) {
            this.logger.warn(`[Judge0Service] Queue worker is idle/stalled (tokens stuck IN_QUEUE for 3s). Failing over to local sandbox...`);
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
        await new Promise((resolve) => setTimeout(resolve, JUDGE0_POLLING.INTERVAL_MS));
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

    let tokens: string[] = [];
    try {
      tokens = await this.client.createBatchSubmissions(batchItems);
    } catch (err: any) {
      this.logger.warn(`Failed to connect to Judge0 API via batch submission: ${err.message}. Falling back...`);
      return this.runLocalFallback(sourceCode, languageId, questionId, testCases);
    }

    if (!tokens || tokens.length === 0 || tokens.length !== testCases.length) {
      this.logger.warn(`Batch tokens count mismatch or empty response. Falling back...`);
      return this.runLocalFallback(sourceCode, languageId, questionId, testCases);
    }

    const resultsMap = await this.pollBatchSubmissions(tokens);

    const results = testCases.map((tc, idx) => {
      const token = tokens[idx];
      const response = resultsMap.get(token);

      if (!response) {
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

  /**
   * Safe universal local code evaluator using Node child_process spawnSync
   */
  private evaluateLocalCode(code: string, languageId: number, rawInput: string): { actual: string; error?: string } {
    try {
      const cleanInput = rawInput.trim();

      // Python 3 (Language ID 71)
      if (languageId === 71) {
        const pyCmd = process.platform === "win32" ? "python" : "python3";
        let runnerCode = code;
        if (!code.includes("sys.stdin") && (code.includes("def ") || code.includes("class "))) {
          runnerCode = `import sys, json
${code}
__inp = sys.stdin.read().trim()
def __parse(i):
    if not i: return ""
    try: return json.loads(i)
    except: pass
    if "," in i:
        parts = [p.strip() for p in i.split(",")]
        try: return [int(p) for p in parts]
        except: return parts
    try: return int(i)
    except: return i

__arg = __parse(__inp)
__fns = ['maxArea', 'is_strictly_increasing', 'isStrictlyIncreasing', 'two_sum', 'twoSum', 'validate_username', 'validateUsername', 'solution', 'solve']
for f_name in __fns:
    if f_name in globals() and callable(globals()[f_name]):
        f = globals()[f_name]
        try:
            res = f(*__arg) if isinstance(__arg, list) and f.__code__.co_argcount > 1 else f(__arg)
            print(json.dumps(res) if isinstance(res, (dict, list)) else str(res))
            break
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            break
`;
        }

        const res = spawnSync(pyCmd, ["-c", runnerCode], {
          input: cleanInput,
          encoding: "utf-8",
          timeout: 4000,
        });

        if (res.error) return { actual: "", error: res.error.message };
        if (res.status !== 0 && res.stderr) return { actual: (res.stdout || "").trim(), error: res.stderr.trim() };
        return { actual: (res.stdout || "").trim() };
      }

      // JavaScript (63) / TypeScript (93) / Default JS Fallback
      let runnerCode = code;
      if (!code.includes("fs.readFileSync") && !code.includes("process.stdin")) {
        runnerCode = `
          const fs = require('fs');
          const rawInput = fs.readFileSync(0, 'utf-8').trim();
          ${code}

          function __parseArg(inp) {
            if (!inp) return "";
            try { return JSON.parse(inp); } catch(e) {}
            if (inp.includes(',')) {
              const parts = inp.split(',').map(s => s.trim());
              if (parts.every(p => !isNaN(Number(p)))) return parts.map(Number);
              return parts;
            }
            if (!isNaN(Number(inp))) return Number(inp);
            return inp;
          }

          const parsedArg = __parseArg(rawInput);
          let targetFn = null;

          const candidates = ['maxArea', 'isStrictlyIncreasing', 'twoSum', 'solution', 'solve', 'validateUsername', 'validate_username', 'lengthOfLongestSubstring'];
          for (const name of candidates) {
            try {
              if (typeof eval(name) === 'function') {
                targetFn = eval(name);
                break;
              }
            } catch(e) {}
          }

          if (targetFn) {
            const res = Array.isArray(parsedArg) && targetFn.length > 1 && !Array.isArray(parsedArg[0])
              ? targetFn(...parsedArg)
              : targetFn(parsedArg);
            console.log(typeof res === 'object' ? JSON.stringify(res) : String(res));
          }
        `;
      }

      const res = spawnSync("node", ["-e", runnerCode], {
        input: cleanInput,
        encoding: "utf-8",
        timeout: 4000,
      });

      if (res.error) return { actual: "", error: res.error.message };
      if (res.status !== 0 && res.stderr) return { actual: (res.stdout || "").trim(), error: res.stderr.trim() };
      return { actual: (res.stdout || "").trim() };
    } catch (err: any) {
      return { actual: "", error: err.message || "Execution error" };
    }
  }

  /**
   * Local execution fallback for dev mode when Judge0 server container is not running locally.
   */
  private async runLocalFallback(
    sourceCode: string,
    languageId: number,
    questionId: string,
    testCases: Array<{ input: string; expectedOutput: string; label?: string }>,
  ) {
    this.logger.warn(`[Judge0Service] Running local execution fallback for dev mode.`);

    const results = testCases.map((tc) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let passed = false;

      try {
        const code = sourceCode || "";
        const rawInput = tc.input || "";
        const expectedNorm = (tc.expectedOutput || "").trim().toLowerCase();

        const evalRes = this.evaluateLocalCode(code, languageId, rawInput);
        stdout = evalRes.actual;
        if (evalRes.error) {
          stderr = evalRes.error;
          passed = false;
        } else {
          passed = this.normalizeOutput(stdout) === this.normalizeOutput(expectedNorm);
        }
      } catch (err: any) {
        stderr = err.message || "Runtime error during execution";
      }

      return {
        passed,
        status: passed ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
        time: Date.now() - startTime + 8,
        memory: 1024,
        stdout,
        stderr,
        compileOutput: "",
      };
    });

    const passedCount = results.filter((r) => r.passed).length;
    const overallStatus = passedCount === testCases.length ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED;

    return {
      status: overallStatus,
      passedTests: passedCount,
      totalTests: testCases.length,
      executionTime: results.reduce((a, b) => a + b.time, 0),
      memoryUsage: 1024,
      stdout: results[0]?.stdout || "",
      stderr: results[0]?.stderr || "",
      compileOutput: "",
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
