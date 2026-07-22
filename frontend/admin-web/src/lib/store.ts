import { create } from "zustand";
import { type SessionSlice, createSessionSlice } from "./slices/sessionSlice";
import { type InviteSlice, createInviteSlice } from "./slices/inviteSlice";
import { type DriveSlice, createDriveSlice } from "./slices/driveSlice";
import { type QuestionSlice, createQuestionSlice } from "./slices/questionSlice";
import { type CommonSlice, createCommonSlice } from "./slices/commonSlice";
import { clearStoredToken, getStoredToken } from "./auth";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1";

// Global fetch interceptor to handle 401 errors by clearing token and redirecting to login
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = async function (url: RequestInfo | URL, options?: RequestInit) {
    const res = await originalFetch(url, options);
    if (res.status === 401) {
      const urlStr = typeof url === "string" ? url : (url as URL).toString();
      if (urlStr.startsWith(API_BASE)) {
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
  const token = getStoredToken();
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
