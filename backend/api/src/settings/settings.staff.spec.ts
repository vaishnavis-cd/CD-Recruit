import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { verifyPassword } from "../common/utils/password.util";
import { StaffRole } from "@cd-recruit/shared-types";

describe("SettingsService — Staff Management (Phase 6A Decommissioned Keycloak)", () => {
  let settingsService: SettingsService;
  let prismaService: any;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    settingsService = module.get<SettingsService>(SettingsService);
  });

  describe("Staff Creation (createStaff)", () => {
    it("should hash password with scrypt, persist passwordHash locally, and return sanitized staff", async () => {
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
      expect((result as any).passwordHash).toBeUndefined();
      expect((result as any).refreshTokenHash).toBeUndefined();

      // Verify audit log creation
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "STAFF_CREATED",
          entityType: "Staff",
        }),
      });
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
  });

  describe("Staff Password Reset (resetStaffPassword)", () => {
    it("should hash new password, update passwordHash, invalidate refresh token, and NEVER return plaintext password", async () => {
      const existingStaff = {
        id: "staff-reset-1",
        email: "alice@company.com",
        name: "Alice Recruiter",
        role: StaffRole.RECRUITER,
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
          refreshTokenExpiresAt: null,
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
        message: "Password successfully reset in PostgreSQL.",
      });

      // Verify audit log
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "STAFF_PASSWORD_RESET",
          entityType: "Staff",
          entityId: "staff-reset-1",
        }),
      });
    });

    it("should generate a secure random password if omitted", async () => {
      const existingStaff = {
        id: "staff-reset-2",
        email: "bob@company.com",
        name: "Bob Evaluator",
        role: StaffRole.REVIEWER,
        passwordHash: null,
        refreshTokenHash: null,
      };

      prismaService.staff.findUnique.mockResolvedValue(existingStaff);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

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

  describe("Staff Deletion (deleteStaff)", () => {
    it("should delete staff from PostgreSQL and log audit event", async () => {
      const staffToDelete = {
        id: "staff-delete-1",
        name: "Delete Me",
        email: "delete@company.com",
        role: StaffRole.RECRUITER,
      };

      prismaService.staff.findUnique.mockResolvedValue(staffToDelete);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });
      prismaService.staff.delete.mockResolvedValue(staffToDelete);

      const result = await settingsService.deleteStaff("staff-delete-1", mockActor);

      expect(result).toEqual({ success: true });
      expect(prismaService.staff.delete).toHaveBeenCalledWith({
        where: { id: "staff-delete-1" },
      });
      expect(prismaService.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "STAFF_DELETED",
          entityType: "Staff",
          entityId: "staff-delete-1",
        }),
      });
    });

    it("should throw NotFoundException when trying to delete non-existent staff", async () => {
      prismaService.staff.findUnique.mockResolvedValue(null);
      prismaService.staff.findFirst.mockResolvedValue({ id: "admin-actor-uuid" });

      await expect(
        settingsService.deleteStaff("non-existent-id", mockActor),
      ).rejects.toThrow(NotFoundException);

      expect(prismaService.staff.delete).not.toHaveBeenCalled();
    });
  });
});
