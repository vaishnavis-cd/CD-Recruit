export interface StaffLoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  staff?: {
    id: string;
    email: string;
    name: string;
    role: "ADMIN" | "HR_LEAD" | "HR_ASSOCIATE" | "REVIEWER" | "RECRUITER";
    createdAt?: string;
  };
}

export interface StaffRefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface UserProfile {
  sub: string;
  email: string;
  name: string;
  username: string;
  role: "ADMIN" | "HR_LEAD" | "HR_ASSOCIATE" | "REVIEWER" | "RECRUITER";
}

const API_BASE = typeof window !== "undefined" ? "/api/v1" : ((typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) || "/api/v1");

/**
 * Local Staff Login: Authenticates with backend /auth/login, storing access and refresh tokens.
 */
export async function login(email: string, pw: string): Promise<StaffLoginResponse> {
  const candidateUrls = [
    `${API_BASE}/auth/login`,
    "http://127.0.0.1:3001/api/v1/auth/login",
    "http://localhost:3001/api/v1/auth/login",
  ];

  let lastError: Error | null = null;

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password: pw,
        }),
      });

      if (res.ok) {
        const data: StaffLoginResponse = await res.json();
        if (data.accessToken) {
          localStorage.setItem("admin_token", data.accessToken);
          if (data.refreshToken) {
            localStorage.setItem("admin_refresh_token", data.refreshToken);
          }
          window.dispatchEvent(new Event("admin_profile_updated"));
        }
        return data;
      }

      if (res.status === 401 || res.status === 400) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Invalid email or password.");
      }
    } catch (err: any) {
      if (err.message && (err.message.includes("Invalid email") || err.message.includes("credentials"))) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error("Authentication failed: Unable to reach backend server.");
}

/**
 * Backward compatibility alias for login
 */
export async function loginWithKeycloak(email: string, pw: string): Promise<any> {
  return login(email, pw);
}

/**
 * Rotates the staff refresh token and updates stored credentials in localStorage.
 */
export async function refreshTokens(): Promise<string | null> {
  if (typeof localStorage === "undefined") return null;
  const refreshToken = localStorage.getItem("admin_refresh_token");
  if (!refreshToken) return null;

  const candidateUrls = [
    `${API_BASE}/auth/refresh`,
    "http://127.0.0.1:3001/api/v1/auth/refresh",
    "http://localhost:3001/api/v1/auth/refresh",
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const data: StaffRefreshResponse = await res.json();
        if (data.accessToken) {
          localStorage.setItem("admin_token", data.accessToken);
          if (data.refreshToken) {
            localStorage.setItem("admin_refresh_token", data.refreshToken);
          }
          window.dispatchEvent(new Event("admin_profile_updated"));
          return data.accessToken;
        }
      }
    } catch {
      // Try next endpoint
    }
  }

  clearStoredToken();
  return null;
}

/**
 * Local Staff Logout: Invalidates the refresh token on the backend and clears local storage.
 */
export async function logout(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    const refreshToken = localStorage.getItem("admin_refresh_token");
    if (refreshToken) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Proceed with local cleanup regardless of network status
      }
    }
    clearStoredToken();
  }
}

export function getStoredToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem("admin_token");
  if (!token) return null;
  return token;
}

export function getStoredRefreshToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("admin_refresh_token");
}

export function clearStoredToken(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_refresh_token");
    window.dispatchEvent(new Event("admin_profile_updated"));
  }
}

export function parseJwtPayload(token: string): any {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function getUserProfile(): UserProfile | null {
  const token = getStoredToken();
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;

  let role: UserProfile["role"] = "RECRUITER";
  if (payload.role) {
    role = payload.role;
  } else if (payload.realm_access?.roles) {
    const roles: string[] = payload.realm_access.roles.map((r: string) => r.toUpperCase());
    if (roles.includes("ADMIN")) role = "ADMIN";
    else if (roles.includes("HR_LEAD")) role = "HR_LEAD";
    else if (roles.includes("HR_ASSOCIATE")) role = "HR_ASSOCIATE";
    else if (roles.includes("REVIEWER")) role = "REVIEWER";
    else if (roles.includes("RECRUITER")) role = "RECRUITER";
  }

  return {
    sub: payload.sub || "",
    email: payload.email || payload.preferred_username || "",
    name: payload.name || payload.given_name || payload.preferred_username || (payload.email ? payload.email.split("@")[0] : "Staff Member"),
    username: payload.preferred_username || payload.email || "",
    role,
  };
}

export function isAuthenticated(): boolean {
  const token = getStoredToken();
  if (!token) return false;
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return false;
  // If access token is still valid, return true
  if (payload.exp * 1000 > Date.now()) return true;
  // If access token expired but refresh token exists, consider authenticated (will refresh on request)
  const refreshToken = getStoredRefreshToken();
  return !!refreshToken;
}
