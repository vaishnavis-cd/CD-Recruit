import { create } from "zustand";
import { SessionStatus } from "@cd-recruit/shared-types";
import type { CvMode, QuestionSummary } from "@cd-recruit/shared-types";
import { TAB_ID } from "./tab";
import { startSession, resumeSession, beginSession as apiBeginSession } from "@/api/session";
import type { ApiError } from "@/api/session";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SessionErrorCode =
  | "INVITE_TOKEN_INVALID"
  | "INVITE_TOKEN_EXPIRED"
  | "SESSION_ALREADY_ACTIVE"
  | "RESUME_WINDOW_EXPIRED"
  | "MAX_DISCONNECTS_REACHED"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface SessionError {
  code: SessionErrorCode;
  message: string;
}

export interface SessionState {
  // ── Core session fields ──────────────────────────────────────────────────
  sessionId: string | null;
  candidateId: string | null;
  roleTemplateName: string | null;
  cvMode: CvMode | null;
  status: SessionStatus | null;
  startedAt: string | null;
  deadlineAt: string | null;
  disconnectCount: number;
  durationMinutes: number | null;
  questions: QuestionSummary[];

  // ── UI flags ─────────────────────────────────────────────────────────────
  isLoading: boolean;
  error: SessionError | null;
  /** True when backend returned 409 SECOND_TAB_DETECTED on heartbeat. Terminal. */
  isSecondTab: boolean;

  // ── Persistence ───────────────────────────────────────────────────────────
  /** sessionId written to sessionStorage on start/resume; read on page load. */
  persistedSessionId: string | null;
}

interface SessionActions {
  startSession: (inviteToken: string) => Promise<void>;
  resumeSession: () => Promise<void>;
  beginSession: () => Promise<void>;
  updateFromHeartbeat: (
    sessionStatus: SessionStatus,
    deadlineAt: string,
  ) => void;
  setSecondTab: () => void;
  clearError: () => void;
  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// sessionStorage helpers
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = "cd-recruit:sessionId";

function persistSessionId(sessionId: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // sessionStorage unavailable (privacy mode, etc.) — session won't survive reload
  }
}

function readPersistedSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearPersistedSessionId(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // no-op
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_STATE: SessionState = {
  sessionId: null,
  candidateId: null,
  roleTemplateName: null,
  cvMode: null,
  status: null,
  startedAt: null,
  deadlineAt: null,
  disconnectCount: 0,
  durationMinutes: null,
  questions: [],
  isLoading: false,
  error: null,
  isSecondTab: false,
  persistedSessionId: readPersistedSessionId(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Error code → user-facing message
// ─────────────────────────────────────────────────────────────────────────────

function toSessionError(apiError: ApiError): SessionError {
  const codeMap: Record<string, SessionErrorCode> = {
    INVITE_TOKEN_INVALID: "INVITE_TOKEN_INVALID",
    INVITE_TOKEN_EXPIRED: "INVITE_TOKEN_EXPIRED",
    SESSION_ALREADY_ACTIVE: "SESSION_ALREADY_ACTIVE",
    RESUME_WINDOW_EXPIRED: "RESUME_WINDOW_EXPIRED",
    MAX_DISCONNECTS_REACHED: "MAX_DISCONNECTS_REACHED",
    SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
    NETWORK_ERROR: "NETWORK_ERROR",
  };

  const code: SessionErrorCode = codeMap[apiError.code] ?? "UNKNOWN";
  return { code, message: apiError.message };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionState & SessionActions>()(
  (set, get) => ({
    ...INITIAL_STATE,

    // ── startSession ──────────────────────────────────────────────────────────
    startSession: async (inviteToken: string) => {
      if (get().isLoading) return; // prevent double-submit
      set({ isLoading: true, error: null });

      try {
        const response = await startSession(inviteToken);

        persistSessionId(response.sessionId);

        set({
          sessionId: response.sessionId,
          candidateId: response.candidateId,
          roleTemplateName: response.roleTemplateName,
          cvMode: response.cvMode,
          status: response.status,
          startedAt: response.startedAt,
          deadlineAt: response.deadlineAt,
          disconnectCount: response.disconnectCount,
          durationMinutes: response.durationMinutes,
          questions: response.questions,
          persistedSessionId: response.sessionId,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        set({ isLoading: false, error: toSessionError(err as ApiError) });
      }
    },

    // ── resumeSession ─────────────────────────────────────────────────────────
    resumeSession: async () => {
      const persistedId = get().persistedSessionId ?? readPersistedSessionId();
      if (!persistedId || get().isLoading) return;

      set({ isLoading: true, error: null });

      try {
        const response = await resumeSession(persistedId, TAB_ID);

        set({
          sessionId: response.sessionId,
          status: response.status,
          deadlineAt: response.deadlineAt,
          disconnectCount: response.disconnectCount,
          questions: response.questions,
          persistedSessionId: response.sessionId,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        const apiError = err as ApiError;
        // Terminal errors — clear persisted session so the candidate goes to login
        if (apiError.status === 410 || apiError.status === 404) {
          clearPersistedSessionId();
          set({
            persistedSessionId: null,
            isLoading: false,
            error: toSessionError(apiError),
          });
        } else {
          set({ isLoading: false, error: toSessionError(apiError) });
        }
      }
    },

    // ── beginSession ──────────────────────────────────────────────────────────
    beginSession: async () => {
      const sessionId = get().sessionId;
      if (!sessionId || get().isLoading) return;

      set({ isLoading: true, error: null });

      try {
        const response = await apiBeginSession(sessionId);

        set({
          status: response.status,
          startedAt: response.startedAt,
          deadlineAt: response.deadlineAt,
          questions: response.questions,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        set({ isLoading: false, error: toSessionError(err as ApiError) });
      }
    },

    // ── updateFromHeartbeat ───────────────────────────────────────────────────
    updateFromHeartbeat: (sessionStatus: SessionStatus, deadlineAt: string) => {
      set({ deadlineAt, status: sessionStatus });

      // Surface terminal transitions as errors so the UI can react
      if (
        sessionStatus === SessionStatus.AUTO_SUBMITTED ||
        sessionStatus === SessionStatus.SUBMITTED ||
        sessionStatus === SessionStatus.CLOSED
      ) {
        set({
          error: {
            code: "SESSION_EXPIRED",
            message: "Your session has ended.",
          },
        });
      }
    },

    // ── setSecondTab ──────────────────────────────────────────────────────────
    setSecondTab: () => {
      set({ isSecondTab: true });
    },

    // ── clearError ────────────────────────────────────────────────────────────
    clearError: () => {
      set({ error: null });
    },

    // ── reset ─────────────────────────────────────────────────────────────────
    reset: () => {
      clearPersistedSessionId();
      set({ ...INITIAL_STATE, persistedSessionId: null });
    },
  }),
);
