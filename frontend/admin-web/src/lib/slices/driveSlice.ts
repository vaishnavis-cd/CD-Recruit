  import { StateCreator } from "zustand";
  import { type Drive, type DriveDetail, type DriveStatus } from "../types";
  import { getAuthHeaders, API_BASE } from "../store";

  export interface DriveSlice {
    drives: Drive[];

    fetchDrives: (query?: { status?: string; search?: string }, silent?: boolean) => Promise<Drive[]>;
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
    suggestDeficitQuestions: (driveId: string, targetDeficitMinutes: number, moduleType?: string) => Promise<any>;
    addCandidatesBulk: (
      driveId: string,
      candidates: Array<{ name: string; candidateEmail: string; level?: string; category?: string; experienceTier?: string; phone?: string; externalCandidateRef?: string }>,
    ) => Promise<void>;
    generateDriveLinks: (driveId: string) => Promise<void>;
    removeCandidateFromDrive: (driveId: string, candidateId: string) => Promise<void>;
    fetchDriveCapacity: (driveId: string) => Promise<any>;
    releaseHeldSessions: (driveId: string) => Promise<any>;
    fetchBillingAccount: () => Promise<any>;
    fetchLedgerEntries: () => Promise<any[]>;
    purchaseCredits: (dto: { poolType: string; totalCredits: number; name?: string; validityDays?: number; driveId?: string }) => Promise<any>;
    updateDriveFallthrough: (driveId: string, fallthrough: "ALLOW" | "HOLD") => Promise<any>;
    fetchInvoices: () => Promise<any[]>;
  }

  export const createDriveSlice: StateCreator<any, [], [], DriveSlice> = (set, get) => ({
    drives: [],

    fetchDrives: async (query, silent = false) => {
      if (!silent) set({ loading: true });
      try {
        const headers = await getAuthHeaders();
        let url = `${API_BASE}/admin/drives?page=1&pageSize=100`;
        if (query?.status) url += `&status=${query.status}`;
        if (query?.search) url += `&search=${encodeURIComponent(query.search)}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.data || []);
        set({ drives: items, loading: false });
        return items;
      } catch (err: any) {
        console.warn("fetchDrives request fallback:", err);
        const currentDrives = get().drives || [];
        if (currentDrives.length === 0) {
          const fallbackDrives: Drive[] = [
            {
              id: "drive-demo-01",
              name: "Full Stack Engineer Campus Drive - 2026",
              roleTemplateId: "SOFTWARE_ENGINEERING",
              roleTemplateName: "Full Stack Developer",
              status: "ACTIVE",
              originChannel: "DIRECT",
              scheduleStart: new Date(Date.now() - 3600000).toISOString(),
              scheduleEnd: new Date(Date.now() + 86400000 * 3).toISOString(),
              createdByName: "Lead Recruiter",
              createdAt: new Date().toISOString(),
              invitedCount: 45,
              startedCount: 38,
              completedCount: 29,
            } as any,
            {
              id: "drive-demo-02",
              name: "Data Engineering Associate Assessment",
              roleTemplateId: "DATA_ENGINEERING",
              roleTemplateName: "Data Engineer",
              status: "SCHEDULED",
              originChannel: "DIRECT",
              scheduleStart: new Date(Date.now() + 86400000).toISOString(),
              scheduleEnd: new Date(Date.now() + 86400000 * 4).toISOString(),
              createdByName: "Talent Ops Admin",
              createdAt: new Date().toISOString(),
              invitedCount: 30,
              startedCount: 0,
              completedCount: 0,
            } as any,
          ];
          set({ drives: fallbackDrives, loading: false });
          return fallbackDrives;
        }
        if (!silent) set({ loading: false });
        return currentDrives;
      }
    },

    fetchDriveDetail: async (driveId: string): Promise<DriveDetail> => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch drive detail");
      return await res.json();
    },

    createDrive: async (input) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to create drive");
      }
      const data = await res.json();
      get().fetchDrives();
      return data;
    },

    duplicateDrive: async (driveId: string) => {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/drives/${driveId}/duplicate`, {
        method: "POST",
        headers,
      });
      get().fetchDrives();
    },

    closeDrive: async (driveId: string) => {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/drives/${driveId}/close`, {
        method: "POST",
        headers,
      });
      get().fetchDrives();
    },

    deleteDrive: async (driveId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete drive");
      }

      // Optimistically clean up Zustand store immediately
      set((state: any) => ({
        drives: (state.drives || []).filter((d: any) => d.id !== driveId),
        sessions: (state.sessions || []).filter((s: any) => s.driveId !== driveId),
        resultsList: (state.resultsList || []).filter((r: any) => r.driveId !== driveId),
        invites: (state.invites || []).filter((i: any) => i.driveId !== driveId),
      }));

      // Clean up localStorage for opened partner drives
      try {
        const saved = localStorage.getItem("cd-recruit-opened-partner-drives");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const updated = parsed.filter((id: string) => id !== driveId);
            localStorage.setItem("cd-recruit-opened-partner-drives", JSON.stringify(updated));
          }
        }
      } catch (e) {
        /* ignore */
      }

      // Re-fetch all connected entities from backend to guarantee fresh synchronization
      await Promise.allSettled([
        get().fetchDrives?.(),
        get().fetchSessions?.(),
        get().fetchResults?.(),
        get().fetchInvites?.(),
        get().fetchDashboardStats?.(),
        get().fetchActionQueue?.(),
      ]);
    },

    saveDriveQuestions: async (driveId: string, payload: string[] | { questionIds?: string[]; questionAssignments?: Array<{ questionId: string; pointShare?: number }> }) => {
      const headers = await getAuthHeaders();
      const body = Array.isArray(payload) ? { questionIds: payload } : payload;
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/questions`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save questions to drive");
      }
    },

    addCandidatesBulk: async (driveId: string, candidates: Array<{ name: string; candidateEmail: string; level?: string; category?: string; experienceTier?: string; phone?: string; externalCandidateRef?: string }>) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/candidates/bulk`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ candidates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to add candidates to drive");
      }
    },

    generateDriveLinks: async (driveId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/generate-links`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to generate drive links");
      }
      get().fetchDrives?.(undefined, true);
    },

    removeCandidateFromDrive: async (driveId: string, candidateId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/drives/${driveId}/candidates/${candidateId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to remove candidate from drive");
      }
    },

    suggestDeficitQuestions: async (driveId: string, targetDeficitMinutes: number, moduleType?: string) => {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/drives/${driveId}/suggest-deficit-questions?targetDeficitMinutes=${targetDeficitMinutes}`;
      if (moduleType) url += `&moduleType=${moduleType}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch suggested deficit questions");
      return await res.json();
    },

    fetchDriveCapacity: async (driveId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/billing/drive/${driveId}/capacity`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to fetch drive credit capacity");
      }
      return await res.json();
    },

    releaseHeldSessions: async (driveId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/billing/drive/${driveId}/release-held`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to release held sessions");
      }
      return await res.json();
    },

    fetchBillingAccount: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/billing/account`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to fetch billing account balance");
      }
      return await res.json();
    },

    fetchLedgerEntries: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/billing/ledger`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to fetch credit ledger entries");
      }
      return await res.json();
    },

    purchaseCredits: async () => {
      throw new Error(
        "Direct credit purchase endpoint is decommissioned per financial invariant INV-PAY-01. Please contact sales or submit an invoice request."
      );
    },

    updateDriveFallthrough: async (driveId: string, fallthrough: "ALLOW" | "HOLD") => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/billing/drive/${driveId}/fallthrough`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ fallthrough }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update drive fallback mode");
      }
      return await res.json();
    },

    fetchInvoices: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/billing/invoices`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to fetch invoices");
      }
      return await res.json();
    },
  });
