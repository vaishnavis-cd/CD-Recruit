import { ExecutionStatus, ModuleType } from "./enums.js";

// ---------------------------------------------------------------------------
// Per-module response payload shapes
//
// These are stored in ModuleResponse.responsePayload (JSONB).
// Each shape is tagged with moduleType so the union can be narrowed at runtime.
// ---------------------------------------------------------------------------

export interface McqResponsePayload {
  moduleType: ModuleType.MCQ;
  /** 0-based index of the selected option — matches McqQuestionContent.options[]. */
  selectedIndex: number;
}

export interface SqlResponsePayload {
  moduleType: ModuleType.SQL;
  /** The SQL query string written by the candidate. */
  query: string;
}

export interface CodingResponsePayload {
  moduleType: ModuleType.CODING;
  /** Submitted source code. */
  code: string;
  /** Language slug matching a key in the question's starterCode map. */
  language: string;
}

export interface AiPromptingResponsePayload {
  moduleType: ModuleType.AI_PROMPTING;
  /** The prompt the candidate crafted to send to an AI model. */
  prompt: string;
}

export interface ActionLogEntry {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string; // ISO-8601
}

export interface SimulationResponsePayload {
  moduleType: ModuleType.SIMULATION;
  /** Ordered log of all actions the candidate took within the simulation. */
  actionLog: ActionLogEntry[];
}

/** Discriminated union of all module response payloads. */
export type ResponsePayload =
  | McqResponsePayload
  | SqlResponsePayload
  | CodingResponsePayload
  | AiPromptingResponsePayload
  | SimulationResponsePayload;

// ---------------------------------------------------------------------------
// Autosave (draft)
//
// Sent every 10-15 s (debounced) + immediately on blur.
// Mapped to ModuleResponse.isDraft = true / lastAutosavedAt = now().
// ---------------------------------------------------------------------------

export interface SaveDraftRequest {
  sessionId: string;
  questionId: string;
  responsePayload: ResponsePayload;
  timeSpentSeconds: number;
}

export interface SaveDraftResponse {
  moduleResponseId: string;
  isDraft: true;
  lastAutosavedAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Final submit (per question)
//
// Sets ModuleResponse.isDraft = false.
// For CODING: triggers Judge0 execution (synchronous with timeout-then-poll fallback).
// For all others: no execution, result is null.
// ---------------------------------------------------------------------------

export interface SubmitResponseRequest {
  sessionId: string;
  questionId: string;
  responsePayload: ResponsePayload;
  timeSpentSeconds: number;
}

/**
 * Judge0 execution result — only populated for CODING submissions.
 *
 * Strategy: synchronous-with-timeout-then-poll-fallback.
 * 1. Backend submits to Judge0 and waits up to ~8 s for a synchronous result.
 * 2. If Judge0 responds in time → executionResult is fully populated here.
 * 3. If Judge0 times out → executionStatus = PENDING; poll
 *    GET /sessions/:id/responses/:moduleResponseId/execution for the final result.
 */
export interface ExecutionResult {
  executionStatus: ExecutionStatus;
  stdout: string;
  stderr: string;
  /** True if all visible test cases passed. Hidden test results are not exposed. */
  allVisiblePassed: boolean;
}

export interface SubmitResponseResponse {
  moduleResponseId: string;
  isDraft: false;
  /**
   * Only populated for CODING module — null for all other module types.
   * May be { executionStatus: PENDING } if Judge0 timed out; client should poll.
   */
  executionResult: ExecutionResult | null;
}

// ---------------------------------------------------------------------------
// Judge0 async polling (CODING only, PENDING fallback)
// ---------------------------------------------------------------------------

export interface GetExecutionStatusResponse {
  moduleResponseId: string;
  executionResult: ExecutionResult;
}
