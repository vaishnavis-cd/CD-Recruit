import axios from "axios";

/**
 * Shared axios instance for all API calls.
 *
 * baseURL: Uses the Vite proxy (/api → localhost:3001) in dev so the browser
 * never makes cross-origin requests. In production, set VITE_API_BASE_URL.
 *
 * timeout: 10 000 ms — long enough for the backend to respond under normal
 * load, short enough that a hung request is surfaced before the heartbeat
 * stale threshold (45 s) fires.
 *
 * Error normalisation is handled per-call in api/session.ts rather than
 * via a global response interceptor. This keeps 409 SECOND_TAB_DETECTED
 * distinguishable from other 409s without needing to thread error codes
 * through a generic interceptor.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

export default apiClient;
