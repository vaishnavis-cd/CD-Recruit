import { Injectable, Logger } from "@nestjs/common";
import { Judge0Client } from "./judge0.client";
import { JUDGE0_POLLING, JUDGE0_STATUS } from "./judge0.constants";
import { ExecutionStatus } from "@cd-recruit/shared-types";
import { Judge0ExecutionResponse } from "./judge0.types";

@Injectable()
export class Judge0Service {
  private readonly logger = new Logger(Judge0Service.name);

  constructor(private readonly client: Judge0Client) {}

  /**
   * Helper to map language string to Judge0 language ID.
   */
  getLanguageId(language: string): number {
    const lang = language.toLowerCase();
    switch (lang) {
      case "python":
      case "python3":
        return 71; // Python (3.8.1)
      case "javascript":
      case "js":
        return 63; // JavaScript (Node.js 12.14.0)
      case "typescript":
      case "ts":
        return 74; // TypeScript (3.7.4)
      case "java":
        return 62; // Java (JDK 13.0.1)
      case "cpp":
      case "c++":
        return 54; // C++ (GCC 9.2.0)
      case "go":
      case "golang":
        return 60; // Go (1.13.5)
      default:
        throw new Error(`Unsupported language: ${language}`);
    }
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
   * Helper to wrap candidate code to execute test cases via standard I/O.
   */
  wrapCode(sourceCode: string, language: string, questionId: string): string {
    const lang = language.toLowerCase();
    if (lang === "python" || lang === "python3") {
      // Find candidate function name to call.
      // E.g., def two_sum(...) or def is_valid(...)
      // We can use a regex to look for "def [a-zA-Z0-9_]+"
      const match = sourceCode.match(/def\s+([a-zA-Z0-9_]+)/);
      const funcName = match ? match[1] : "solve";

      return `${sourceCode}

# --- Platform Test Runner Wrapper ---
import sys
import json

try:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        # Evaluate arguments safely
        args = eval(f"({line})")
        # Call function
        if isinstance(args, tuple):
            result = ${funcName}(*args)
        else:
            result = ${funcName}(args)
        print(json.dumps(result))
except Exception as e:
    print(f"Wrapper Error: {e}", file=sys.stderr)
    sys.exit(1)
`;
    }

    if (lang === "javascript" || lang === "js" || lang === "typescript" || lang === "ts") {
      // Find candidate function name.
      // E.g., function twoSum(...) or const twoSum = (...)
      const match = sourceCode.match(/(?:function|const|let|var)\s+([a-zA-Z0-9_]+)/);
      const funcName = match ? match[1] : "solve";

      return `${sourceCode}

// --- Platform Test Runner Wrapper ---
const fs = require('fs');
try {
  const input = fs.readFileSync(0, 'utf-8').trim();
  if (input) {
    const lines = input.split('\\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const args = eval(\`[\${line}]\`);
      const result = ${funcName}(...args);
      console.log(JSON.stringify(result));
    }
  }
} catch (e) {
  console.error('Wrapper Error:', e.message);
  process.exit(1);
}
`;
    }

    // Default to returning unmodified code for compiled/other languages
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
      status: { id: JUDGE0_STATUS.INTERNAL_ERROR, description: "Internal Error (Polling Timeout)" },
      stdout: null,
      stderr: null,
      compile_output: null,
      time: null,
      memory: null,
    };
  }

  /**
   * Run coding code against a set of test cases.
   */
  async runTests(
    sourceCode: string,
    language: string,
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
      };
    }

    const languageId = this.getLanguageId(language);
    const wrappedCode = this.wrapCode(sourceCode, language, questionId);
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
    };
  }
}
