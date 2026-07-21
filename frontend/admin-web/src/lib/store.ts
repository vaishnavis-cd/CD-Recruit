import { create } from "zustand";
import { type SessionSlice, createSessionSlice } from "./slices/sessionSlice";
import { type InviteSlice, createInviteSlice } from "./slices/inviteSlice";
import { type DriveSlice, createDriveSlice } from "./slices/driveSlice";
import { type QuestionSlice, createQuestionSlice } from "./slices/questionSlice";
import { type CommonSlice, createCommonSlice } from "./slices/commonSlice";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";

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

let _tokenPromise: Promise<string | null> | null = null;

export type Store = SessionSlice & InviteSlice & DriveSlice & QuestionSlice & CommonSlice;

export const useStore = create<Store>((...a) => ({
  ...createSessionSlice(...a),
  ...createInviteSlice(...a),
  ...createDriveSlice(...a),
  ...createQuestionSlice(...a),
  ...createCommonSlice(...a),
}));
