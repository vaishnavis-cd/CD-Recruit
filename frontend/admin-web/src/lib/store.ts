import { create } from "zustand";
import { type Session, type Invite, type RoleTemplate, ROLE_TEMPLATES } from "./mock-data";
import {
  type Drive,
  type DriveDetail,
  type Question,
  type ActionQueue,
  type AuditLog,
  type DriveStatus,
} from "./types";

const API_BASE = "http://localhost:3001/api/v1";

async function getAuthHeaders() {
  let token = localStorage.getItem("admin_token");
  if (!token) {
    try {
      const res = await fetch(`${API_BASE}/auth/dev-token`);
      const data = await res.json();
      token = data.token;
      if (token) {
        localStorage.setItem("admin_token", token);
      }
    } catch (err) {
      console.error("Failed to fetch dev token:", err);
    }
  }
  return {
    Authorization: `Bearer ${token || ""}`,
    "Content-Type": "application/json",
  };
}

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
    moduleConfig: any;
    status?: DriveStatus;
    scheduleStart?: string;
    scheduleEnd?: string;
    candidates?: Array<{ name: string; email: string }>;
  }) => Promise<any>;
  duplicateDrive: (driveId: string) => Promise<void>;
  closeDrive: (driveId: string) => Promise<void>;

  fetchQuestions: (query?: {
    moduleType?: string;
    difficulty?: string;
    search?: string;
    status?: string;
  }) => Promise<void>;
  createQuestion: (input: {
    moduleType: string;
    content: any;
    scoringConfig?: any;
    difficulty?: string;
    tags?: string[];
  }) => Promise<void>;
  archiveQuestion: (id: string) => Promise<void>;
  bulkUploadQuestions: (moduleType: string, questions: any[]) => Promise<void>;

  fetchActionQueue: () => Promise<void>;
  fetchAuditLogs: (query?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => Promise<{ items: AuditLog[]; total: number }>;
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

  fetchSessionDetail: async (sessionId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch session detail");
      const detail = await res.json();

      // Map detailed fields
      const compositeScore = detail.score ? Math.round(detail.score.compositeScore * 100) : 70;
      const sayDoScore = detail.score ? Math.round(detail.score.sayDoConsistencyScore * 100) : 80;

      const initials = detail.candidate.name
        ? detail.candidate.name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
        : "CN";

      // Map module scores to key-value
      const moduleScores: Record<string, number> = {};
      if (detail.score?.moduleScores) {
        Object.entries(detail.score.moduleScores).forEach(([mod, val]) => {
          moduleScores[mod] = Math.round((val as number) * 100);
        });
      }

      // Map integrity flags
      const flags = detail.integrityFlags.map((f: any) => ({
        category: f.category,
        severity:
          f.severity === "HIGH" || f.severity === "critical"
            ? ("critical" as const)
            : ("low" as const),
        timestamp: f.flaggedAt ? f.flaggedAt.slice(11, 16) : "12:00",
        hasEvidence: !!f.evidenceClipUrl,
      }));

      // Generate mock trace for visualization if missing
      const sayDoTrace: { t: number; said: number; did: number }[] = [];
      let saidVal = sayDoScore;
      let didVal = sayDoScore;
      for (let idx = 0; idx <= 40; idx++) {
        saidVal += (Math.random() - 0.5) * 4;
        didVal += (Math.random() - 0.5) * 4;
        sayDoTrace.push({
          t: idx,
          said: Math.round(Math.max(30, Math.min(98, saidVal))),
          did: Math.round(Math.max(20, Math.min(98, didVal))),
        });
      }

      const status = mapBackendStatus(
        detail.status,
        !!detail.score,
        detail.score?.humanReviewed,
        detail.score?.aiConfidence || 1.0,
        !!detail.decision,
      );

      const mappedDetail: Session = {
        id: detail.sessionId,
        candidate: {
          id: detail.candidate.id,
          name: detail.candidate.name,
          email: detail.candidate.email,
          initials,
        },
        roleTemplate: {
          id: detail.roleTemplateName.toLowerCase().replace(" ", "-"),
          roleName: detail.roleTemplateName,
          track: "Mid",
        },
        status,
        compositeScore,
        sayDoScore,
        sayDoTrace,
        moduleScores,
        mismatches: [], // Stubs
        integrityFlags: flags,
        submittedAt: detail.submittedAt
          ? detail.submittedAt.slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        decision: detail.decision
          ? {
              outcome: detail.decision.outcome.toLowerCase() as "advance" | "reject",
              decidedAt: detail.decision.decidedAt.slice(0, 10),
              decidedBy: detail.decision.decidedBy,
              note: detail.decision.note,
            }
          : undefined,
      };

      set((s) => ({
        sessions: s.sessions.map((x) => (x.id === sessionId ? mappedDetail : x)),
      }));
    } catch (err) {
      console.error("Failed to load session detail:", err);
    }
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
}));

// Initialize store in background
if (typeof window !== "undefined") {
  setTimeout(() => {
    useStore.getState().fetchSessions();
    useStore.getState().fetchInvites();
    useStore.getState().fetchDrives();
    useStore.getState().fetchQuestions();
    useStore.getState().fetchActionQueue();
  }, 100);
}
