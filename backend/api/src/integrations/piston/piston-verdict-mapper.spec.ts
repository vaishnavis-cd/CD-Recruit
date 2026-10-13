import { ExecutionStatus } from "@cd-recruit/shared-types";
import { mapPistonResponseToCaseResult } from "./piston-verdict-mapper";
import { PistonRawResponse } from "./piston.contracts";

describe("PistonVerdictMapper", () => {
  const defaultExpected = "42";
  const defaultInput = "5 37";

  it("maps successful execution with matching output to COMPLETED and passed: true", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 0,
        signal: null,
        stdout: "42\n",
        stderr: "",
        output: "42\n",
        status: null,
        wall_time: 125,
        cpu_time: 80,
        memory: 23184000,
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 150);

    expect(result.status).toBe(ExecutionStatus.COMPLETED);
    expect(result.passed).toBe(true);
    expect(result.stdout).toBe("42");
    expect(result.executionTime).toBe(125);
    expect(result.memoryUsage).toBe(Math.round(23184000 / 1024));
  });

  it("maps successful execution with whitespace differences to COMPLETED and passed: true", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 0,
        signal: null,
        stdout: "  42  \n\n",
        stderr: "",
        status: null,
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, "42", defaultInput, "Case 1", false, 150);

    expect(result.status).toBe(ExecutionStatus.COMPLETED);
    expect(result.passed).toBe(true);
  });

  it("maps successful execution with wrong output to COMPLETED and passed: false", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 0,
        signal: null,
        stdout: "99\n",
        stderr: "",
        status: null,
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 150);

    expect(result.status).toBe(ExecutionStatus.COMPLETED);
    expect(result.passed).toBe(false);
    expect(result.stdout).toBe("99");
  });

  it("maps compilation failure to COMPILATION_ERROR and passed: false", () => {
    const raw: PistonRawResponse = {
      language: "c++",
      version: "10.2.0",
      compile: {
        code: 1,
        signal: null,
        stderr: "syntax error on line 5",
        output: "syntax error on line 5",
        status: "RE",
        wall_time: 250,
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 300);

    expect(result.status).toBe(ExecutionStatus.COMPILATION_ERROR);
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("syntax error");
    expect(result.compileOutput).toContain("syntax error");
  });

  it("maps timeout with status TO to TIMEOUT", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: null,
        signal: "SIGKILL",
        status: "TO",
        message: "Time limit exceeded (wall clock)",
        wall_time: 1100,
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 1150);

    expect(result.status).toBe(ExecutionStatus.TIMEOUT);
    expect(result.passed).toBe(false);
  });

  it("maps memory limit exceeded via exit code 137 and stderr Killed to MEMORY_LIMIT", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 137,
        signal: null,
        status: "RE",
        stderr: "/piston/packages/python/3.10.0/run: line 3:     3 Killed python3.10",
        memory: 67108000,
        message: "Exited with error status 137",
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 200, 67108864);

    expect(result.status).toBe(ExecutionStatus.MEMORY_LIMIT);
    expect(result.passed).toBe(false);
  });

  it("maps MemoryError in stderr to MEMORY_LIMIT", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 1,
        status: "RE",
        stderr: "Traceback: MemoryError: Unable to allocate array",
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 200);

    expect(result.status).toBe(ExecutionStatus.MEMORY_LIMIT);
    expect(result.passed).toBe(false);
  });

  it("maps std::bad_alloc in C++ to MEMORY_LIMIT", () => {
    const raw: PistonRawResponse = {
      language: "c++",
      version: "10.2.0",
      run: {
        code: 1,
        status: "RE",
        stderr: "terminate called after throwing an instance of 'std::bad_alloc'",
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 200);

    expect(result.status).toBe(ExecutionStatus.MEMORY_LIMIT);
    expect(result.passed).toBe(false);
  });

  it("maps output limit OL to candidate-facing RUNTIME_ERROR", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        status: "OL",
        signal: "SIGKILL",
        stdout: "A".repeat(65280),
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 150);

    expect(result.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("Output limit exceeded");
  });

  it("maps non-zero exit code to RUNTIME_ERROR", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        code: 42,
        status: "RE",
        stderr: "ZeroDivisionError: division by zero",
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 150);

    expect(result.status).toBe(ExecutionStatus.RUNTIME_ERROR);
    expect(result.passed).toBe(false);
  });

  it("maps internal engine error XX to system FAILED", () => {
    const raw: PistonRawResponse = {
      language: "python",
      version: "3.10.0",
      run: {
        status: "XX",
        message: "Internal sandbox supervisor crashed",
      },
    };

    const result = mapPistonResponseToCaseResult(0, raw, defaultExpected, defaultInput, "Case 1", false, 150);

    expect(result.status).toBe(ExecutionStatus.FAILED);
    expect(result.passed).toBe(false);
  });
});
