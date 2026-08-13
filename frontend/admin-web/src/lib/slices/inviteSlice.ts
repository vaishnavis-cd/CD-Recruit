import { StateCreator } from "zustand";
import { type Invite, type RoleTemplate } from "../types";
import { getAuthHeaders, API_BASE } from "../store";

export interface InviteSlice {
  invites: Invite[];

  fetchInvites: (query?: { driveId?: string; search?: string; status?: string }) => Promise<void>;
  createInvite: (input: {
    candidateName: string;
    candidateEmail: string;
    roleTemplate: RoleTemplate;
    driveId: string;
  }) => Promise<Invite>;
  uploadIdProof: (id: string, file: File) => Promise<{ inviteId: string; status: string }>;
  revokeInvite: (id: string) => Promise<void>;
  deleteInvite: (id: string) => Promise<void>;
  extendExpiry: (id: string, newExpiresAt: string) => Promise<void>;
  regenerateToken: (id: string) => Promise<string>;
  bulkRevoke: (ids: string[]) => Promise<void>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkResend: (ids: string[]) => Promise<void>;
}

const CANDIDATE_BASE_URL = (import.meta as any).env?.VITE_CANDIDATE_URL || "http://localhost:5173";

function mapBackendInvite(invite: any): Invite {
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
    link: invite.token
      ? `${CANDIDATE_BASE_URL}/start?token=${invite.token}`
      : "",
    createdAt: invite.createdAt
      ? invite.createdAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    expiresAt: invite.expiresAt || new Date().toISOString(),
    idProofRef: invite.idProofRef || null,
    idProofUploadedAt: invite.idProofUploadedAt || null,
  };
}

export const createInviteSlice: StateCreator<any, [], [], InviteSlice> = (set, get) => ({
  invites: [],

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

  createInvite: async (input) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          candidateName: input.candidateName,
          candidateEmail: input.candidateEmail,
          roleTemplateId: input.roleTemplate.id,
          driveId: input.driveId,
        }),
      });
      if (!res.ok) throw new Error("Failed to create invite");
      const data = await res.json();
      const newInvite = mapBackendInvite(data.invite);
      set((state: any) => ({ invites: [newInvite, ...state.invites] }));
      return newInvite;
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  },

  uploadIdProof: async (id, file) => {
    try {
      const headers = await getAuthHeaders();
      const uploadHeaders: Record<string, string> = { ...headers };
      delete uploadHeaders["Content-Type"];

      const formData = new FormData();
      formData.append("file", file, file.name);

      const res = await fetch(`${API_BASE}/admin/invites/${id}/id-proof`, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (!res.ok) {
        let errorMsg = `Upload failed with status ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.message) {
            errorMsg = Array.isArray(errData.message)
              ? errData.message.join(", ")
              : errData.message;
          }
        } catch (_) {}
        if (res.status === 422 || errorMsg.includes("No face detected")) {
          errorMsg = "No face detected in this photo — please upload a clearer image";
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      set((state: any) => ({
        invites: state.invites.map((i: any) =>
          i.id === id ? { ...i, idProofRef: "enrolled", idProofUploadedAt: new Date().toISOString() } : i,
        ),
      }));
      return data;
    } catch (err: any) {
      console.error("[uploadIdProof] Error uploading ID proof:", err);
      throw err;
    }
  },

  revokeInvite: async (id) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/invites/${id}/revoke`, { method: "POST", headers });
      set((state: any) => ({
        invites: state.invites.map((i: any) => (i.id === id ? { ...i, status: "REVOKED" } : i)),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  deleteInvite: async (id) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/invites/${id}`, { method: "DELETE", headers });
      set((state: any) => ({
        invites: state.invites.filter((i: any) => i.id !== id),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  extendExpiry: async (id, newExpiresAt) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/invites/${id}/extend`, {
        method: "POST",
        headers,
        body: JSON.stringify({ expiresAt: newExpiresAt }),
      });
      set((state: any) => ({
        invites: state.invites.map((i: any) =>
          i.id === id ? { ...i, expiresAt: newExpiresAt } : i,
        ),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  regenerateToken: async (id) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/invites/${id}/resend`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      set((state: any) => ({
        invites: state.invites.map((i: any) =>
          i.id === id ? mapBackendInvite(data.invite) : i,
        ),
      }));
      return data.inviteLink;
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  },

  bulkRevoke: async (ids) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/invites/bulk-revoke`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteIds: ids }),
      });
      set((state: any) => ({
        invites: state.invites.map((i: any) =>
          ids.includes(i.id) ? { ...i, status: "REVOKED" } : i,
        ),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  bulkDelete: async (ids) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/invites/bulk-delete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteIds: ids }),
      });
      set((state: any) => ({
        invites: state.invites.filter((i: any) => !ids.includes(i.id)),
      }));
    } catch (err) {
      console.error(err);
    }
  },

  bulkResend: async (ids) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE}/admin/invites/bulk-resend`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteIds: ids }),
      });
      get().fetchInvites();
    } catch (err) {
      console.error(err);
    }
  },
});
