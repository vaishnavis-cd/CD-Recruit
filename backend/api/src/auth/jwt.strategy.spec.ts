import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException, ForbiddenException, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { PrismaService } from "../prisma/prisma.service";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { SettingsService } from "../settings/settings.service";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import * as jwt from "jsonwebtoken";

describe("JwtStrategy — Local & Keycloak JWT Verification (Phase 3)", () => {
  let strategy: JwtStrategy;
  let prismaService: any;
  let configService: any;
  let settingsService: any;
  let reflector: Reflector;

  const testSecret = "test-cdrecruit-jwt-secret-key-for-unit-tests-32chars";

  const mockStaff = {
    id: "staff-uuid-111",
    email: "recruiter@cdrecruit.local",
    name: "Jane Recruiter",
    role: StaffRole.RECRUITER,
  };

  const mockAdmin = {
    id: "staff-uuid-999",
    email: "admin@cdrecruit.local",
    name: "Admin Superuser",
    role: StaffRole.ADMIN,
  };

  beforeEach(async () => {
    prismaService = {
      staff: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === "app.jwtSecret") return testSecret;
        return null;
      }),
    };

    settingsService = {
      hasPermission: jest.fn().mockImplementation((role: StaffRole, perm: Permission) => {
        if (role === StaffRole.ADMIN) return true;
        if (role === StaffRole.RECRUITER && perm === Permission.DRIVE_CREATE) return true;
        return false;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        Reflector,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    reflector = module.get<Reflector>(Reflector);
  });

  describe("secretOrKeyProvider: Algorithm & Key Classification", () => {
    it("should resolve local secret for valid HS256 tokens", async () => {
      const token = jwt.sign(
        { sub: mockStaff.id, email: mockStaff.email, role: mockStaff.role },
        testSecret,
        { algorithm: "HS256", expiresIn: "15m" },
      );

      const secretOrKeyProvider = (strategy as any)._secretOrKeyProvider;
      const done = jest.fn();

      await secretOrKeyProvider(null, token, done);

      expect(done).toHaveBeenCalledWith(null, testSecret);
    });

    it("should reject tokens with unsupported algorithms (e.g. none, HS384)", async () => {
      const unsupportedToken = jwt.sign(
        { sub: mockStaff.id },
        testSecret,
        { algorithm: "HS384", expiresIn: "15m" },
      );

      const secretOrKeyProvider = (strategy as any)._secretOrKeyProvider;
      const done = jest.fn();

      await secretOrKeyProvider(null, unsupportedToken, done);

      expect(done).toHaveBeenCalledWith(expect.any(UnauthorizedException));
      const error: UnauthorizedException = done.mock.calls[0][0];
      expect(error.message).toContain("UNSUPPORTED_JWT_ALGORITHM");
    });

    it("should reject malformed tokens", async () => {
      const secretOrKeyProvider = (strategy as any)._secretOrKeyProvider;
      const done = jest.fn();

      await secretOrKeyProvider(null, "not-a-valid-jwt-token", done);

      expect(done).toHaveBeenCalledWith(expect.any(UnauthorizedException));
    });

    it("should reject RS256 token if kid is missing in header", async () => {
      // Craft RS256-like header without kid
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: "user-123" })).toString("base64url");
      const fakeToken = `${header}.${payload}.fake_sig`;

      const secretOrKeyProvider = (strategy as any)._secretOrKeyProvider;
      const done = jest.fn();

      await secretOrKeyProvider(null, fakeToken, done);

      expect(done).toHaveBeenCalledWith(expect.any(UnauthorizedException));
      const error: UnauthorizedException = done.mock.calls[0][0];
      expect(error.message).toContain("MISSING_KEYCLOAK_KID");
    });
  });

  describe("validate(): Staff Resolution & Payload Processing", () => {
    it("should validate and return user for a valid local Staff token", async () => {
      prismaService.staff.findUnique.mockResolvedValue(mockStaff);

      const result = await strategy.validate({
        sub: mockStaff.id,
        email: mockStaff.email,
        name: mockStaff.name,
        role: mockStaff.role,
      });

      expect(prismaService.staff.findUnique).toHaveBeenCalledWith({
        where: { id: mockStaff.id },
      });
      expect(result).toEqual({
        id: mockStaff.id,
        email: mockStaff.email,
        name: mockStaff.name,
        role: mockStaff.role,
      });
      expect(prismaService.staff.create).not.toHaveBeenCalled();
    });

    it("should reject with 401 Unauthorized and NOT create a staff record when sub is unknown", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);

      await expect(
        strategy.validate({
          sub: "non-existent-uuid",
          email: "unknown@company.com",
          name: "Unknown User",
          role: StaffRole.RECRUITER,
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Crucial requirement: NEVER auto-create staff for local JWTs
      expect(prismaService.staff.create).not.toHaveBeenCalled();
    });

    it("should properly assign and validate different staff roles (ADMIN, HR_LEAD, REVIEWER)", async () => {
      const hrLeadStaff = {
        id: "staff-hr-lead-1",
        email: "lead@cdrecruit.local",
        name: "HR Lead",
        role: StaffRole.HR_LEAD,
      };

      prismaService.staff.findUnique.mockResolvedValue(hrLeadStaff);

      const result = await strategy.validate({
        sub: hrLeadStaff.id,
        email: hrLeadStaff.email,
        name: hrLeadStaff.name,
        role: StaffRole.HR_LEAD,
      });

      expect(result.role).toBe(StaffRole.HR_LEAD);
    });

    it("should maintain backward-compatibility with Keycloak realm_access roles", async () => {
      const keycloakUser = {
        id: "kc-staff-uuid",
        email: "kcuser@cdrecruit.local",
        name: "Keycloak User",
        role: StaffRole.ADMIN,
      };

      prismaService.staff.findUnique.mockResolvedValue(keycloakUser);

      const result = await strategy.validate({
        sub: "kc-staff-uuid",
        email: "kcuser@cdrecruit.local",
        preferred_username: "kcuser",
        realm_access: {
          roles: ["ADMIN", "default-roles-cd-recruit"],
        },
      });

      expect(result.role).toBe(StaffRole.ADMIN);
    });
  });

  describe("RBAC Compatibility with Local JWT User", () => {
    let rolesGuard: RolesGuard;
    let permissionsGuard: PermissionsGuard;

    beforeEach(() => {
      rolesGuard = new RolesGuard(reflector);
      permissionsGuard = new PermissionsGuard(reflector, settingsService);
    });

    it("should allow ADMIN to access any role and permission protected route", () => {
      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({ user: mockAdmin }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([StaffRole.ADMIN, StaffRole.HR_LEAD]);

      expect(rolesGuard.canActivate(mockContext)).toBe(true);

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Permission.DRIVE_CREATE]);
      expect(permissionsGuard.canActivate(mockContext)).toBe(true);
    });

    it("should allow RECRUITER with required role and permission", () => {
      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({ user: mockStaff }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([StaffRole.RECRUITER]);
      expect(rolesGuard.canActivate(mockContext)).toBe(true);

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([Permission.DRIVE_CREATE]);
      expect(permissionsGuard.canActivate(mockContext)).toBe(true);
    });

    it("should forbid RECRUITER from accessing ADMIN-only route", () => {
      const mockContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({ user: mockStaff }),
        }),
      } as unknown as ExecutionContext;

      jest.spyOn(reflector, "getAllAndOverride").mockReturnValue([StaffRole.ADMIN]);
      expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });
});
