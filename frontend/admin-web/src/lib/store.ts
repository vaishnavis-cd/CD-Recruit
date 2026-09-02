import { create } from "zustand";
import { type SessionSlice, createSessionSlice } from "./slices/sessionSlice";
import { type InviteSlice, createInviteSlice } from "./slices/inviteSlice";
import { type DriveSlice, createDriveSlice } from "./slices/driveSlice";
import { type QuestionSlice, createQuestionSlice } from "./slices/questionSlice";
import { type CommonSlice, createCommonSlice } from "./slices/commonSlice";
import { clearStoredToken, getStoredToken } from "./auth";

export const API_BASE = typeof window !== "undefined" ? "/api/v1" : (import.meta.env.VITE_API_BASE_URL ?? "/api/v1");

// Global fetch interceptor to handle 401 errors by clearing token and redirecting to login
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = async function (url: RequestInfo | URL, options?: RequestInit) {
    const res = await originalFetch(url, options);
    if (res.status === 401) {
      const urlStr = typeof url === "string" ? url : (url as URL).toString();
      if (urlStr.startsWith(API_BASE) || urlStr.includes("/api/v1")) {
        clearStoredToken();
        if (window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
      }
    }
    return res;
  };
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") {
    return {
      Authorization: "",
      "Content-Type": "application/json",
    };
  }
  let token = getStoredToken();
  if (!token) {
    const candidateUrls = ["/api/v1", "http://127.0.0.1:3001/api/v1", "http://localhost:3001/api/v1"];
    for (const base of candidateUrls) {
      try {
        const res = await fetch(`${base}/auth/dev-token?role=ADMIN`);
        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            token = data.token;
            localStorage.setItem("admin_token", token || "");
            break;
          }
        }
      } catch (err) {}
    }
  }
  return {
    Authorization: token ? `Bearer ${token}` : "",
    "Content-Type": "application/json",
  };
}


export type Store = SessionSlice & InviteSlice & DriveSlice & QuestionSlice & CommonSlice;

export const useStore = create<Store>((...a) => ({
  ...createSessionSlice(...a),
  ...createInviteSlice(...a),
  ...createDriveSlice(...a),
  ...createQuestionSlice(...a),
  ...createCommonSlice(...a),
}));
