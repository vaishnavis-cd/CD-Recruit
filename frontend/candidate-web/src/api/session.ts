import type { AxiosError } from "axios";
import type {
  StartSessionResponse,
  HeartbeatResponse,
  ResumeSessionResponse,
} from "@cd-recruit/shared-types";
import apiClient from "./client";

// ─────────────────────────────────────────────────────────────────────────────
// Error shape
//
// The backend returns errors in two shapes depending on how NestJS serialises
// the exception:
//
//   GoneException / ConflictException / NotFoundException (custom body):
//     { code: string, message: string }
//
//   UnauthorizedException with a string message:
//     { message: string, statusCode: number, error: string }
//     where message === the code string (e.g. 'INVITE_TOKEN_INVALID')
//
// ApiError normalises both into { status, code, message }.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

function normaliseError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<Record<string, unknown>>;
  const status = axiosErr.response?.status ?? 0;
  const data = axiosErr.response?.data ?? {};

  // Custom exception body: { code, message }
  if (typeof data["code"] === "string") {
    return {
      status,
      code: data["code"] as string,
      message: (data["message"] as string) ?? "",
    };
  }

  // NestJS built-in UnauthorizedException: { message: 'CODE_STRING', statusCode, error }
  // The message field contains the code string directly
  if (typeof data["message"] === "string") {
    return {
      status,
      code: data["message"] as string,
      message: data["message"] as string,
    };
  }

  // Network / timeout error (no response)
  if (!axiosErr.response) {
    return { status: 0, code: "NETWORK_ERROR", message: axiosErr.message };
  }

  return { status, code: "UNKNOWN", message: "An unexpected error occurred." };
}

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /sessions/start
 * Validates the invite token and creates a new session.
 * Throws ApiError on failure — never swallows errors.
 */
export async function startSession(
  inviteToken: string,
): Promise<StartSessionResponse> {
  try {
    const { data } = await apiClient.post<StartSessionResponse>(
      "/sessions/start",
      {
        inviteToken,
      },
    );
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * POST /sessions/:sessionId/heartbeat
 * Tab-alive signal. Throws ApiError — caller handles 409 SECOND_TAB_DETECTED.
 */
export async function sendHeartbeat(
  sessionId: string,
  tabId: string,
): Promise<HeartbeatResponse> {
  try {
    const { data } = await apiClient.post<HeartbeatResponse>(
      `/sessions/${sessionId}/heartbeat`,
      { sessionId, tabId },
    );
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * POST /sessions/:sessionId/resume
 * Reconnects a DISCONNECTED session. Throws ApiError on 410 / 409.
 */
export async function resumeSession(
  sessionId: string,
  tabId: string,
): Promise<ResumeSessionResponse> {
  try {
    const { data } = await apiClient.post<ResumeSessionResponse>(
      `/sessions/${sessionId}/resume`,
      { sessionId, tabId },
    );
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * POST /sessions/:sessionId/begin
 * Begins a NOT_STARTED session, transitioning it to IN_PROGRESS.
 */
export async function beginSession(
  sessionId: string,
): Promise<StartSessionResponse> {
  try {
    const { data } = await apiClient.post<StartSessionResponse>(
      `/sessions/${sessionId}/begin`
    );
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * POST /sessions/:sessionId/selfie
 * Uploads baseline selfie base64 image data URL.
 */
export async function uploadSelfie(
  sessionId: string,
  base64Image: string,
): Promise<{ ok: boolean }> {
  try {
    const { data } = await apiClient.post<{ ok: boolean }>(
      `/sessions/${sessionId}/selfie`,
      { image: base64Image }
    );
    return data;
  } catch (err) {
    throw normaliseError(err);
  }
}
