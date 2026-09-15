"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.refreshTokens = refreshTokens;
exports.logout = logout;
exports.getStoredToken = getStoredToken;
exports.getStoredRefreshToken = getStoredRefreshToken;
exports.clearStoredToken = clearStoredToken;
exports.parseJwtPayload = parseJwtPayload;
exports.getUserProfile = getUserProfile;
exports.isAuthenticated = isAuthenticated;
const API_BASE = typeof window !== "undefined" ? "/api/v1" : ((typeof process !== "undefined" && process.env?.VITE_API_BASE_URL) || "/api/v1");
async function login(email, pw) {
    const candidateUrls = [
        `${API_BASE}/auth/login`,
        "http://127.0.0.1:3001/api/v1/auth/login",
        "http://localhost:3001/api/v1/auth/login",
    ];
    let lastError = null;
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
                const data = await res.json();
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
        }
        catch (err) {
            if (err.message && (err.message.includes("Invalid email") || err.message.includes("credentials"))) {
                throw err;
            }
            lastError = err;
        }
    }
    throw lastError || new Error("Authentication failed: Unable to reach backend server.");
}
async function refreshTokens() {
    if (typeof localStorage === "undefined")
        return null;
    const refreshToken = localStorage.getItem("admin_refresh_token");
    if (!refreshToken)
        return null;
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
                const data = await res.json();
                if (data.accessToken) {
                    localStorage.setItem("admin_token", data.accessToken);
                    if (data.refreshToken) {
                        localStorage.setItem("admin_refresh_token", data.refreshToken);
                    }
                    window.dispatchEvent(new Event("admin_profile_updated"));
                    return data.accessToken;
                }
            }
        }
        catch {
        }
    }
    clearStoredToken();
    return null;
}
async function logout() {
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
            }
            catch {
            }
        }
        clearStoredToken();
    }
}
function getStoredToken() {
    if (typeof localStorage === "undefined")
        return null;
    const token = localStorage.getItem("admin_token");
    if (!token)
        return null;
    return token;
}
function getStoredRefreshToken() {
    if (typeof localStorage === "undefined")
        return null;
    return localStorage.getItem("admin_refresh_token");
}
function clearStoredToken() {
    if (typeof localStorage !== "undefined") {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_refresh_token");
        window.dispatchEvent(new Event("admin_profile_updated"));
    }
}
function parseJwtPayload(token) {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(window
            .atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join(""));
        return JSON.parse(jsonPayload);
    }
    catch {
        return null;
    }
}
function getUserProfile() {
    const token = getStoredToken();
    if (!token)
        return null;
    const payload = parseJwtPayload(token);
    if (!payload)
        return null;
    let role = "RECRUITER";
    if (payload.role) {
        role = payload.role;
    }
    else if (payload.realm_access?.roles) {
        const roles = payload.realm_access.roles.map((r) => r.toUpperCase());
        if (roles.includes("ADMIN"))
            role = "ADMIN";
        else if (roles.includes("HR_LEAD"))
            role = "HR_LEAD";
        else if (roles.includes("HR_ASSOCIATE"))
            role = "HR_ASSOCIATE";
        else if (roles.includes("REVIEWER"))
            role = "REVIEWER";
        else if (roles.includes("RECRUITER"))
            role = "RECRUITER";
    }
    return {
        sub: payload.sub || "",
        email: payload.email || payload.preferred_username || "",
        name: payload.name || payload.given_name || payload.preferred_username || (payload.email ? payload.email.split("@")[0] : "Staff Member"),
        username: payload.preferred_username || payload.email || "",
        role,
    };
}
function isAuthenticated() {
    const token = getStoredToken();
    if (!token)
        return false;
    const payload = parseJwtPayload(token);
    if (!payload || !payload.exp)
        return false;
    if (payload.exp * 1000 > Date.now())
        return true;
    const refreshToken = getStoredRefreshToken();
    return !!refreshToken;
}
//# sourceMappingURL=auth.js.map