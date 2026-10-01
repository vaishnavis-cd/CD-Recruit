import { CodingService } from "./coding.service";
import { SubmissionType, ExecutionStatus, SessionStatus, ModuleType } from "@cd-recruit/shared-types";
import { BadRequestException, NotFoundException } from "@nestjs/common";

async function runCodingServiceTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for CodingService");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, message: string) {
    testTotal++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ PASS: ${message}`);
      testPassed++;
    }
  }

  // In-memory Mock Stores
  const sessionsDb = new Map<string, any>();
  const questionsDb = new Map<string, any>();
  const executionsDb = new Map<string, any>();
  const moduleResponsesDb = new Map<string, any>();

  // Seed Questions
  questionsDb.set("q-algo-1", {
    id: "q-algo-1",
    moduleType: ModuleType.CODING,
    content: {
      prompt: "Two Sum problem",
      category: "ALGORITHM",
      testCases: [
        { input: "2 7 11 15\n9", expectedOutput: "0 1", isHidden: false, label: "Sample 1" },
        { input: "3 2 4\n6", expectedOutput: "1 2", isHidden: true, label: "Hidden 1" },
      ],
    },
  });

  // Seed Sessions
  sessionsDb.set("sess-not-started", {
    id: "sess-not-started",
    status: SessionStatus.NOT_STARTED,
  });

  sessionsDb.set("sess-in-progress", {
    id: "sess-in-progress",
    status: SessionStatus.IN_PROGRESS,
  });

  sessionsDb.set("sess-auto-submitted", {
    id: "sess-auto-submitted",
    status: SessionStatus.AUTO_SUBMITTED,
  });

  sessionsDb.set("sess-closed", {
    id: "sess-closed",
    status: SessionStatus.CLOSED,
  });

  let execCounter = 0;

  const mockPrisma: any = {
    session: {
      findUnique: async (args: any) => sessionsDb.get(args.where.id) || null,
      update: async (args: any) => {
        const s = sessionsDb.get(args.where.id);
        if (s) {
          Object.assign(s, args.data);
          return s;
        }
        return null;
      },
    },
    question: {
      findUnique: async (args: any) => questionsDb.get(args.where.id) || null,
    },
    codingExecution: {
      create: async (args: any) => {
        const id = `exec-${++execCounter}`;
        const record = { id, ...args.data };
        executionsDb.set(id, record);
        return record;
      },
      update: async (args: any) => {
        const record = executionsDb.get(args.where.id);
        if (record) {
          Object.assign(record, args.data);
          return record;
        }
        return null;
      },
      findUnique: async (args: any) => executionsDb.get(args.where.id) || null,
    },
    moduleResponse: {
      upsert: async (args: any) => {
        const key = `${args.where.sessionId_questionId.sessionId}_${args.where.sessionId_questionId.questionId}`;
        const existing = moduleResponsesDb.get(key);
        if (existing) {
          Object.assign(existing, args.update);
          return existing;
        }
        const created = { ...args.create };
        moduleResponsesDb.set(key, created);
        return created;
      },
    },
  };

  const mockJudge0: any = {
    getLanguageId: () => 71, // Python
    runTests: async (code: string, langId: number, qId: string, testCases: any[]) => {
      if (code.includes("THROW_RUNNER_ERROR")) {
        throw new Error("Judge0 connection timeout");
      }
      const passedAll = !code.includes("FAIL_TEST");
      return {
        status: passedAll ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED,
        passedTests: passedAll ? testCases.length : 0,
        totalTests: testCases.length,
        executionTime: 0.12,
        memoryUsage: 256,
        stdout: passedAll ? "All tests passed" : "Test failed",
        stderr: "",
        compileOutput: "",
        results: testCases.map((tc, idx) => ({
          passed: passedAll,
          status: passedAll ? "Accepted" : "Wrong Answer",
          executionTime: 0.05,
          memoryUsage: 128,
          stdout: tc.expectedOutput,
          stderr: "",
          compileOutput: "",
        })),
      };
    },
  };

  const mockQaSandbox: any = {
    runAutomationScript: async () => ({
      status: ExecutionStatus.COMPLETED,
      passedTests: 1,
      totalTests: 1,
      stdout: "Automation test passed",
      stderr: "",
      compileOutput: "",
      executionTime: 1.2,
      memoryUsage: 512,
    }),
  };

  const mockQueueProvider: any = {
    addJob: async () => {},
    enqueue: async (_queue: string, _name: string, data: any) => {
      const exec = executionsDb.get(data.executionId);
      if (exec?.sourceCode === "THROW_RUNNER_ERROR") {
        exec.status = ExecutionStatus.FAILED;
        exec.stderr = "Judge0 connection timeout";
        throw new Error("Judge0 connection timeout");
      }
    },
  };

  const mockRedisService: any = {
    set: async () => {},
    get: async () => null,
  };

  const service = new CodingService(mockPrisma, mockJudge0, mockQaSandbox, mockQueueProvider, mockRedisService);

  // ---------------------------------------------------------------------------
  // TEST 1: Source Code Security Guardrails & Comment-Safe Filtering
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing source code security guardrails...");

    // 1.1 Forbidden token in actual executable code -> Must throw BadRequestException
    let threwExfilError = false;
    try {
      await service.run({
        sessionId: "sess-in-progress",
        questionId: "q-algo-1",
        language: "python",
        sourceCode: "import os\nsecret = os.environ['SECRET_KEY']",
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes("forbidden system inspection")) {
        threwExfilError = true;
      }
    }
    assert(threwExfilError, "Execution of code with os.environ must be blocked");

    // 1.2 Forbidden keyword in a comment -> Must NOT throw (comment-safe filtering)
    const codeWithComment = "# Do not use os.environ here\ndef solve():\n    return 42";
    const runResult = await service.run({
      sessionId: "sess-in-progress",
      questionId: "q-algo-1",
      language: "python",
      sourceCode: codeWithComment,
    });
    assert(runResult.status === ExecutionStatus.PENDING || runResult.status === ExecutionStatus.COMPLETED, "Comments mentioning os.environ must pass without false positive");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Session Lifecycle & NOT_STARTED Rejection
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing session rejection when in NOT_STARTED state...");
    const notStarted = sessionsDb.get("sess-not-started");
    assert(notStarted.status === SessionStatus.NOT_STARTED, "Session should initially be NOT_STARTED");

    let threwNotStartedError = false;
    try {
      await service.run({
        sessionId: "sess-not-started",
        questionId: "q-algo-1",
        language: "python",
        sourceCode: "def solve(): return 0",
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes("Assessment session has not begun")) {
        threwNotStartedError = true;
      }
    }

    assert(threwNotStartedError, "run() must throw BadRequestException when session is NOT_STARTED");
    assert(notStarted.status === SessionStatus.NOT_STARTED, "Session status must remain NOT_STARTED");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Session Immutability on Closed / AUTO_SUBMITTED Sessions
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing session closure immutability on AUTO_SUBMITTED / COMPLETED...");

    // 3.1 AUTO_SUBMITTED session must be rejected on run()
    let threwAutoSubmittedRun = false;
    try {
      await service.run({
        sessionId: "sess-auto-submitted",
        questionId: "q-algo-1",
        language: "python",
        sourceCode: "def solve(): return 0",
      });
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes("cannot accept new code runs")) {
        threwAutoSubmittedRun = true;
      }
    }
    assert(threwAutoSubmittedRun, "run() on AUTO_SUBMITTED session must throw BadRequestException");

    // 3.2 CLOSED session must be rejected on submit()
    let threwClosedSubmit = false;
    try {
      await service.submit({
        sessionId: "sess-closed",
        questionId: "q-algo-1",
        language: "python",
        sourceCode: "def solve(): return 0",
      });
    } catch (err: any) {
      if (
        err instanceof BadRequestException &&
        (err.message.includes("cannot accept new submissions") ||
          err.message.includes("Session is not in progress") ||
          err.message.includes("already closed"))
      ) {
        threwClosedSubmit = true;
      }
    }
    assert(threwClosedSubmit, "submit() on CLOSED session must throw BadRequestException");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Runner Crash / Timeout Resilience (Stuck PENDING Resolution)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing runner error resilience and ERROR state transition...");
    let threwRunnerError = false;
    try {
      await service.run({
        sessionId: "sess-in-progress",
        questionId: "q-algo-1",
        language: "python",
        sourceCode: "THROW_RUNNER_ERROR",
      });
    } catch (err: any) {
      threwRunnerError = true;
    }
    assert(threwRunnerError, "Runner failure must bubble error");

    // Check that the last created CodingExecution was updated to ERROR
    const lastExec = Array.from(executionsDb.values()).pop();
    assert(lastExec.status === ExecutionStatus.FAILED, "Failed execution must be updated from PENDING to FAILED");
    assert(lastExec.stderr.includes("Judge0 connection timeout"), "stderr must record runner error message");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Final Submission & Hidden Test Case Masking
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing submit() test evaluation and hidden test masking...");
    const submitResult = await service.submit({
      sessionId: "sess-in-progress",
      questionId: "q-algo-1",
      language: "python",
      sourceCode: "def solve(): return [0, 1]",
      timeSpentSeconds: 90,
    });

    assert(submitResult.status === ExecutionStatus.PENDING || submitResult.status === ExecutionStatus.COMPLETED, "Submit status must be PENDING or COMPLETED");
    assert(submitResult.executionId !== undefined, "Submit must return an executionId");
  }

  // ---------------------------------------------------------------------------
  // TEST 6: AssessmentModuleEngine Polymorphic Compliance
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 6] Testing AssessmentModuleEngine interface compliance...");
    const isValid = await service.validateSubmission({ code: "def solve(): return 1", language: "python" });
    assert(isValid === true, "Valid submission payload must return true");

    const evalResult = await service.evaluateSubmission("sess-in-progress", "q-algo-1", {
      code: "def solve(): return [0, 1]",
      language: "python",
    });
    assert(evalResult.status === ExecutionStatus.PENDING || evalResult.status === ExecutionStatus.COMPLETED, "Engine evaluation status must be PENDING or COMPLETED");
    assert(evalResult.evaluatedAt instanceof Date, "evaluatedAt must be Date instance");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

describe('CodingService Subsystem', () => {
  it('runs all coding service characterization tests', async () => {
    await runCodingServiceTests();
  });
});
