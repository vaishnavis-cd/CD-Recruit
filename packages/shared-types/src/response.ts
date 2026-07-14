import { ExecutionStatus } from './enums';

export interface ActionLogEntry {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string; // ISO8601
}

export interface CodingResponsePayload {
  code: string;
  language: string;
}

export interface SimulationResponsePayload {
  actionLog: ActionLogEntry[];
}

export interface SubmitResponseRequest {
  questionId: string;
  responsePayload: CodingResponsePayload | SimulationResponsePayload;
  timeSpentSeconds: number;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
}

export interface SubmitResponseResponse {
  moduleResponseId: string;
  /** Only populated for CODING — null for SIMULATION */
  executionResult: ExecutionResult | null;
  /** null when the session is complete */
  nextQuestionId: string | null;
}
