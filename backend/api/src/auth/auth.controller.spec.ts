import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { StaffRole } from "@cd-recruit/shared-types";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: any;

  beforeEach(async () => {
    authService = {
      loginStaff: jest.fn(),
      refreshStaffToken: jest.fn(),
      logoutStaff: jest.fn(),
      generateStaffToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe("POST /auth/login", () => {
    it("should delegate login to AuthService.loginStaff", async () => {
      const loginDto = { email: "admin@example.com", password: "password123" };
      const expectedResponse = {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        expiresIn: 900,
        staff: {
          id: "staff-1",
          email: "admin@example.com",
          name: "Admin",
          role: StaffRole.ADMIN,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      };

      authService.loginStaff.mockResolvedValue(expectedResponse);

      const result = await controller.login(loginDto);
      expect(result).toEqual(expectedResponse);
      expect(authService.loginStaff).toHaveBeenCalledWith(loginDto);
    });

    it("should propagate UnauthorizedException on invalid credentials", async () => {
      authService.loginStaff.mockRejectedValue(
        new UnauthorizedException("Invalid email or password"),
      );

      await expect(
        controller.login({ email: "wrong@example.com", password: "bad" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("POST /auth/refresh", () => {
    it("should delegate refresh to AuthService.refreshStaffToken", async () => {
      const refreshDto = { refreshToken: "valid-refresh-token" };
      const expectedResponse = {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        tokenType: "Bearer",
        expiresIn: 900,
      };

      authService.refreshStaffToken.mockResolvedValue(expectedResponse);

      const result = await controller.refresh(refreshDto);
      expect(result).toEqual(expectedResponse);
      expect(authService.refreshStaffToken).toHaveBeenCalledWith(refreshDto);
    });
  });

  describe("POST /auth/logout", () => {
    it("should delegate logout to AuthService.logoutStaff", async () => {
      const logoutDto = { refreshToken: "some-token" };
      const req = { user: { id: "staff-1" } };

      authService.logoutStaff.mockResolvedValue({
        ok: true,
        message: "Logged out successfully",
      });

      const result = await controller.logout(logoutDto, req);
      expect(result).toEqual({ ok: true, message: "Logged out successfully" });
      expect(authService.logoutStaff).toHaveBeenCalledWith(logoutDto, "staff-1");
    });
  });

  describe("GET /auth/dev-token", () => {
    it("should generate dev token when not in production", () => {
      delete process.env.NODE_ENV;
      authService.generateStaffToken.mockReturnValue("dev-token-abc");

      const result = controller.getDevToken({ role: StaffRole.ADMIN });
      expect(result).toEqual({ token: "dev-token-abc" });
      expect(authService.generateStaffToken).toHaveBeenCalled();
    });

    it("should reject in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      expect(() => controller.getDevToken({})).toThrow(ForbiddenException);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
