import { StateCreator } from "zustand";
import { type RoleTemplate } from "../types";
import { type ActionQueue, type AuditLog } from "../types";
import { getAuthHeaders, API_BASE } from "../store";

export interface CommonSlice {
  actionQueue: ActionQueue | null;
  loading: boolean;
  error: string | null;
  roleTemplates: RoleTemplate[];

  fetchRoleTemplates: () => Promise<void>;
  fetchActionQueue: () => Promise<void>;
  fetchAuditLogs: (query?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) => Promise<{ items: AuditLog[]; total: number }>;
}

export const createCommonSlice: StateCreator<any, [], [], CommonSlice> = (set, get) => ({
  actionQueue: null,
  loading: false,
  error: null,
  roleTemplates: [],

  fetchRoleTemplates: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/role-templates`, { headers });
      if (!res.ok) throw new Error("Failed to fetch role templates");
      const data = await res.json();
      set({ roleTemplates: data });
    } catch (err: any) {
      console.error(err);
    }
  },

  fetchActionQueue: async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/admin/dashboard/action-queue`, { headers });
      if (!res.ok) throw new Error("Failed to fetch action queue");
      const data = await res.json();
      set({ actionQueue: data });
    } catch (err: any) {
      console.error(err);
    }
  },

  fetchAuditLogs: async (query) => {
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/audit-logs?page=${query?.page || 1}&pageSize=${query?.pageSize || 10}`;
      if (query?.search) url += `&search=${encodeURIComponent(query.search)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return await res.json();
    } catch (err: any) {
      console.error(err);
      return { items: [], total: 0 };
    }
  },
});
