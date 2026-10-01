import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import {
  hashPassword,
  validatePasswordPolicy,
} from '../../common/utils/password.util';
import {
  ListPlatformStaffQueryDto,
  ListPlatformStaffResponseDto,
  PlatformStaffListItemDto,
  CreatePlatformStaffDto,
  UpdateStaffRoleDto,
  StaffActionReasonDto,
  ResetStaffPasswordDto,
  StaffOptionDto,
} from './dto/platform-staff.dto';

@Injectable()
export class PlatformStaffService {
  private readonly logger = new Logger(PlatformStaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: PlatformAuditService,
  ) {}

  /**
   * PII-restricted, paginated list of staff members for OWNER admin.
   */
  async listStaff(query: ListPlatformStaffQueryDto): Promise<ListPlatformStaffResponseDto> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [total, staffRows] = await Promise.all([
      this.prisma.platformStaff.count({ where }),
      this.prisma.platformStaff.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          mfaEnabled: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
    ]);

    const data: PlatformStaffListItemDto[] = staffRows.map((s) => ({
      id: s.id,
      fullName: s.name,
      email: s.email,
      role: s.role as PlatformStaffRole,
      status: s.status,
      mfaEnabled: s.mfaEnabled,
      mustChangePassword: s.mustChangePassword,
      lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    }));

    return {
      data,
      items: data,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Creates a new ACTIVE platform staff member with forced initial password change.
   */
  async createStaff(
    dto: CreatePlatformStaffDto,
    actor: { id: string; role: string },
  ): Promise<PlatformStaffListItemDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check unique email case-insensitive
    const existing = await this.prisma.platformStaff.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'STAFF_EMAIL_TAKEN',
      });
    }

    // Validate initial password policy
    const policyResult = validatePasswordPolicy(dto.initialPassword, normalizedEmail);
    if (!policyResult.valid) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: policyResult.error || 'Password does not meet security requirements',
      });
    }

    const passwordHash = await hashPassword(dto.initialPassword);

    const staff = await this.prisma.platformStaff.create({
      data: {
        email: normalizedEmail,
        name: dto.fullName.trim(),
        role: dto.role,
        status: 'ACTIVE',
        isActive: true,
        passwordHash,
        mfaEnabled: false,
        mustChangePassword: true,
        tokenVersion: 0,
        createdById: actor.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        mfaEnabled: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    // Record audit without email in payloads or secrets
    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'STAFF',
      subjectId: staff.id,
      action: 'STAFF_CREATED',
      after: {
        id: staff.id,
        role: staff.role,
        status: staff.status,
      },
      reason: 'Staff account created by platform administrator',
      executionResult: 'SUCCESS',
    });

    return {
      id: staff.id,
      fullName: staff.name,
      email: staff.email,
      role: staff.role as PlatformStaffRole,
      status: staff.status,
      mfaEnabled: staff.mfaEnabled,
      mustChangePassword: staff.mustChangePassword,
      lastLoginAt: null,
      createdAt: staff.createdAt.toISOString(),
    };
  }

  /**
   * Update staff role with last-owner protection and row-locking.
   */
  async updateRole(
    id: string,
    dto: UpdateStaffRoleDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; changed: boolean; role: string }> {
    if (id === actor.id) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'CANNOT_MODIFY_SELF',
      });
    }

    let beforeRole = '';
    let changed = false;

    await this.prisma.$transaction(async (tx) => {
      // 1. Lock active owners deterministically FIRST to prevent deadlocks across concurrent requests
      const ownerRows: any[] = await tx.$queryRaw`
        SELECT id
        FROM platform.platform_staff
        WHERE role = 'OWNER' AND status = 'ACTIVE' AND is_active = true
        ORDER BY id ASC
        FOR UPDATE
      `;

      // 2. Row lock on target staff
      const targetRows: any[] = await tx.$queryRaw`
        SELECT id, role, status, is_active, token_version
        FROM platform.platform_staff
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (targetRows.length === 0) {
        throw new NotFoundException('STAFF_NOT_FOUND');
      }

      const target = targetRows[0];
      beforeRole = target.role;

      if (target.role === dto.role) {
        changed = false;
        return;
      }

      // If demoting an active OWNER, verify at least 2 active owners exist
      if (target.role === 'OWNER' && dto.role !== 'OWNER') {
        if (ownerRows.length <= 1) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'LAST_OWNER',
          });
        }
      }

      await tx.platformStaff.update({
        where: { id },
        data: {
          role: dto.role,
          tokenVersion: { increment: 1 },
        },
      });

      changed = true;
    });

    if (changed) {
      await this.auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: 'STAFF',
        subjectId: id,
        action: 'STAFF_ROLE_CHANGED',
        before: { role: beforeRole },
        after: { role: dto.role },
        reason: dto.reason,
        executionResult: 'SUCCESS',
      });
    }

    return {
      success: true,
      changed,
      role: dto.role,
    };
  }

  /**
   * Deactivate staff account with last-owner protection.
   */
  async deactivateStaff(
    id: string,
    dto: StaffActionReasonDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; changed: boolean; status: string }> {
    if (id === actor.id) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'CANNOT_MODIFY_SELF',
      });
    }

    let changed = false;

    await this.prisma.$transaction(async (tx) => {
      // 1. Lock active owners deterministically FIRST to prevent deadlocks across concurrent requests
      const ownerRows: any[] = await tx.$queryRaw`
        SELECT id
        FROM platform.platform_staff
        WHERE role = 'OWNER' AND status = 'ACTIVE' AND is_active = true
        ORDER BY id ASC
        FOR UPDATE
      `;

      // 2. Lock target staff
      const targetRows: any[] = await tx.$queryRaw`
        SELECT id, role, status, is_active
        FROM platform.platform_staff
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (targetRows.length === 0) {
        throw new NotFoundException('STAFF_NOT_FOUND');
      }

      const target = targetRows[0];

      if (target.status === 'INACTIVE' || !target.is_active) {
        changed = false;
        return;
      }

      // Check last active owner constraint
      if (target.role === 'OWNER') {
        if (ownerRows.length <= 1) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            message: 'LAST_OWNER',
          });
        }
      }

      await tx.platformStaff.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          isActive: false,
          deactivatedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });

      changed = true;
    });

    if (changed) {
      await this.auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: 'STAFF',
        subjectId: id,
        action: 'STAFF_DEACTIVATED',
        before: { status: 'ACTIVE' },
        after: { status: 'INACTIVE' },
        reason: dto.reason,
        executionResult: 'SUCCESS',
      });
    }

    return {
      success: true,
      changed,
      status: 'INACTIVE',
    };
  }

  /**
   * Reactivate an INACTIVE staff account.
   */
  async reactivateStaff(
    id: string,
    dto: StaffActionReasonDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; changed: boolean; status: string }> {
    let changed = false;

    await this.prisma.$transaction(async (tx) => {
      const targetRows: any[] = await tx.$queryRaw`
        SELECT id, role, status, is_active
        FROM platform.platform_staff
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (targetRows.length === 0) {
        throw new NotFoundException('STAFF_NOT_FOUND');
      }

      const target = targetRows[0];

      if (target.status === 'ACTIVE' && target.is_active) {
        changed = false;
        return;
      }

      await tx.platformStaff.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          isActive: true,
          deactivatedAt: null,
          tokenVersion: { increment: 1 },
        },
      });

      changed = true;
    });

    if (changed) {
      await this.auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: 'STAFF',
        subjectId: id,
        action: 'STAFF_REACTIVATED',
        before: { status: 'INACTIVE' },
        after: { status: 'ACTIVE' },
        reason: dto.reason,
        executionResult: 'SUCCESS',
      });
    }

    return {
      success: true,
      changed,
      status: 'ACTIVE',
    };
  }

  /**
   * Reset TOTP MFA for a staff member and invalidate active sessions.
   */
  async resetMfa(
    id: string,
    dto: StaffActionReasonDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; message: string }> {
    if (id === actor.id) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'CANNOT_MODIFY_SELF',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const targetRows: any[] = await tx.$queryRaw`
        SELECT id
        FROM platform.platform_staff
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (targetRows.length === 0) {
        throw new NotFoundException('STAFF_NOT_FOUND');
      }

      await tx.platformStaff.update({
        where: { id },
        data: {
          totpSecretEncrypted: null,
          mfaEnabled: false,
          tokenVersion: { increment: 1 },
        },
      });
    });

    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'STAFF',
      subjectId: id,
      action: 'STAFF_MFA_RESET',
      reason: dto.reason,
      executionResult: 'SUCCESS',
    });

    return {
      success: true,
      message: 'MFA configuration reset successfully',
    };
  }

  /**
   * Reset staff password and require change on next login.
   */
  async resetPassword(
    id: string,
    dto: ResetStaffPasswordDto,
    actor: { id: string; role: string },
  ): Promise<{ success: boolean; message: string }> {
    if (id === actor.id) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'CANNOT_MODIFY_SELF',
      });
    }

    let targetEmail = '';

    await this.prisma.$transaction(async (tx) => {
      const targetRows: any[] = await tx.$queryRaw`
        SELECT id, email
        FROM platform.platform_staff
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (targetRows.length === 0) {
        throw new NotFoundException('STAFF_NOT_FOUND');
      }

      targetEmail = targetRows[0].email;

      const policyResult = validatePasswordPolicy(dto.newTemporaryPassword, targetEmail);
      if (!policyResult.valid) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: policyResult.error || 'Password does not meet security requirements',
        });
      }

      const passwordHash = await hashPassword(dto.newTemporaryPassword);

      await tx.platformStaff.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          tokenVersion: { increment: 1 },
        },
      });
    });

    // Record audit: NEVER include the temporary password or email in before/after!
    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'STAFF',
      subjectId: id,
      action: 'STAFF_PASSWORD_RESET',
      reason: dto.reason,
      executionResult: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Staff password reset successfully',
    };
  }

  /**
   * Returns active staff options for dropdowns (Zero email fields).
   * Accessible by OWNER, FINANCE, SUPPORT.
   */
  async getStaffOptions(): Promise<StaffOptionDto[]> {
    const staff = await this.prisma.platformStaff.findMany({
      where: {
        status: 'ACTIVE',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    return staff.map((s) => ({
      id: s.id,
      fullName: s.name,
      role: s.role,
    }));
  }
}
