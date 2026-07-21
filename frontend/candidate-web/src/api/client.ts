/**
 * Shared Axios instance for the candidate-web API layer.
 *
 * Base URL: Vite's dev proxy rewrites /api → http://localhost:3001/api
 * so we use a relative base (/api/v1) in both dev and prod builds.
 *
 * All proctoring services, the coding API, and evidence upload use this client.
 */
import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  // Attach the candidate session token if present in localStorage
  // (set by InviteResolver after session start)
});

// Request interceptor — inject session JWT if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("cd-recruit-session-token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — log unexpected errors without swallowing them
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // Token expired mid-session — surface to UI but don't redirect
      console.warn("[apiClient] 401 received — session token may have expired.");
    }
    return Promise.reject(error);
  },
);

export default apiClient;
