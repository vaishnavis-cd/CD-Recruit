import { StateCreator } from "zustand";
import { type Drive, type DriveDetail, type DriveStatus } from "../types";
import { getAuthHeaders, API_BASE } from "../store";

export interface DriveSlice {
  drives: Drive[];

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
  removeCandidateFromDrive: (driveId: string, candidateId: string) => Promise<void>;
}

export const createDriveSlice: StateCreator<any, [], [], DriveSlice> = (set, get) => ({
  drives: [],

  fetchDrives: async (query) => {
    set({ loading: true });
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/drives?page=1&pageSize=100`;
      if (query?.status) url += `&status=${query.status}`;
      if (query?.search) url += `&search=${encodeURIComponent(query.search)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch drives");
      const data = await res.json();
      set({ drives: data.items, loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message, loading: false });
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
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errData = await res.json();
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
    await fetch(`${API_BASE}/admin/drives/${driveId}`, {
      method: "DELETE",
      headers,
    });
    get().fetchDrives();
  },

  saveDriveQuestions: async (driveId: string, payload: string[] | { questionIds?: string[]; questionAssignments?: Array<{ questionId: string; pointShare?: number }> }) => {
    const headers = await getAuthHeaders();
    const body = Array.isArray(payload) ? { questionIds: payload } : payload;
    const res = await fetch(`${API_BASE}/admin/drives/${driveId}/questions`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to save questions to drive");
    }
  },

  addCandidatesBulk: async (driveId: string, candidates: Array<{ name: string; candidateEmail: string }>) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/drives/${driveId}/candidates/bulk`, {
      method: "POST",
      headers,
      body: JSON.stringify({ candidates }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to add candidates to drive");
    }
  },

  generateDriveLinks: async (driveId: string) => {
    const headers = await getAuthHeaders();
    await fetch(`${API_BASE}/admin/drives/${driveId}/generate-links`, {
      method: "POST",
      headers,
    });
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
});
