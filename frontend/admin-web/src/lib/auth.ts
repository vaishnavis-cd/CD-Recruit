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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Login failed: ${res.status} ${errText}`);
  }

  const data: KeycloakTokenResponse = await res.json();
  setStoredToken(data.access_token);
  return data;
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

  const roles: string[] = payload.realm_access?.roles || [];
  const isAdmin = roles.some((r) => r.toLowerCase() === "admin");

  return {
    sub: payload.sub || "",
    email: payload.email || payload.preferred_username || "",
    name: payload.name || payload.given_name || payload.preferred_username || "User",
    username: payload.preferred_username || "",
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
