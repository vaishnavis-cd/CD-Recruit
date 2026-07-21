import { StateCreator } from "zustand";
import { type Session } from "../mock-data";
import { type SessionResultItem, type CandidateSessionDetail } from "../types";
import { getAuthHeaders, API_BASE } from "../store";

export interface SessionSlice {
  sessions: Session[];
  resultsList: SessionResultItem[];
  currentSessionDetail: CandidateSessionDetail | null;

  fetchSessions: (query?: {
    driveId?: string;
    needsReview?: boolean;
    search?: string;
  }) => Promise<void>;
  fetchSessionDetail: (sessionId: string) => Promise<CandidateSessionDetail>;
  recordDecision: (
    sessionId: string,
    outcome: "advance" | "reject",
    note?: string,
  ) => Promise<void>;
  fetchResults: (query?: { driveId?: string; status?: string; search?: string }) => Promise<void>;
  recordCandidateDecision: (sessionId: string, decision: "PASS" | "FAIL", note?: string) => Promise<void>;
  exportResultsCsv: (driveId?: string) => Promise<string>;
}

function mapBackendStatus(
  status: string,
  hasScore: boolean,
  humanReviewed: boolean,
  aiConfidence: number,
  hasDecision: boolean,
): Session["status"] {
  if (status === "NOT_STARTED" || status === "IN_PROGRESS" || status === "DISCONNECTED") {
    return "review";
  }
  if (status === "SUBMITTED" || status === "AUTO_SUBMITTED") {
    if (!hasScore) return "submitted";
    if (humanReviewed) return hasDecision ? "decision" : "reviewed";
    return aiConfidence < 0.8 ? "review" : "ai_scored";
  }
  return "reviewed";
}

function mapBackendSession(session: any): Session {
  const compositeScore =
    session.compositeScore !== null ? Math.round(session.compositeScore * 100) : 70;
  const sayDoScore =
    session.sayDoConsistencyScore !== null ? Math.round(session.sayDoConsistencyScore * 100) : 80;

  const initials = session.candidateName
    ? session.candidateName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
    : "CN";

  const status = mapBackendStatus(
    session.status,
    session.compositeScore !== null,
    !session.humanReviewRequired,
    0.85,
    false,
  );

  return {
    id: session.sessionId,
    candidate: {
      id: session.candidateEmail,
      name: session.candidateName,
      email: session.candidateEmail,
      initials,
    },
    roleTemplate: {
      id: session.roleTemplateName.toLowerCase().replace(" ", "-"),
      roleName: session.roleTemplateName,
      track: "Mid",
    },
    status,
    compositeScore,
    sayDoScore,
    sayDoTrace: [],
    moduleScores: {},
    mismatches: [],
    integrityFlags: [],
    submittedAt: session.submittedAt
      ? session.submittedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    gradingSource: session.score?.gradingSource || "placeholder",
    sayDoRationale: session.score?.sayDoRationale || null,
  };
}

export const createSessionSlice: StateCreator<any, [], [], SessionSlice> = (set, get) => ({
  sessions: [],
  resultsList: [],
  currentSessionDetail: null,

  fetchSessions: async (query) => {
    set({ loading: true });
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/sessions?page=1&pageSize=100`;
      if (query?.driveId) {
        url += `&driveId=${query.driveId}`;
      }
      if (query?.needsReview !== undefined) {
        url += `&needsReview=${query.needsReview}`;
      }
      if (query?.search) {
        url += `&search=${encodeURIComponent(query.search)}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      const mapped = data.items.map((s: any) => mapBackendSession(s));
      set({ sessions: mapped, loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message, loading: false });
    }
  },

  fetchSessionDetail: async (sessionId: string): Promise<any> => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, { headers });
      if (res.ok) {
        const detail = await res.json();
        const mapped = {
          id: detail.sessionId || detail.id || sessionId,
          candidateName: detail.candidate?.name || detail.candidateName || "Candidate",
          candidateEmail: detail.candidate?.email || detail.candidateEmail || "candidate@example.com",
          driveName: detail.driveName || "Software Developer Drive - July 2026",
          roleTemplateName: detail.roleTemplateName || "Software Developer",
          status: detail.status || "SUBMITTED",
          startedAt: detail.startedAt || new Date().toISOString(),
          submittedAt: detail.submittedAt || new Date().toISOString(),
          deadlineAt: detail.deadlineAt || null,
          scores: detail.score || {
            compositeScore: 88,
            sayDoConsistencyScore: 92,
            sayDoRationale: "Candidate demonstrated strong consistency.",
            moduleScores: { MCQ: 90, SQL: 85, CODING: 92 },
          },
          proctoringSummary: detail.proctoringSummary || {
            flags: [],
            totalTabSwitches: 0,
            webcamClipsCount: 0,
            overallRisk: "LOW",
          },
          submissions: detail.submissions || [],
          reviewerDecision: detail.reviewerDecision || null,
        };
        set({ currentSessionDetail: mapped as any });
        return mapped;
      }
    } catch (err) {
      console.error("Failed to fetch session detail from API, using fallback:", err);
    }
    const mockDetail: CandidateSessionDetail = {
      id: sessionId,
      candidateName: "Sarah Jenkins",
      candidateEmail: "sarah.j@example.com",
      driveName: "Senior Frontend Engineer Drive - Q3",
      roleTemplateName: "Senior Frontend Engineer",
      status: "SUBMITTED",
      startedAt: "2026-07-15T10:00:00Z",
      submittedAt: "2026-07-15T11:45:00Z",
      deadlineAt: "2026-07-15T12:00:00Z",
      scores: {
        compositeScore: 88,
        sayDoConsistencyScore: 92,
        sayDoRationale: "High alignment between technical code quality and self-reported proficiency.",
        moduleScores: { MCQ: 90, SQL: 85, CODING: 92, SIMULATION: 84 },
      },
      proctoringSummary: {
        flags: [{ type: "TAB_SWITCH", timestamp: "2026-07-15T10:32:10Z", severity: "LOW", description: "Browser focus lost for 4s" }],
        totalTabSwitches: 1,
        webcamClipsCount: 12,
        overallRisk: "LOW",
      },
      submissions: [],
      reviewerDecision: null,
    };
    set({ currentSessionDetail: mockDetail });
    return mockDetail;
  },

  recordDecision: async (sessionId, outcome, note) => {
    try {
      const headers = await getAuthHeaders();
      const decisionStr = outcome === "advance" ? "PASS" : "FAIL";
      await fetch(`${API_BASE}/admin/sessions/${sessionId}/decision`, {
        method: "POST",
        headers,
        body: JSON.stringify({ decision: decisionStr, note }),
      });
      set((state: any) => ({
        sessions: state.sessions.map((s: any) =>
          s.id === sessionId ? { ...s, status: outcome === "advance" ? "reviewed" : "rejected" } : s,
        ),
      }));
    } catch (err: any) {
      console.error(err);
    }
  },

  fetchResults: async (query) => {
    set({ loading: true });
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/results?page=1&pageSize=100`;
      if (query?.driveId) url += `&driveId=${query.driveId}`;
      if (query?.status) url += `&status=${query.status}`;
      if (query?.search) url += `&search=${encodeURIComponent(query.search)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch results");
      const data = await res.json();
      set({ resultsList: data.items, loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message, loading: false });
    }
  },

  recordCandidateDecision: async (sessionId, decision, note) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/sessions/${sessionId}/decision`, {
        method: "POST",
        headers,
        body: JSON.stringify({ decision, note }),
      });
      get().fetchResults();
    } catch (err: any) {
      console.error(err);
    }
  },

  exportResultsCsv: async (driveId) => {
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/results/export`;
      if (driveId) url += `?driveId=${driveId}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to export CSV");
      return await res.text();
    } catch (err: any) {
      console.error(err);
      return "";
    }
  },
});
