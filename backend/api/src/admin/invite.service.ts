import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { CreateInviteDto, ListInvitesQueryDto } from "../common/dto/admin.dto";
import {
  InviteListItem,
  InviteListResponse,
  InviteStatus,
} from "@cd-recruit/shared-types";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) { }

  async createInvite(dto: CreateInviteDto, staffId: string) {
    const { candidateEmail, candidateName, roleTemplateId, driveId } = dto;

    const template = await this.prisma.roleTemplate.findUnique({
      where: { id: roleTemplateId },
    });

    if (!template) {
      throw new NotFoundException(
        `Role template not found with ID ${roleTemplateId}`,
      );
    }

    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundException(
        `Drive not found with ID ${driveId}`,
      );
    }

    const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    // Initial invite creation to get invite ID
    const invite = await this.prisma.invite.create({
      data: {
        candidateEmail,
        candidateName,
        roleTemplateId,
        driveId,
        createdById: staffId,
        expiresAt,
        token: `temp-${Date.now()}`, // temp placeholder before signing token
      },
    });

    // Sign actual JWT containing the invite ID
    const token = this.authService.generateInviteToken(
      invite.id,
      candidateEmail,
      candidateName,
      roleTemplateId,
    );

    // Update with real token
    const updatedInvite = await this.prisma.invite.update({
      where: { id: invite.id },
      data: { token },
      include: {
        roleTemplate: true,
        createdBy: true,
      },
    });

    const candidateAppBase = process.env.CANDIDATE_WEB_URL ?? "http://localhost:3000";
    const inviteLink = `${candidateAppBase}/invite/${token}`;

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "INVITE_CREATED",
        entityType: "Invite",
        entityId: invite.id,
        metadata: { candidateEmail, candidateName, driveId, roleTemplateId },
      },
    });

    return {
      invite: this.mapToInviteListItem(updatedInvite),
      inviteLink,
    };
  }

  async listInvites(query: ListInvitesQueryDto): Promise<InviteListResponse> {
    const { page, pageSize, status, driveId, search } = query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Auto-update expired invites on read
    await this.prisma.invite.updateMany({
      where: {
        status: InviteStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: {
        status: InviteStatus.EXPIRED,
      },
    });

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (driveId) {
      where.driveId = driveId;
    }
    if (search) {
      where.OR = [
        { candidateName: { contains: search, mode: "insensitive" } },
        { candidateEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.invite.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          roleTemplate: true,
          createdBy: true,
        },
      }),
      this.prisma.invite.count({ where }),
    ]);

    return {
      items: items.map((i) => this.mapToInviteListItem(i)),
      total,
      page,
      pageSize,
    };
  }

  async revokeInvite(
    inviteId: string,
    staffId: string,
  ): Promise<InviteListItem> {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException(`Invite not found with ID ${inviteId}`);
    }

    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException(
        `Invite is already ${invite.status} and cannot be revoked`,
      );
    }

    const updated = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        status: InviteStatus.REVOKED,
        revokedAt: new Date(),
      },
      include: {
        roleTemplate: true,
        createdBy: true,
      },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "INVITE_REVOKED",
        entityType: "Invite",
        entityId: inviteId,
        metadata: {},
      },
    });

    return this.mapToInviteListItem(updated);
  }

  async extendExpiry(
    inviteId: string,
    newExpiresAt: Date,
    staffId: string,
  ): Promise<InviteListItem> {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException(`Invite not found with ID ${inviteId}`);
    }

    const oldExpiresAt = invite.expiresAt;
    const isCurrentlyExpired = invite.status === InviteStatus.EXPIRED;
    const shouldResetToPending =
      (invite.status === InviteStatus.PENDING || isCurrentlyExpired) &&
      newExpiresAt > new Date();

    const updated = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        expiresAt: newExpiresAt,
        status: shouldResetToPending ? InviteStatus.PENDING : invite.status,
      },
      include: {
        roleTemplate: true,
        createdBy: true,
      },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "INVITE_EXPIRY_EXTENDED",
        entityType: "Invite",
        entityId: inviteId,
        metadata: { oldExpiresAt: oldExpiresAt.toISOString(), newExpiresAt: newExpiresAt.toISOString() },
      },
    });

    return this.mapToInviteListItem(updated);
  }

  async regenerateToken(
    inviteId: string,
    staffId: string,
  ): Promise<{ invite: InviteListItem; inviteLink: string }> {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException(`Invite not found with ID ${inviteId}`);
    }

    const token = this.authService.generateInviteToken(
      invite.id,
      invite.candidateEmail,
      invite.candidateName,
      invite.roleTemplateId,
    );

    const updated = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        token,
        status: InviteStatus.PENDING, // Reset if expired/revoked
      },
      include: {
        roleTemplate: true,
        createdBy: true,
      },
    });

    const candidateAppBase = process.env.CANDIDATE_WEB_URL ?? "http://localhost:3000";
    const inviteLink = `${candidateAppBase}/invite/${token}`;

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "INVITE_TOKEN_REGENERATED",
        entityType: "Invite",
        entityId: inviteId,
        metadata: {},
      },
    });

    return {
      invite: this.mapToInviteListItem(updated),
      inviteLink,
    };
  }

  async bulkRevoke(inviteIds: string[], staffId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const id of inviteIds) {
        const invite = await tx.invite.findUnique({ where: { id } });
        if (invite && invite.status === InviteStatus.PENDING) {
          await tx.invite.update({
            where: { id },
            data: {
              status: InviteStatus.REVOKED,
              revokedAt: new Date(),
            },
          });

          await tx.auditLog.create({
            data: {
              staffId,
              action: "INVITE_REVOKED",
              entityType: "Invite",
              entityId: id,
              metadata: { bulk: true },
            },
          });
        }
      }
    });
  }

  async bulkResend(inviteIds: string[], staffId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const id of inviteIds) {
        const invite = await tx.invite.findUnique({ where: { id } });
        if (invite) {
          const token = this.authService.generateInviteToken(
            invite.id,
            invite.candidateEmail,
            invite.candidateName,
            invite.roleTemplateId,
          );

          await tx.invite.update({
            where: { id },
            data: {
              token,
              status: InviteStatus.PENDING,
            },
          });

          await tx.auditLog.create({
            data: {
              staffId,
              action: "INVITE_TOKEN_REGENERATED",
              entityType: "Invite",
              entityId: id,
              metadata: { bulk: true },
            },
          });
        }
      }
    });
  }

  private mapToInviteListItem(invite: any): InviteListItem {
    return {
      id: invite.id,
      candidateEmail: invite.candidateEmail,
      candidateName: invite.candidateName,
      roleTemplateId: invite.roleTemplateId,
      roleTemplateName: invite.roleTemplate.roleName,
      status: invite.status as InviteStatus,
      token: invite.token,
      createdById: invite.createdById,
      createdByName: invite.createdBy.name,
      createdAt: invite.createdAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      redeemedAt: invite.redeemedAt ? invite.redeemedAt.toISOString() : null,
      revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
      sessionId: invite.sessionId,
    };
  }
}
