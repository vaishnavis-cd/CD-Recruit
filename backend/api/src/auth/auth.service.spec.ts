import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword, hashToken } from "../common/utils/password.util";
import { StaffRole } from "@cd-recruit/shared-types";

describe("AuthService — Local Staff Authentication", () => {
  let authService: AuthService;
  let prismaService: any;
  let jwtService: any;

  const mockStaffId = "staff-uuid-123";
  const mockEmail = "admin@example.com";
  const mockPassword = "SecurePassword@123";
  let validPasswordHash: string;

  beforeAll(async () => {
    validPasswordHash = await hashPassword(mockPassword);
  });

  beforeEach(async () => {
    prismaService = {
      staff: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      invite: {
        findFirst: jest.fn(),
      },
      roleTemplate: {
        findFirst: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue("mock-access-token"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "app.jwtSecret") return "test-secret-key-123";
              return null;
            }),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe("loginStaff", () => {
    it("should successfully log in with valid credentials and return tokens without exposing passwordHash", async () => {
      const mockStaffRecord = {
        id: mockStaffId,
        email: mockEmail,
        name: "Admin User",
        role: StaffRole.ADMIN,
        passwordHash: validPasswordHash,
        refreshTokenHash: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };

      prismaService.staff.findUnique.mockResolvedValue(mockStaffRecord);
      prismaService.staff.update.mockResolvedValue({
        ...mockStaffRecord,
        refreshTokenHash: "hashed-token-value",
      });

      const result = await authService.loginStaff({
        email: "  ADMIN@Example.Com  ", // Test case-insensitivity and trimming
        password: mockPassword,
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe("string");
      expect(result.tokenType).toBe("Bearer");
      expect(result.expiresIn).toBe(900);
      expect(result.staff).toEqual({
        id: mockStaffId,
        email: mockEmail,
        name: "Admin User",
        role: StaffRole.ADMIN,
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      // Crucial security assertions
      expect((result as any).passwordHash).toBeUndefined();
      expect((result.staff as any).passwordHash).toBeUndefined();
      expect((result.staff as any).refreshTokenHash).toBeUndefined();

      // Ensure refreshTokenHash and 7-day refreshTokenExpiresAt were saved to database
      expect(prismaService.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockStaffId },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
            refreshTokenExpiresAt: expect.any(Date),
          }),
        }),
      );

      // Verify access token signed with 15m
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockStaffId,
          email: mockEmail,
          role: StaffRole.ADMIN,
        }),
        { expiresIn: "15m" },
      );
    });

    it("should reject login with invalid password", async () => {
      const mockStaffRecord = {
        id: mockStaffId,
        email: mockEmail,
        name: "Admin User",
        role: StaffRole.ADMIN,
        passwordHash: validPasswordHash,
      };

      prismaService.staff.findUnique.mockResolvedValue(mockStaffRecord);

      await expect(
        authService.loginStaff({
          email: mockEmail,
          password: "WrongPassword@999",
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prismaService.staff.update).not.toHaveBeenCalled();
    });

    it("should reject login for unknown user email", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);

      await expect(
        authService.loginStaff({
          email: "nonexistent@example.com",
          password: mockPassword,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should reject login for unmigrated staff who have null passwordHash", async () => {
      const mockUnmigratedStaff = {
        id: "unmigrated-id",
        email: "keycloak-only@example.com",
        name: "Keycloak User",
        role: StaffRole.RECRUITER,
        passwordHash: null, // No password hash set yet
      };

      prismaService.staff.findUnique.mockResolvedValue(mockUnmigratedStaff);

      await expect(
        authService.loginStaff({
          email: "keycloak-only@example.com",
          password: mockPassword,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("refreshStaffToken", () => {
    it("should successfully rotate refresh token and issue new token pair within 7-day lifetime", async () => {
      const initialRefreshToken = "test-raw-refresh-token-12345";
      const initialHash = hashToken(initialRefreshToken);

      const mockStaffRecord = {
        id: mockStaffId,
        email: mockEmail,
        name: "Admin User",
        role: StaffRole.ADMIN,
        refreshTokenHash: initialHash,
        refreshTokenExpiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // Valid (6 days left)
      };

      prismaService.staff.findFirst.mockResolvedValue(mockStaffRecord);
      prismaService.staff.update.mockResolvedValue({
        ...mockStaffRecord,
        refreshTokenHash: "new-hash",
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const result = await authService.refreshStaffToken({
        refreshToken: initialRefreshToken,
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toEqual(initialRefreshToken); // Rotated
      expect(result.tokenType).toBe("Bearer");
      expect(result.expiresIn).toBe(900);

      // Verify update stored the new rotated token's hash and new 7-day expiration
      expect(prismaService.staff.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockStaffId },
          data: {
            refreshTokenHash: hashToken(result.refreshToken),
            refreshTokenExpiresAt: expect.any(Date),
          },
        }),
      );

      // Verify new access token signed with 15m
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockStaffId,
          email: mockEmail,
          role: StaffRole.ADMIN,
        }),
        { expiresIn: "15m" },
      );
    });

    it("should reject and revoke refresh tokens that have exceeded the 7-day maximum lifetime", async () => {
      const expiredRefreshToken = "expired-refresh-token-99999";
      const expiredHash = hashToken(expiredRefreshToken);

      const mockStaffRecord = {
        id: mockStaffId,
        email: mockEmail,
        name: "Admin User",
        role: StaffRole.ADMIN,
        refreshTokenHash: expiredHash,
        refreshTokenExpiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      prismaService.staff.findFirst.mockResolvedValue(mockStaffRecord);

      await expect(
        authService.refreshStaffToken({
          refreshToken: expiredRefreshToken,
        }),
      ).rejects.toThrow(new UnauthorizedException("Invalid or expired refresh token"));

      // Verify expired token hash was wiped from database for security
      expect(prismaService.staff.update).toHaveBeenCalledWith({
        where: { id: mockStaffId },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
    });

    it("should reject invalid or already used refresh tokens (replay protection)", async () => {
      prismaService.staff.findFirst.mockResolvedValue(null);

      await expect(
        authService.refreshStaffToken({
          refreshToken: "invalid-or-already-used-refresh-token",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should reject empty refresh token", async () => {
      await expect(
        authService.refreshStaffToken({
          refreshToken: "",
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("logoutStaff", () => {
    it("should clear refreshTokenHash and refreshTokenExpiresAt when logging out by refreshToken", async () => {
      const rawRefreshToken = "logout-refresh-token";
      const expectedHash = hashToken(rawRefreshToken);

      prismaService.staff.updateMany.mockResolvedValue({ count: 1 });

      const result = await authService.logoutStaff({
        refreshToken: rawRefreshToken,
      });

      expect(result).toEqual({ ok: true, message: "Logged out successfully" });
      expect(prismaService.staff.updateMany).toHaveBeenCalledWith({
        where: { refreshTokenHash: expectedHash },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
    });

    it("should clear refreshTokenHash and refreshTokenExpiresAt when logging out by staffId", async () => {
      prismaService.staff.updateMany.mockResolvedValue({ count: 1 });

      const result = await authService.logoutStaff({}, mockStaffId);

      expect(result).toEqual({ ok: true, message: "Logged out successfully" });
      expect(prismaService.staff.updateMany).toHaveBeenCalledWith({
        where: { id: mockStaffId },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
    });
  });
});

