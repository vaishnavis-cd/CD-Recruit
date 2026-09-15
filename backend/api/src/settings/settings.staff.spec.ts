import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { KeycloakAdminService } from "../auth/keycloak-admin.service";
import { verifyPassword } from "../common/utils/password.util";
import { StaffRole } from "@cd-recruit/shared-types";

describe("SettingsService — Staff Password Management & Migration (Phase 2)", () => {
  let settingsService: SettingsService;
  let prismaService: any;
  let keycloakAdminService: any;

  const mockActor = { id: "admin-actor-uuid", email: "admin@cdrecruit.com" };

  beforeEach(async () => {
    prismaService = {
      staff: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-123" }),
      },
      roleTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      proctoringTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    keycloakAdminService = {
      createUser: jest.fn().mockResolvedValue({
        synced: true,
        keycloakUserId: "kc-user-123",
      }),
      resetPassword: jest.fn().mockResolvedValue(true),
      deleteUser: jest.fn().mockResolvedValue(true),
      syncAllStaff: jest.fn().mockResolvedValue({ total: 0, synced: 0, failed: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: KeycloakAdminService, useValue: keycloakAdminService },
      ],
    }).compile();

    settingsService = module.get<SettingsService>(SettingsService);
  });

  describe("Staff Creation (createStaff)", () => {
    it("should hash password with scrypt, persist passwordHash, and return sanitized staff", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

      let createdData: any = null;
      prismaService.staff.create.mockImplementation(({ data }: any) => {
        createdData = data;
        return Promise.resolve({
          id: "staff-new-1",
          name: data.name,
          email: data.email,
          role: data.role,
          keycloakUserId: data.keycloakUserId,
          passwordHash: data.passwordHash,
          refreshTokenHash: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      const rawPassword = "CustomStaffPassword@2026";
      const result = await settingsService.createStaff(
        {
          name: "Alice Recruiter",
          email: "alice@company.com",
          role: StaffRole.RECRUITER,
          tempPassword: rawPassword,
        },
        mockActor,
      );

      // Verify Prisma creation received passwordHash
      expect(prismaService.staff.create).toHaveBeenCalledTimes(1);
      expect(createdData).toBeDefined();
      expect(createdData.passwordHash).toBeDefined();
      expect(createdData.passwordHash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);

      // Verify password verification succeeds against generated passwordHash
      const isValid = await verifyPassword(rawPassword, createdData.passwordHash);
      expect(isValid).toBe(true);

      // Verify wrong password fails
      const isInvalid = await verifyPassword("WrongPassword", createdData.passwordHash);
      expect(isInvalid).toBe(false);

      // Verify returned result is sanitized (no passwordHash or refreshTokenHash)
      expect(result).toHaveProperty("id", "staff-new-1");
      expect(result).toHaveProperty("email", "alice@company.com");
      expect(result).toHaveProperty("keycloakSynced", true);
      expect((result as any).passwordHash).toBeUndefined();
      expect((result as any).refreshTokenHash).toBeUndefined();

      // Verify Keycloak synchronization was called
      expect(keycloakAdminService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "alice@company.com",
          tempPassword: rawPassword,
        }),
      );
    });

    it("should generate a unique random password per user if tempPassword is omitted", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

      const createdHashes: string[] = [];
      prismaService.staff.create.mockImplementation(({ data }: any) => {
        createdHashes.push(data.passwordHash);
        return Promise.resolve({
          id: `staff-new-${createdHashes.length}`,
          ...data,
          createdAt: new Date(),
        });
      });

      await settingsService.createStaff(
        {
          name: "Bob Evaluator",
          email: "bob@company.com",
          role: StaffRole.REVIEWER,
        },
        mockActor,
      );

      await settingsService.createStaff(
        {
          name: "Charlie Recruiter",
          email: "charlie2@company.com",
          role: StaffRole.RECRUITER,
        },
        mockActor,
      );

      expect(createdHashes.length).toBe(2);
      expect(createdHashes[0]).toBeDefined();
      expect(createdHashes[1]).toBeDefined();
      expect(createdHashes[0]).not.toEqual(createdHashes[1]);

      // Verify that the static insecure password "Password@123" is NOT used
      const isStaticDefault = await verifyPassword("Password@123", createdHashes[0]);
      expect(isStaticDefault).toBe(false);
    });

    it("should reject duplicate email before hashing or creating", async () => {
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });
      prismaService.staff.findUnique.mockResolvedValue({ id: "existing-staff-id" });

      await expect(
        settingsService.createStaff(
          {
            name: "Duplicate User",
            email: "existing@company.com",
            role: StaffRole.RECRUITER,
          },
          mockActor,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaService.staff.create).not.toHaveBeenCalled();
    });

    it("should succeed in creating local staff even if Keycloak is offline", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });
      keycloakAdminService.createUser.mockRejectedValue(new Error("Keycloak connection refused"));

      let createdData: any = null;
      prismaService.staff.create.mockImplementation(({ data }: any) => {
        createdData = data;
        return Promise.resolve({
          id: "staff-new-3",
          ...data,
          createdAt: new Date(),
        });
      });

      const result = await settingsService.createStaff(
        {
          name: "Charlie Admin",
          email: "charlie@company.com",
          role: StaffRole.ADMIN,
          tempPassword: "CharliePassword@999",
        },
        mockActor,
      );

      expect(result).toHaveProperty("id", "staff-new-3");
      expect(result.keycloakSynced).toBe(false);
      expect(createdData.passwordHash).toBeDefined();
      expect(await verifyPassword("CharliePassword@999", createdData.passwordHash)).toBe(true);
    });
  });

  describe("Staff Password Reset (resetStaffPassword)", () => {
    it("should hash new password, update passwordHash, invalidate refresh token, and NEVER return plaintext password", async () => {
      const existingStaff = {
        id: "staff-reset-1",
        email: "alice@company.com",
        name: "Alice Recruiter",
        role: StaffRole.RECRUITER,
        keycloakUserId: "kc-alice-123",
        passwordHash: "old-scrypt-hash",
        refreshTokenHash: "active-refresh-token-hash",
      };

      prismaService.staff.findUnique.mockResolvedValue(existingStaff);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

      let updatedData: any = null;
      prismaService.staff.update.mockImplementation(({ data }: any) => {
        updatedData = data;
        return Promise.resolve({ ...existingStaff, ...data });
      });

      const newPassword = "BrandNewSecurePassword@2026!";
      const response = await settingsService.resetStaffPassword(
        "staff-reset-1",
        { newPassword, temporary: false },
        mockActor,
      );

      // Verify Prisma update was called with new passwordHash and invalidated refreshTokenHash
      expect(prismaService.staff.update).toHaveBeenCalledWith({
        where: { id: "staff-reset-1" },
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/),
          refreshTokenHash: null,
        }),
      });

      // Verify the new password verifies correctly
      expect(await verifyPassword(newPassword, updatedData.passwordHash)).toBe(true);
      expect(await verifyPassword("OldPassword", updatedData.passwordHash)).toBe(false);

      // Verify response structure: newPassword is NOT in the response
      expect((response as any).newPassword).toBeUndefined();
      expect(response).toEqual({
        success: true,
        temporary: false,
        keycloakSynced: true,
        message: "Password successfully reset in PostgreSQL and Keycloak.",
      });

      // Verify Keycloak was called
      expect(keycloakAdminService.resetPassword).toHaveBeenCalledWith(
        "kc-alice-123",
        newPassword,
        false,
      );
    });

    it("should generate a secure random password and succeed even if Keycloak is offline", async () => {
      const existingStaff = {
        id: "staff-reset-2",
        email: "bob@company.com",
        name: "Bob Evaluator",
        role: StaffRole.REVIEWER,
        keycloakUserId: "kc-bob-456",
        passwordHash: null, // Unmigrated user
        refreshTokenHash: null,
      };

      prismaService.staff.findUnique.mockResolvedValue(existingStaff);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });
      keycloakAdminService.resetPassword.mockRejectedValue(new Error("Keycloak offline"));

      let updatedData: any = null;
      prismaService.staff.update.mockImplementation(({ data }: any) => {
        updatedData = data;
        return Promise.resolve({ ...existingStaff, ...data });
      });

      const response = await settingsService.resetStaffPassword(
        "staff-reset-2",
        {},
        mockActor,
      );

      expect(response.success).toBe(true);
      expect((response as any).newPassword).toBeUndefined();
      expect(response.keycloakSynced).toBe(false);
      expect(updatedData.passwordHash).toBeDefined();
      expect(updatedData.passwordHash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
    });

    it("should throw NotFoundException if staff does not exist", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

      await expect(
        settingsService.resetStaffPassword("non-existent-id", { newPassword: "password" }, mockActor),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.staff.update).not.toHaveBeenCalled();
    });
  });

  describe("Unmigrated Staff Safety & Migration Flow", () => {
    it("should allow controlled migration of an existing Keycloak user with passwordHash = null", async () => {
      // Step 1: Existing unmigrated staff in database
      const unmigratedStaff = {
        id: "legacy-staff-1",
        email: "legacy@company.com",
        name: "Legacy Staff",
        role: StaffRole.RECRUITER,
        keycloakUserId: "kc-legacy-uuid",
        passwordHash: null, // NULL in database
        refreshTokenHash: null,
      };

      prismaService.staff.findUnique.mockResolvedValue(unmigratedStaff);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

      let savedHash: string | null = null;
      prismaService.staff.update.mockImplementation(({ data }: any) => {
        savedHash = data.passwordHash;
        return Promise.resolve({ ...unmigratedStaff, ...data });
      });

      // Step 2: Admin triggers password setup/reset for the unmigrated staff
      const migrationPassword = "MigratedLocalPassword@2026!";
      const resetResult = await settingsService.resetStaffPassword(
        "legacy-staff-1",
        { newPassword: migrationPassword },
        mockActor,
      );

      expect(resetResult.success).toBe(true);
      expect(savedHash).toBeDefined();
      expect(savedHash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);

      // Step 3: Staff now has local password credentials
      expect(await verifyPassword(migrationPassword, savedHash!)).toBe(true);
    });
  });
});
