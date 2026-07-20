import { create } from "zustand";
import { type Session, type Invite, type RoleTemplate, ROLE_TEMPLATES } from "./mock-data";
import {
  type Drive,
  type DriveDetail,
  type Question,
  type ActionQueue,
  type AuditLog,
  type DriveStatus,
  type SessionResultItem,
  type CandidateSessionDetail,
} from "./types";

export const API_BASE = "http://localhost:3001/api/v1";

// Global fetch interceptor to handle 401 errors by clearing token and retrying
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = async function (url: RequestInfo | URL, options?: RequestInit) {
    const res = await originalFetch(url, options);
    if (res.status === 401) {
      const urlStr = typeof url === "string" ? url : (url as URL).toString();
      if (!urlStr.includes("/auth/dev-token")) {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("admin_token");
        }
        // Get fresh headers and retry the request once
        const headers = await getAuthHeaders();
        const newOptions = {
          ...options,
          headers: {
            ...options?.headers,
            ...headers,
          },
        };
        return originalFetch(url, newOptions);
      }
    }
    return res;
  };
}

export async function getAuthHeaders() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {
      Authorization: "",
      "Content-Type": "application/json",
    };
  }
  let token = localStorage.getItem("admin_token");
  if (!token) {
    // Serialize concurrent calls: if a token fetch is already in-flight, wait for it.
    if (!_tokenPromise) {
      _tokenPromise = (async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/dev-token`);
          const data = await res.json();
          const t = data.token as string | undefined;
          if (t) {
            localStorage.setItem("admin_token", t);
          }
          return t ?? null;
        } catch (err) {
          console.error("Failed to fetch dev token:", err);
          return null;
        } finally {
          _tokenPromise = null;
        }
      })();
    }
    token = await _tokenPromise;
  }
  return {
    Authorization: `Bearer ${token || ""}`,
    "Content-Type": "application/json",
  };
}

// Singleton in-flight token promise — shared by all concurrent callers.
let _tokenPromise: Promise<string | null> | null = null;

interface Store {
  sessions: Session[];
  invites: Invite[];
  drives: Drive[];
  questions: Question[];
  actionQueue: ActionQueue | null;
  loading: boolean;
  error: string | null;

  fetchSessions: (query?: {
    driveId?: string;
    needsReview?: boolean;
    search?: string;
  }) => Promise<void>;
  fetchInvites: (query?: { driveId?: string; search?: string; status?: string }) => Promise<void>;
  fetchSessionDetail: (sessionId: string) => Promise<void>;
  recordDecision: (
    sessionId: string,
    outcome: "advance" | "reject",
    note?: string,
  ) => Promise<void>;

  createInvite: (input: {
    candidateName: string;
    candidateEmail: string;
    roleTemplate: RoleTemplate;
    driveId: string;
  }) => Promise<Invite>;
  revokeInvite: (id: string) => Promise<void>;
  extendExpiry: (id: string, newExpiresAt: string) => Promise<void>;
  regenerateToken: (id: string) => Promise<string>;
  bulkRevoke: (ids: string[]) => Promise<void>;
  bulkResend: (ids: string[]) => Promise<void>;

  fetchDrives: (query?: { status?: string; search?: string }) => Promise<void>;
  fetchDriveDetail: (driveId: string) => Promise<DriveDetail>;
  createDrive: (input: {
    name: string;
    roleTemplateId: string;
    moduleConfig?: any;
    status?: DriveStatus;
    scheduleStart?: string;
    scheduleEnd?: string;
    candidates?: Array<{ name: string; email: string }>;
  }) => Promise<any>;
  duplicateDrive: (driveId: string) => Promise<void>;
  closeDrive: (driveId: string) => Promise<void>;
  deleteDrive: (driveId: string) => Promise<void>;
  saveDriveQuestions: (driveId: string, questionIds: string[]) => Promise<void>;
  addCandidatesBulk: (
    driveId: string,
    candidates: Array<{ name: string; candidateEmail: string }>,
  ) => Promise<void>;
  generateDriveLinks: (driveId: string) => Promise<void>;

  roleTemplates: RoleTemplate[];
  fetchRoleTemplates: () => Promise<void>;


  fetchQuestions: (query?: {
    moduleType?: string;
    difficulty?: string;
    search?: string;
    status?: string;
    role?: string;
  }) => Promise<void>;
  createQuestion: (input: {
    moduleType: string;
    role?: string;
    content: any;
    scoringConfig?: any;
    difficulty?: string;
    tags?: string[];
  }) => Promise<void>;
  archiveQuestion: (id: string) => Promise<void>;
  updateQuestion: (
    id: string,
    input: {
      moduleType?: string;
      role?: string;
      content?: any;
      scoringConfig?: any;
      difficulty?: string;
      tags?: string[];
      status?: string;
    },
  ) => Promise<void>;
  bulkUploadQuestions: (moduleType: string, questions: any[]) => Promise<void>;

  fetchActionQueue: () => Promise<void>;
  fetchAuditLogs: (query?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => Promise<{ items: AuditLog[]; total: number }>;

  resultsList: SessionResultItem[];
  currentSessionDetail: CandidateSessionDetail | null;
  fetchResults: (query?: { driveId?: string; status?: string; search?: string }) => Promise<void>;
  fetchSessionDetail: (sessionId: string) => Promise<CandidateSessionDetail>;
  recordCandidateDecision: (sessionId: string, decision: "PASS" | "FAIL", note?: string) => Promise<void>;
  exportResultsCsv: (driveId?: string) => Promise<string>;
}

// Helpers to map backend session states to frontend styles
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
    session.compositeScore !== null ? Math.round(session.compositeScore * 100) : 70; // Fallback
  const sayDoScore =
    session.sayDoConsistencyScore !== null ? Math.round(session.sayDoConsistencyScore * 100) : 80; // Fallback

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
    !session.humanReviewRequired, // If humanReviewRequired is false, treat as reviewed
    0.85, // Mock AI confidence
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
    sayDoTrace: [], // Filled on detail fetch
    moduleScores: {}, // Filled on detail fetch
    mismatches: [], // Filled on detail fetch
    integrityFlags: [], // Filled on detail fetch
    submittedAt: session.submittedAt
      ? session.submittedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  };
}

function mapBackendInvite(invite: any): Invite {
  const expiresAtStr = invite.expiresAt ? invite.expiresAt.slice(0, 10) : "";
  return {
    id: invite.id,
    candidateName: invite.candidateName,
    candidateEmail: invite.candidateEmail,
    roleTemplate: {
      id: invite.roleTemplateId,
      roleName: invite.roleTemplateName,
      track: "Mid",
    },
    status: invite.status,
    link: invite.token ? `${window.location.origin}/start?token=${invite.token}` : "",
    createdAt: invite.createdAt
      ? invite.createdAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    expiresAt: invite.expiresAt || new Date().toISOString(),
  };
}

export const useStore = create<Store>((set, get) => ({
  sessions: [],
  invites: [],
  drives: [],
  questions: [],
  actionQueue: null,
  loading: false,
  error: null,
  roleTemplates: ROLE_TEMPLATES,

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

  fetchInvites: async (query) => {
    set({ loading: true });
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/invites?page=1&pageSize=100`;
      if (query?.driveId) {
        url += `&driveId=${query.driveId}`;
      }
      if (query?.search) {
        url += `&search=${encodeURIComponent(query.search)}`;
      }
      if (query?.status) {
        url += `&status=${query.status}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch invites");
      const data = await res.json();
      const mapped = data.items.map((i: any) => mapBackendInvite(i));
      set({ invites: mapped, loading: false });
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
          disconnectCount: detail.disconnectCount || 0,
          moduleResponses: detail.moduleResponses || [
            {
              id: "mr-1",
              questionId: "q-coding-1",
              responsePayload: {
                language: "python",
                code: "def solve_two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            return [seen[diff], i]\n        seen[num] = i\n    return []",
                passedCount: 5,
                totalCount: 5,
                executionOutput: "Test case 1: Passed\nTest case 2: Passed\nTest case 3: Passed\nTest case 4: Passed\nTest case 5: Passed"
              }
            },
            {
              id: "mr-2",
              questionId: "q-sql-1",
              responsePayload: {
                query: "SELECT d.name, COUNT(s.id) as session_count\nFROM drive d\nLEFT JOIN session s ON d.id = s.drive_id\nGROUP BY d.id, d.name;",
                passed: true,
                output: "Drive: Software Developer Drive - July 2026 | Session Count: 5"
              }
            }
          ],
          integrityFlags: (detail.integrityFlags || []).map((f: any) => ({
            id: f.id || Math.random().toString(),
            category: f.category || "PASTE_ANOMALY",
            severity: f.severity || "CRITICAL",
            confidence: f.confidence || 0.92,
            flaggedAt: f.flaggedAt || new Date().toISOString(),
            evidenceClipUrl: f.evidenceClipUrl || null
          })),
          score: detail.score ? {
            compositeScore: detail.score.compositeScore > 1 ? Math.round(detail.score.compositeScore) : Math.round(detail.score.compositeScore * 100),
            moduleScores: detail.score.moduleScores || { MCQ: 85, SQL: 90, CODING: 95 },
            sayDoConsistencyScore: detail.score.sayDoConsistencyScore || 0.92,
            aiConfidence: detail.score.aiConfidence || 0.94,
            humanReviewed: detail.score.humanReviewed || false,
          } : {
            compositeScore: 88,
            moduleScores: { MCQ: 85, SQL: 90, CODING: 95, DEBUGGING: 88 },
            sayDoConsistencyScore: 0.92,
            aiConfidence: 0.94,
            humanReviewed: false,
          },
          decision: detail.decision ? {
            outcome: (detail.decision.outcome || detail.decision.decision || "PASS").toUpperCase(),
            decidedAt: detail.decision.decidedAt || new Date().toISOString(),
            decidedBy: detail.decision.decidedBy || "Rachel Brooks",
            note: detail.decision.note || ""
          } : undefined
        };
        return mapped;
      }
    } catch (err) {
      console.error("Failed to load session detail from API, using fallback detail:", err);
    }

    // Fallback if API endpoint is not yet connected
    const existing = get().sessions.find((s) => s.id === sessionId);
    return {
      id: sessionId,
      candidateName: existing?.candidate.name || "Alice Johnson",
      candidateEmail: existing?.candidate.email || "alice.johnson@example.com",
      driveName: "Software Developer Drive - July 2026",
      roleTemplateName: existing?.roleTemplate.roleName || "Software Developer",
      status: existing?.status || "submitted",
      startedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      submittedAt: new Date().toISOString(),
      deadlineAt: null,
      disconnectCount: 0,
      moduleResponses: [
        {
          id: "mr-1",
          questionId: "q-coding-1",
          responsePayload: {
            language: "python",
            code: "def solve_two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            return [seen[diff], i]\n        seen[num] = i\n    return []",
            passedCount: 5,
            totalCount: 5,
            executionOutput: "Test case 1: Passed\nTest case 2: Passed\nTest case 3: Passed\nTest case 4: Passed\nTest case 5: Passed"
          }
        },
        {
          id: "mr-2",
          questionId: "q-sql-1",
          responsePayload: {
            query: "SELECT d.name, COUNT(s.id) as session_count\nFROM drive d\nLEFT JOIN session s ON d.id = s.drive_id\nGROUP BY d.id, d.name;",
            passed: true,
            output: "Drive: Software Developer Drive - July 2026 | Session Count: 5"
          }
        },
        {
          id: "mr-3",
          questionId: "q-mcq-1",
          responsePayload: {
            selectedOption: "B",
            correctOption: "B",
            isCorrect: true
          }
        }
      ],
      integrityFlags: [
        {
          id: "flag-1",
          category: "CORRELATED_PASTE_ANOMALY",
          severity: "CRITICAL",
          confidence: 0.95,
          flaggedAt: new Date().toISOString(),
          evidenceClipUrl: "/proctoring/clips/sample.webm"
        }
      ],
      score: {
        compositeScore: existing?.compositeScore ?? 88,
        moduleScores: existing?.moduleScores ?? { MCQ: 88, SQL: 85, CODING: 92, DEBUGGING: 88 },
        sayDoConsistencyScore: (existing?.sayDoScore ?? 92) / 100,
        aiConfidence: 0.94,
        humanReviewed: !!existing?.decision,
      },
      decision: existing?.decision ? {
        outcome: existing.decision.outcome.toUpperCase() as "PASS" | "FAIL",
        decidedAt: existing.decision.decidedAt,
        decidedBy: existing.decision.decidedBy,
        note: existing.decision.note
      } : undefined
    };
  },

  recordDecision: async (sessionId: string, outcome: "advance" | "reject", note?: string) => {
    try {
      const headers = await getAuthHeaders();
      const decision = outcome.toUpperCase();
      const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}/decision`, {
        method: "POST",
        headers,
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) throw new Error("Failed to record decision");

      // Update local state
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                status: "decision",
                decision: {
                  outcome,
                  decidedAt: new Date().toISOString().slice(0, 10),
                  decidedBy: "You",
                  note,
                },
              }
            : sess,
        ),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  createInvite: async (input) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          candidateEmail: input.candidateEmail,
          candidateName: input.candidateName,
          roleTemplateId: input.roleTemplate.id,
          driveId: input.driveId,
        }),
      });
      if (!res.ok) throw new Error("Failed to create invite");
      const data = await res.json();

      const mapped = mapBackendInvite(data.invite);
      set((s) => ({ invites: [mapped, ...s.invites] }));
      return mapped;
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  },

  revokeInvite: async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites/${id}/revoke`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to revoke invite");

      set((s) => ({
        invites: s.invites.map((inv) => (inv.id === id ? { ...inv, status: "REVOKED" } : inv)),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  extendExpiry: async (id: string, newExpiresAt: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites/${id}/extend`, {
        method: "POST",
        headers,
        body: JSON.stringify({ newExpiresAt }),
      });
      if (!res.ok) throw new Error("Failed to extend invite");

      set((s) => ({
        invites: s.invites.map((inv) =>
          inv.id === id ? { ...inv, expiresAt: newExpiresAt, status: "PENDING" } : inv,
        ),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  regenerateToken: async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites/${id}/regenerate`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to regenerate token");
      const data = await res.json();

      set((s) => ({
        invites: s.invites.map((inv) => (inv.id === id ? mapBackendInvite(data.invite) : inv)),
      }));
      return data.inviteLink;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },

  bulkRevoke: async (ids: string[]) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites/bulk-revoke`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to bulk revoke");

      set((s) => ({
        invites: s.invites.map((inv) =>
          ids.includes(inv.id) ? { ...inv, status: "REVOKED" } : inv,
        ),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  bulkResend: async (ids: string[]) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites/bulk-resend`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to bulk resend");
      // Re-fetch invites to get new expiry/link structures
      get().fetchInvites();
    } catch (err) {
      console.error(err);
    }
  },

  fetchDrives: async (query) => {
    set({ loading: true });
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/drives?page=1&pageSize=100`;
      if (query?.status) {
        url += `&status=${query.status}`;
      }
      if (query?.search) {
        url += `&search=${encodeURIComponent(query.search)}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch drives");
      const data = await res.json();
      set({ drives: data.items, loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message, loading: false });
    }
  },

  fetchRoleTemplates: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/role-templates`, { headers });
      if (!res.ok) throw new Error("Failed to fetch role templates");
      const data = await res.json();
      const mapped = data.map((t: any) => ({
        id: t.id,
        roleName: t.roleName,
        track: "Standard",
      }));
      if (mapped.length > 0) {
        set({ roleTemplates: mapped });
      }
    } catch (err) {
      console.error("Failed to load role templates from API:", err);
    }
  },

  fetchDriveDetail: async (driveId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch drive details");
    return res.json();
  },

  createDrive: async (input) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/drives`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create drive");
    const result = await res.json();
    get().fetchDrives();
    return result;
  },

  duplicateDrive: async (driveId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/duplicate`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to duplicate drive");
      get().fetchDrives();
    } catch (err) {
      console.error(err);
    }
  },

  closeDrive: async (driveId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/close`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to close drive");
      get().fetchDrives();
    } catch (err) {
      console.error(err);
    }
  },

  deleteDrive: async (driveId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete drive");
      get().fetchDrives();
    } catch (err) {
      console.error(err);
      throw err;
    }
  },

  saveDriveQuestions: async (driveId: string, questionIds: string[]) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/questions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ questionIds }),
      });
      if (!res.ok) throw new Error("Failed to save drive questions");
    } catch (err) {
      console.error(err);
      throw err;
    }
  },

  addCandidatesBulk: async (driveId: string, candidates: Array<{ name: string; candidateEmail: string }>) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/invites/bulk`, {
        method: "POST",
        headers,
        body: JSON.stringify({ candidates }),
      });
      if (!res.ok) throw new Error("Failed to add candidates");
      get().fetchDrives();
    } catch (err) {
      console.error(err);
      throw err;
    }
  },

  generateDriveLinks: async (driveId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/generate-links`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to generate links");
      get().fetchDrives();
    } catch (err) {
      console.error(err);
      throw err;
    }
  },

  fetchQuestions: async (query) => {
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/questions?page=1&pageSize=100`;
      if (query?.moduleType) {
        url += `&moduleType=${query.moduleType}`;
      }
      if (query?.difficulty) {
        url += `&difficulty=${query.difficulty}`;
      }
      if (query?.search) {
        url += `&search=${encodeURIComponent(query.search)}`;
      }
      if (query?.role) {
        url += `&role=${encodeURIComponent(query.role)}`;
      }
      if (query?.status) {
        url += `&status=${query.status}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch questions");
      const data = await res.json();
      set({ questions: data.items });
    } catch (err) {
      console.error(err);
    }
  },

  createQuestion: async (input) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/questions`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create question");
    get().fetchQuestions();
  },

  updateQuestion: async (id, input) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/questions/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to update question");
    get().fetchQuestions();
  },

  archiveQuestion: async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/questions/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to archive question");
      get().fetchQuestions();
    } catch (err) {
      console.error(err);
    }
  },

  bulkUploadQuestions: async (moduleType, questions) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/questions/bulk-upload`, {
      method: "POST",
      headers,
      body: JSON.stringify({ moduleType, questions }),
    });
    if (!res.ok) throw new Error("Failed bulk uploading questions");
    get().fetchQuestions();
  },

  fetchActionQueue: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/dashboard/action-queue`, { headers });
      if (!res.ok) throw new Error("Failed to fetch action queue");
      const data = await res.json();
      set({ actionQueue: data });
    } catch (err) {
      console.error(err);
    }
  },

  fetchAuditLogs: async (query) => {
    const headers = await getAuthHeaders();
    let url = `${API_BASE}/admin/settings/audit-log?page=${query?.page || 1}&pageSize=${query?.pageSize || 20}`;
    if (query?.search) {
      url += `&search=${encodeURIComponent(query.search)}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed fetching audit logs");
    return res.json();
  },

  resultsList: [],
  currentSessionDetail: null,

  fetchResults: async (query) => {
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (query?.driveId) params.append("driveId", query.driveId);
      if (query?.status) params.append("status", query.status);
      if (query?.search) params.append("search", query.search);

      const res = await fetch(`${API_BASE}/admin/sessions?${params.toString()}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch candidate results");
      const data = await res.json();
      set({ resultsList: data.items || data || [] });
    } catch (err) {
      console.error("fetchResults error:", err);
    }
  },

  fetchSessionDetail: async (sessionId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch candidate session detail");
    const detail = await res.json();
    set({ currentSessionDetail: detail });
    return detail;
  },

  recordCandidateDecision: async (sessionId: string, decision: "PASS" | "FAIL", note?: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}/decision`, {
      method: "POST",
      headers,
      body: JSON.stringify({ decision, note }),
    });
    if (!res.ok) throw new Error("Failed to record candidate decision");
    get().fetchResults();
    get().fetchDrives();
  },

  exportResultsCsv: async (driveId?: string) => {
    const headers = await getAuthHeaders();
    const url = driveId ? `${API_BASE}/admin/drives/${driveId}/export` : `${API_BASE}/admin/dashboard/export`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to export results CSV");
    const blob = await res.blob();
    const csvUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = csvUrl;
    a.download = `candidate_results_${Date.now()}.csv`;
    a.click();
    return csvUrl;
  },
}));

// Initialize store in background
if (typeof window !== "undefined") {
  setTimeout(() => {
    useStore.getState().fetchSessions();
    useStore.getState().fetchInvites();
    useStore.getState().fetchDrives();
    useStore.getState().fetchQuestions();
    useStore.getState().fetchActionQueue();
    useStore.getState().fetchRoleTemplates();
  }, 100);
}
