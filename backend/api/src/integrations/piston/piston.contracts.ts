import { ExecutionStatus } from "@cd-recruit/shared-types";

export interface PistonStageResult {
  stdout?: string;
  stderr?: string;
  output?: string;
  code?: number | null;
  signal?: string | null;
  status?: "TO" | "RE" | "SG" | "OL" | "EL" | "XX" | string | null;
  message?: string | null;
  cpu_time?: number | null;
  wall_time?: number | null;
  memory?: number | null;
}

export interface PistonRawResponse {
  language: string;
  version: string;
  run?: PistonStageResult;
  compile?: PistonStageResult;
  message?: string;
}

export interface CaseResult {
  caseIndex: number;
  passed: boolean;
  status: ExecutionStatus;
  executionTime: number; // in milliseconds
  memoryUsage: number;   // in KB
  stdout: string;
  stderr: string;
  compileOutput: string;
  input: string;
  expectedOutput: string;
  label: string;
  isHidden: boolean;
}

export interface PistonExecuteOptions {
  stdin?: string;
  args?: string[];
  run_timeout?: number;
  compile_timeout?: number;
  run_memory_limit?: number;
  compile_memory_limit?: number;
}
