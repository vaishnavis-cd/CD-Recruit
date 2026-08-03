import apiClient from "./client";
import { type AxiosError } from "axios";

export interface TestResultDetail {
  passed: boolean;
  status: string;
  executionTime?: number;
  memoryUsage?: number;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  input?: string;
  expectedOutput?: string;
  label?: string;
  isHidden?: boolean;
}

export interface CodingExecutionResponse {
  executionId: string;
  status: string;
  passedTests: number;
  totalTests: number;
  executionTime: number | null;
  memoryUsage: number | null;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
  results?: TestResultDetail[];
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

function normaliseError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<Record<string, unknown>>;
  const status = axiosErr.response?.status ?? 0;
  const data = axiosErr.response?.data ?? {};

  if (typeof data["code"] === "string") {
    return {
      status,
      code: data["code"] as string,
      message: (data["message"] as string) ?? "",
    };
  }

  if (typeof data["message"] === "string") {
    return {
      status,
      code: data["message"] as string,
      message: data["message"] as string,
    };
  }

  if (!axiosErr.response) {
    return { status: 0, code: "NETWORK_ERROR", message: axiosErr.message };
  }

  return { status, code: "UNKNOWN", message: "An unexpected error occurred." };
}

export async function runCoding(params: {
  sessionId: string;
  questionId: string;
  language: string;
  sourceCode: string;
}): Promise<CodingExecutionResponse> {
  try {
    const { data } = await apiClient.post<CodingExecutionResponse>("/coding/run", params);
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

export async function submitCoding(params: {
  sessionId: string;
  questionId: string;
  language: string;
  sourceCode: string;
  timeSpentSeconds?: number;
}): Promise<CodingExecutionResponse> {
  try {
    const { data } = await apiClient.post<CodingExecutionResponse>("/coding/submit", params);
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

export async function saveCodingDraft(params: {
  sessionId: string;
  questionId: string;
  language: string;
  sourceCode: string;
  timeSpentSeconds?: number;
}): Promise<{ ok: boolean }> {
  try {
    const { data } = await apiClient.post<{ ok: boolean }>("/coding/draft", params);
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

export async function getCodingExecution(id: string): Promise<CodingExecutionResponse> {
  try {
    const { data } = await apiClient.get<CodingExecutionResponse>(`/coding/execution/${id}`);
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}
