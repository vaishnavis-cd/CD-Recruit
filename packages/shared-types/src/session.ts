import { CvMode, SessionStatus, ModuleType } from "./enums";
import { QuestionSummary } from "./question";

// ---------------------------------------------------------------------------
// Session start
// ---------------------------------------------------------------------------

export interface StartSessionRequest {
  /** Short-lived JWT issued by the invite system. */
  inviteToken: string;
}

export interface StartSessionResponse {
  sessionId: string;
  candidateId: string;
  roleTemplateId: string;
  roleTemplateName: string;
  /**
   * Assessment time limit in minutes (copied from RoleTemplate.durationMinutes).
   * Frontend uses this to drive the countdown display.
   */
  durationMinutes: number;
  cvMode: CvMode;
  status: SessionStatus;
  startedAt: string; // ISO-8601
  deadlineAt: string; // ISO-8601 — backend is source of truth; frontend treats as advisory
  /**
   * Number of times this session has transitioned to DISCONNECTED.
   * Reconnect is allowed while disconnectCount < 3.
   * On the 3rd disconnect (disconnectCount === 3) the session AUTO_SUBMITS immediately.
   */
  disconnectCount: number;
  /** All questions assigned to this session, ordered by moduleType then moduleIndex. */
  questions: QuestionSummary[];
}

// ---------------------------------------------------------------------------
// Session resume (reconnect after disconnect)
// ---------------------------------------------------------------------------

export interface ResumeSessionRequest {
  sessionId: string;
  /** The same tab identifier used in the last heartbeat, or a freshly generated one. */
  tabId: string;
}

export interface ResumeSessionResponse {
  sessionId: string;
  status: SessionStatus;
  deadlineAt: string; // ISO-8601 — deadline unchanged on resume
  disconnectCount: number;
  reconnectedAt: string; // ISO-8601
  questions: QuestionSummary[];
}

// ---------------------------------------------------------------------------
// Heartbeat
//
// Sent every 15-30 s by the candidate tab.
// Backend marks Session.lastHeartbeatAt; if no heartbeat for ~45-90 s
// (2-3 missed cycles) the session transitions to DISCONNECTED.
// ---------------------------------------------------------------------------

export interface HeartbeatRequest {
  sessionId: string;
  /** Identifies the active browser tab — used for single-active-session enforcement. */
  tabId: string;
}

export interface HeartbeatResponse {
  ok: boolean;
  /**
   * Current server-side session status — client should handle unexpected transitions
   * (e.g. AUTO_SUBMITTED, DISCONNECTED) immediately without waiting for the next heartbeat.
   */
  sessionStatus: SessionStatus;
  deadlineAt: string; // ISO-8601 — repeated so client clock can re-sync on each heartbeat
}

// ---------------------------------------------------------------------------
// Session progress
//
// Represents the candidate's current state across all modules and questions.
// Free navigation: candidates jump between any module/question in any order.
// ---------------------------------------------------------------------------

export type AnswerStatus = "untouched" | "draft" | "submitted";

export interface SessionProgressItem {
  questionId: string;
  moduleType: ModuleType;
  moduleIndex: number;
  status: AnswerStatus;
  /** ISO-8601 or null if status is 'untouched'. */
  lastAutosavedAt: string | null;
}

export interface SessionProgressResponse {
  sessionId: string;
  items: SessionProgressItem[];
  /** Count of questions where status !== 'untouched'. */
  answeredCount: number;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Session close (manual submit)
// ---------------------------------------------------------------------------

export interface CloseSessionResponse {
  sessionId: string;
  status: SessionStatus;
  submittedAt: string; // ISO-8601
}
