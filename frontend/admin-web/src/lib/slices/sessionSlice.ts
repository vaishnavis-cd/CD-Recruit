import { StateCreator } from "zustand";
import { type Session, type SessionResultItem, type CandidateSessionDetail } from "../types";
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
  if (!session) {
    return {
      id: "unknown",
      driveId: "",
      candidate: { id: "unknown", name: "Candidate", email: "", initials: "CN" },
      roleTemplate: { id: "dev", roleName: "Software Developer", track: "Mid" },
      status: "review",
      compositeScore: 70,
      sayDoScore: 80,
      sayDoTrace: [],
      moduleScores: {},
      mismatches: [],
      integrityFlags: [],
      submittedAt: new Date().toISOString(),
      gradingSource: "placeholder",
      sayDoRationale: null,
    };
  }

  const compositeScore =
    session.compositeScore !== null && session.compositeScore !== undefined
      ? Math.round(session.compositeScore * 100)
      : 70;
  const sayDoScore =
    session.sayDoConsistencyScore !== null && session.sayDoConsistencyScore !== undefined
      ? Math.round(session.sayDoConsistencyScore * 100)
      : 80;

  const initials = session.candidateName
    ? session.candidateName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
    : "CN";

  const roleName = session.roleTemplateName || session.roleName || "Software Developer";

  const status = mapBackendStatus(
    session.status || "SUBMITTED",
    session.compositeScore !== null && session.compositeScore !== undefined,
    !session.humanReviewRequired,
    0.85,
    false,
  );

  return {
    id: session.sessionId || session.id || "sess",
    driveId: session.driveId || "",
    candidate: {
      id: session.candidateEmail || "cand",
      name: session.candidateName || "Candidate",
      email: session.candidateEmail || "candidate@example.com",
      initials,
    },
    roleTemplate: {
      id: roleName.toLowerCase().replace(/\s+/g, "-"),
      roleName: roleName,
      track: "Mid",
    },
    status,
    compositeScore,
    sayDoScore,
    sayDoTrace: [],
    moduleScores: session.moduleScores || {},
    mismatches: [],
    integrityFlags: session.integrityFlags || [],
    submittedAt: session.submittedAt ? session.submittedAt : new Date().toISOString(),
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

  fetchSessionDetail: async (sessionId: string): Promise<CandidateSessionDetail> => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch session detail");
    const detail = await res.json();
    const mapped = {
      id: detail.sessionId || detail.id || sessionId,
      candidateName: detail.candidate?.name || detail.candidateName || "Candidate",
      candidateEmail: detail.candidate?.email || detail.candidateEmail || "",
      driveName: detail.driveName || detail.roleTemplateName || "Assessment Drive",
      roleTemplateName: detail.roleTemplateName || "Software Developer",
      status: detail.status || "SUBMITTED",
      startedAt: detail.startedAt || null,
      submittedAt: detail.submittedAt || null,
      deadlineAt: detail.deadlineAt || null,
      score: detail.score ? {
        compositeScore: detail.score.compositeScore,
        sayDoConsistencyScore: detail.score.sayDoConsistencyScore,
        aiConfidence: detail.score.aiConfidence,
        humanReviewed: detail.score.humanReviewed,
        sayDoRationale: detail.score.sayDoRationale,
        moduleScores: detail.score.moduleScores || {},
      } : null,
      proctoringSummary: detail.proctoringSummary || {
        flags: detail.integrityFlags || [],
        totalTabSwitches: (detail.integrityFlags || []).filter((f: any) => f.category === "GAZE_AWAY" || f.category === "LOOKING_AWAY").length,
        webcamClipsCount: (detail.integrityFlags || []).filter((f: any) => f.evidenceClipUrl).length,
        overallRisk: (detail.integrityFlags || []).length > 2 ? "HIGH" : (detail.integrityFlags || []).length > 0 ? "MEDIUM" : "LOW",
      },
      integrityFlags: detail.integrityFlags || [],
      submissions: detail.submissions || [],
      reviewerDecision: detail.reviewerDecision || null,
    };
    set({ currentSessionDetail: mapped as any });
    return mapped as any;
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
    const headers = await getAuthHeaders();
    const mappedDecision = decision === "PASS" ? "ADVANCE" : decision === "FAIL" ? "REJECT" : decision;
    const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}/decision`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision: mappedDecision, note }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Failed to record decision (${res.status})`);
    }
    get().fetchResults();
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
