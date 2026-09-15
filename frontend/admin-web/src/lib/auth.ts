export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  refresh_token?: string;
  token_type: string;
  id_token?: string;
  scope?: string;
}

export interface UserProfile {
  sub: string;
  email: string;
  name: string;
  username: string;
  role: "ADMIN" | "HR_LEAD" | "HR_ASSOCIATE" | "REVIEWER" | "RECRUITER";
}

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080";
const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || "cd-recruit";
const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "cd-recruit-frontend";

export async function loginWithKeycloak(email: string, pw: string): Promise<KeycloakTokenResponse> {
  const tokenEndpoint = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

  try {
    const body = new URLSearchParams();
    body.append("grant_type", "password");
    body.append("client_id", KEYCLOAK_CLIENT_ID);
    body.append("username", email);
    body.append("password", pw);

    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (res.ok) {
      const data: KeycloakTokenResponse = await res.json();
      if (data.access_token) {
        localStorage.setItem("admin_token", data.access_token);
        if (data.refresh_token) {
          localStorage.setItem("admin_refresh_token", data.refresh_token);
        }
      }
      return data;
    }
  } catch (keycloakErr) {
    // Keycloak unreachable (e.g. INFRA_MODE=local). Fall through to dev-token endpoint below.
  }

  // Fallback: request JWT token from NestJS backend dev endpoint
  const candidateUrls = ["/api/v1", "http://127.0.0.1:3001/api/v1", "http://localhost:3001/api/v1"];
  for (const base of candidateUrls) {
    try {
      const role = email.toLowerCase().includes("recruiter") ? "RECRUITER" : "ADMIN";
      const devRes = await fetch(`${base}/auth/dev-token?role=${role}`);
      if (devRes.ok) {
        const devData = await devRes.json();
        if (devData.token) {
          localStorage.setItem("admin_token", devData.token);
          return {
            access_token: devData.token,
            expires_in: 86400,
            token_type: "Bearer",
          };
        }
      }
    } catch (apiErr) {
      // Try next endpoint
    }
  }

  throw new Error("Authentication failed: Backend API (port 3001) is unreachable. Please ensure the backend is running.");
}



export function getStoredToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem("admin_token");
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (payload && payload.exp && payload.exp * 1000 < Date.now()) {
    console.warn("[Auth] Stored admin_token has expired. Clearing token.");
    clearStoredToken();
    return null;
  }
  return token;
}

function setStoredToken(token: string) {
  localStorage.setItem("admin_token", token);
}

export function clearStoredToken(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_refresh_token");
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
  } catch (e) {
    return null;
  }
}

export function getUserProfile(): UserProfile | null {
  const token = getStoredToken();
  if (!token) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;

  const roles: string[] = payload.realm_access?.roles || (payload.role ? [payload.role] : []);
  const isAdmin = roles.some((r) => r.toLowerCase() === "admin");

  return {
    sub: payload.sub || "",
    email: payload.email || payload.preferred_username || "",
    name: payload.name || payload.given_name || payload.preferred_username || (payload.email ? payload.email.split("@")[0] : "Demo Admin"),
    username: payload.preferred_username || payload.email || "",
    role: isAdmin ? "ADMIN" : "RECRUITER",
  };
}

export function isAuthenticated(): boolean {
  const token = getStoredToken();
  if (!token) return false;
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now();
}
