import { create } from "zustand";
import { type SessionSlice, createSessionSlice } from "./slices/sessionSlice";
import { type InviteSlice, createInviteSlice } from "./slices/inviteSlice";
import { type DriveSlice, createDriveSlice } from "./slices/driveSlice";
import { type QuestionSlice, createQuestionSlice } from "./slices/questionSlice";
import { type CommonSlice, createCommonSlice } from "./slices/commonSlice";
import { clearStoredToken, getStoredToken, refreshTokens } from "./auth";

export const API_BASE = typeof window !== "undefined" ? "/api/v1" : ((typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) || "/api/v1");

// Global fetch interceptor to handle 401 errors by refreshing token and retrying once
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  let isRefreshing = false;
  let refreshSubscribers: Array<(token: string | null) => void> = [];

  const subscribeTokenRefresh = (cb: (token: string | null) => void) => {
    refreshSubscribers.push(cb);
  };

  const onRefreshed = (token: string | null) => {
    refreshSubscribers.forEach((cb) => cb(token));
    refreshSubscribers = [];
  };

  window.fetch = async function (url: RequestInfo | URL, options?: RequestInit) {
    const urlStr = typeof url === "string" ? url : (url as URL).toString();
    const isAuthEndpoint =
      urlStr.includes("/auth/login") ||
      urlStr.includes("/auth/refresh") ||
      urlStr.includes("/auth/logout");

    const res = await originalFetch(url, options);

    // If 401 and not an auth endpoint, attempt token refresh and retry original request once
    if (res.status === 401 && !isAuthEndpoint && (urlStr.startsWith(API_BASE) || urlStr.includes("/api/v1"))) {
      if (!isRefreshing) {
        isRefreshing = true;
        const newToken = await refreshTokens();
        isRefreshing = false;
        onRefreshed(newToken);

        if (newToken) {
          // Retry the original request with the new access token
          const newHeaders = new Headers(options?.headers || {});
          newHeaders.set("Authorization", `Bearer ${newToken}`);
          return originalFetch(url, {
            ...options,
            headers: newHeaders,
          });
        } else {
          clearStoredToken();
          if (window.location.pathname !== "/login") {
            window.location.replace("/login");
          }
          return res;
        }
      } else {
        // Queue concurrent requests behind the active refresh operation
        return new Promise<Response>((resolve) => {
          subscribeTokenRefresh(async (newToken) => {
            if (newToken) {
              const newHeaders = new Headers(options?.headers || {});
              newHeaders.set("Authorization", `Bearer ${newToken}`);
              resolve(originalFetch(url, { ...options, headers: newHeaders }));
            } else {
              resolve(res);
            }
          });
        });
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
