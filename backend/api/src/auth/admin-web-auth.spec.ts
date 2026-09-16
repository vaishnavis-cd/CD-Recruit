import {
  login,
  logout,
  refreshTokens,
  getStoredToken,
  getStoredRefreshToken,
  clearStoredToken,
  getUserProfile,
  isAuthenticated,
  parseJwtPayload,
} from "../../../../frontend/admin-web/src/lib/auth";

describe("Frontend Admin Auth (Phase 4)", () => {
  const mockLocalStorage: Record<string, string> = {};

  beforeAll(() => {
    // Mock localStorage and window events
    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: jest.fn(() => {
          Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
        }),
      },
      writable: true,
    });

    Object.defineProperty(global, "window", {
      value: {
        location: { pathname: "/dashboard", replace: jest.fn() },
        dispatchEvent: jest.fn(),
        atob: (str: string) => Buffer.from(str, "base64").toString("binary"),
      },
      writable: true,
    });
  });

  beforeEach(() => {
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
    jest.clearAllMocks();
  });

  describe("login()", () => {
    it("should send credentials to /auth/login and store access and refresh tokens", async () => {
      const mockLoginResponse = {
        accessToken: "header.eyJzdWIiOiJzdGFmZi0xMjMiLCJlbWFpbCI6ImFkbWluQGNkcmVjcnVpdC5sb2NhbCIsIm5hbWUiOiJBZG1pbiBVc2VyIiwicm9sZSI6IkFETUlOIiwiZXhwIjoxOTk5OTk5OTk5fQ.sig",
        refreshToken: "mock-refresh-token-12345",
        tokenType: "Bearer",
        expiresIn: 900,
        staff: {
          id: "staff-123",
          email: "admin@cdrecruit.local",
          name: "Admin User",
          role: "ADMIN" as const,
        },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockLoginResponse),
      });

      const res = await login("admin@cdrecruit.local", "AdminPassword@123");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/login"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "admin@cdrecruit.local",
            password: "AdminPassword@123",
          }),
        }),
      );

      expect(res.accessToken).toBe(mockLoginResponse.accessToken);
      expect(mockLocalStorage["admin_token"]).toBe(mockLoginResponse.accessToken);
      expect(mockLocalStorage["admin_refresh_token"]).toBe("mock-refresh-token-12345");
    });

    it("should throw error on 401 invalid credentials", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Invalid email or password" }),
      });

      await expect(login("admin@cdrecruit.local", "WrongPassword")).rejects.toThrow(
        "Invalid email or password",
      );

      expect(mockLocalStorage["admin_token"]).toBeUndefined();
    });
  });

  describe("refreshTokens()", () => {
    it("should rotate refresh token and update stored tokens in localStorage", async () => {
      mockLocalStorage["admin_refresh_token"] = "old-refresh-token";

      const mockRefreshResponse = {
        accessToken: "new.access.token",
        refreshToken: "new-rotated-refresh-token",
        tokenType: "Bearer",
        expiresIn: 900,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRefreshResponse),
      });

      const newAccess = await refreshTokens();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/refresh"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: "old-refresh-token" }),
        }),
      );

      expect(newAccess).toBe("new.access.token");
      expect(mockLocalStorage["admin_token"]).toBe("new.access.token");
      expect(mockLocalStorage["admin_refresh_token"]).toBe("new-rotated-refresh-token");
    });

    it("should clear stored tokens if refresh fails", async () => {
      mockLocalStorage["admin_token"] = "expired-token";
      mockLocalStorage["admin_refresh_token"] = "invalid-refresh-token";

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: "Invalid or expired refresh token" }),
      });

      const result = await refreshTokens();

      expect(result).toBeNull();
      expect(mockLocalStorage["admin_token"]).toBeUndefined();
      expect(mockLocalStorage["admin_refresh_token"]).toBeUndefined();
    });
  });

  describe("logout()", () => {
    it("should send logout request and clear tokens from storage", async () => {
      mockLocalStorage["admin_token"] = "current-access-token";
      mockLocalStorage["admin_refresh_token"] = "current-refresh-token";

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true }),
      });

      await logout();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/logout"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refreshToken: "current-refresh-token" }),
        }),
      );

      expect(mockLocalStorage["admin_token"]).toBeUndefined();
      expect(mockLocalStorage["admin_refresh_token"]).toBeUndefined();
    });
  });

  describe("getUserProfile() and isAuthenticated()", () => {
    it("should parse role and user details from stored JWT", () => {
      const payload = {
        sub: "staff-uuid-456",
        email: "recruiter@cdrecruit.local",
        name: "Alice Recruiter",
        role: "RECRUITER",
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
      const fakeToken = `header.${b64Payload}.sig`;

      mockLocalStorage["admin_token"] = fakeToken;

      const profile = getUserProfile();
      expect(profile).toEqual({
        sub: "staff-uuid-456",
        email: "recruiter@cdrecruit.local",
        name: "Alice Recruiter",
        username: "recruiter@cdrecruit.local",
        role: "RECRUITER",
      });

      expect(isAuthenticated()).toBe(true);
    });
  });
});
