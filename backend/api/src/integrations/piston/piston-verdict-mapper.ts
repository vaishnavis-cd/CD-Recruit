import { ExecutionStatus } from "@cd-recruit/shared-types";
import { CaseResult, PistonRawResponse } from "./piston.contracts";
import { normalizeOutput } from "../../common/utils/comparator.util";

/**
 * Pure deterministic verdict mapper turning raw Piston API response into a normalized CaseResult.
 * Implements two-tier status mapping calibrated against empirical Phase 0 spike data.
 */
export function mapPistonResponseToCaseResult(
  caseIndex: number,
  response: PistonRawResponse,
  expectedOutput: string,
  input: string,
  label: string,
  isHidden: boolean,
  fallbackElapsedMs: number,
  configuredMemoryLimitBytes: number = 268435456, // Default 256MB
): CaseResult {
  // 1. Handle Compilation Failures
  if (response.compile && (response.compile.code !== 0 || response.compile.status === "RE")) {
    const compile = response.compile;
    const compileErr = compile.stderr || compile.output || "Compilation failed";
    return {
      caseIndex,
      passed: false,
      status: ExecutionStatus.COMPILATION_ERROR,
      executionTime: compile.wall_time ?? compile.cpu_time ?? fallbackElapsedMs,
      memoryUsage: Math.round((compile.memory || 0) / 1024),
      stdout: "",
      stderr: compileErr,
      compileOutput: compile.output || compileErr,
      input,
      expectedOutput,
      label,
      isHidden,
    };
  }

  const run = response.run || {};
  const stdout = (run.stdout || "").trim();
  let stderr = (run.stderr || "").trim();
  const compileOutput = (response.compile?.output || "").trim();

  // Execution time: prioritize Piston isolate wall_time / cpu_time in integer ms
  const executionTime = Math.round(run.wall_time ?? run.cpu_time ?? fallbackElapsedMs);
  // Memory usage: bytes converted to integer KB
  const memoryUsage = Math.round((run.memory || 0) / 1024);

  let status: ExecutionStatus = ExecutionStatus.COMPLETED;

  // 2. Output Limit Exceeded (OL) -> Candidate-facing RUNTIME_ERROR matching SIGXFSZ
  if (run.status === "OL") {
    status = ExecutionStatus.RUNTIME_ERROR;
    stderr = stderr || "Output limit exceeded (stdout exceeded maximum buffer size)";
  }
  // 3. Timeout (TO)
  else if (run.status === "TO" || run.signal === "SIGXCPU") {
    status = ExecutionStatus.TIMEOUT;
  }
  // 4. Memory Limit Exceeded
  else if (
    (run.memory && run.memory >= configuredMemoryLimitBytes * 0.95) ||
    (run.code === 137 && (stderr.includes("Killed") || run.message?.includes("137"))) ||
    stderr.includes("MemoryError") ||
    stderr.includes("std::bad_alloc") ||
    stderr.includes("OutOfMemoryError") ||
    stderr.includes("out of memory")
  ) {
    status = ExecutionStatus.MEMORY_LIMIT;
  }
  // 5. Internal Engine / Sandbox Error (XX) -> System FAILED
  else if (run.status === "XX") {
    status = ExecutionStatus.FAILED;
  }
  // 6. Signal-killed process (SG)
  else if (run.status === "SG" || (run.signal && run.signal !== null)) {
    if (run.signal === "SIGKILL") {
      // Check if timeout or OOM based on message or duration
      if (run.message?.toLowerCase().includes("time limit") || executionTime >= 1000) {
        status = ExecutionStatus.TIMEOUT;
      } else {
        status = ExecutionStatus.RUNTIME_ERROR;
      }
    } else {
      status = ExecutionStatus.RUNTIME_ERROR;
    }
  }
  // 7. Non-zero exit code or Runtime Error status (RE)
  else if (run.status === "RE" || (run.code !== null && run.code !== undefined && run.code !== 0)) {
    status = ExecutionStatus.RUNTIME_ERROR;
  }
  // 8. Normal execution completion
  else {
    status = ExecutionStatus.COMPLETED;
  }

  // Output comparison (only when completed successfully without runtime fault)
  let passed = false;
  if (status === ExecutionStatus.COMPLETED) {
    const normOut = normalizeOutput(stdout);
    const normExp = normalizeOutput(expectedOutput);
    passed = normOut === normExp;
  }

  return {
    caseIndex,
    passed,
    status,
    executionTime,
    memoryUsage,
    stdout,
    stderr,
    compileOutput,
    input,
    expectedOutput,
    label,
    isHidden,
  };
}
