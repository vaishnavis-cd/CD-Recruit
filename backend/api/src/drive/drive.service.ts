import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpStatus,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDriveDto, UpdateDriveDto, ListDrivesQueryDto } from "../common/dto/drive.dto";
import {
  DriveStatus,
  DriveListResponse,
  DriveListItem,
  DriveDetail,
  DriveCandidateRosterItem,
} from "@cd-recruit/shared-types";
import { AppException } from "../common/filters/app-exception";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateDriveDto, staffId: string) {
    const {
      name,
      roleTemplateId,
      moduleConfig,
      status = DriveStatus.DRAFT,
      scheduleStart,
      scheduleEnd,
      candidates = [],
    } = dto;

    // 1. Verify RoleTemplate exists
    const template = await this.prisma.roleTemplate.findUnique({
      where: { id: roleTemplateId },
    });
    if (!template) {
      throw new NotFoundException(`Role template not found with ID ${roleTemplateId}`);
    }

    // 2. Validate schedule if status is SCHEDULED or ACTIVE
    if (status === DriveStatus.SCHEDULED || status === DriveStatus.ACTIVE) {
      if (!scheduleStart || !scheduleEnd) {
        throw new BadRequestException(
          "Schedule start and end dates are required when status is SCHEDULED or ACTIVE",
        );
      }
      if (new Date(scheduleStart) >= new Date(scheduleEnd)) {
        throw new BadRequestException("Schedule start date must be before end date");
      }
    }

    // 3. Completeness check
    // Check if at least one question exists in the database for each enabled module in the config
    const enabledModules = Object.entries(moduleConfig)
      .filter(([_, conf]: [string, any]) => conf.enabled)
      .map(([mod, _]) => mod);

    for (const mod of enabledModules) {
      const qCount = await this.prisma.question.count({
        where: { moduleType: mod as any, status: "PUBLISHED" },
      });
      if (qCount === 0) {
        throw new AppException(
          "INCOMPLETE_MODULE_CONFIG",
          `No published questions available for enabled module: ${mod}`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    // 4. Concurrency & system pressure warning check
    let warning: string | null = null;
    if (candidates.length > 50) {
      const start = scheduleStart ? new Date(scheduleStart).getTime() : Date.now();
      const end = scheduleEnd ? new Date(scheduleEnd).getTime() : Date.now() + 4 * 60 * 60 * 1000;
      const durationHours = (end - start) / (1000 * 60 * 60);
      if (durationHours > 0 && candidates.length / durationHours > 25) {
        warning = `High candidate concentration (${candidates.length} candidates over ${durationHours.toFixed(1)} hours). This may saturate the evaluation sandbox capacity.`;
      }
    }

    // 5. Create Drive and Roster in transaction
    const drive = await this.prisma.$transaction(async (tx) => {
      const createdDrive = await tx.drive.create({
        data: {
          name,
          roleTemplateId,
          moduleConfig,
          status: status as any,
          scheduleStart: scheduleStart ? new Date(scheduleStart) : null,
          scheduleEnd: scheduleEnd ? new Date(scheduleEnd) : null,
          createdById: staffId,
        },
      });

      // Fetch questions of the template to associate with the Drive
      // For MVP, we link all published questions of enabled modules to the Drive
      const questionsToLink = await tx.question.findMany({
        where: {
          moduleType: { in: enabledModules as any },
          status: "PUBLISHED",
        },
      });

      if (questionsToLink.length > 0) {
        await tx.driveQuestion.createMany({
          data: questionsToLink.map((q) => ({
            driveId: createdDrive.id,
            questionId: q.id,
            moduleType: q.moduleType,
          })),
        });
      }

      // Generate Invites/Roster
      if (candidates.length > 0) {
        const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + ttlHours);

        for (const cand of candidates) {
          const invite = await tx.invite.create({
            data: {
              candidateEmail: cand.candidateEmail,
              candidateName: cand.name,
              roleTemplateId,
              driveId: createdDrive.id,
              createdById: staffId,
              expiresAt,
              token: `temp-${Date.now()}-${Math.random()}`,
            },
          });

          const token = this.authService.generateInviteToken(
            invite.id,
            cand.candidateEmail,
            cand.name,
            roleTemplateId,
          );

          await tx.invite.update({
            where: { id: invite.id },
            data: { token },
          });
        }
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_CREATED",
          entityType: "Drive",
          entityId: createdDrive.id,
          metadata: { name: createdDrive.name, status: createdDrive.status },
        },
      });

      return createdDrive;
    });

    return {
      driveId: drive.id,
      name: drive.name,
      status: drive.status,
      warning,
    };
  }

  async list(query: ListDrivesQueryDto): Promise<DriveListResponse> {
    const { page, pageSize, status, search } = query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      this.prisma.drive.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          roleTemplate: true,
          createdBy: true,
          invites: {
            include: {
              session: true,
            },
          },
        },
      }),
      this.prisma.drive.count({ where }),
    ]);

    const mappedItems: DriveListItem[] = items.map((drive) => {
      const invitedCount = drive.invites.length;
      const startedCount = drive.invites.filter(
        (i) => i.session && i.session.status !== "NOT_STARTED",
      ).length;
      const completedCount = drive.invites.filter(
        (i) =>
          i.session &&
          ["SUBMITTED", "AUTO_SUBMITTED", "CLOSED"].includes(i.session.status),
      ).length;

      return {
        id: drive.id,
        name: drive.name,
        roleTemplateId: drive.roleTemplateId,
        roleTemplateName: drive.roleTemplate.roleName,
        moduleConfig: drive.moduleConfig as any,
        status: drive.status as any,
        scheduleStart: drive.scheduleStart ? drive.scheduleStart.toISOString() : null,
        scheduleEnd: drive.scheduleEnd ? drive.scheduleEnd.toISOString() : null,
        createdById: drive.createdById,
        createdByName: drive.createdBy.name,
        createdAt: drive.createdAt.toISOString(),
        invitedCount,
        startedCount,
        completedCount,
      };
    });

    return {
      items: mappedItems,
      total,
      page,
      pageSize,
    };
  }

  async findOne(driveId: string): Promise<DriveDetail> {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        roleTemplate: true,
        createdBy: true,
        invites: {
          include: {
            session: {
              include: {
                score: true,
              },
            },
          },
        },
      },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const roster: DriveCandidateRosterItem[] = drive.invites.map((invite) => {
      const inviteLink = `${process.env.VITE_API_BASE_URL.replace("/api/v1", "")}/start?token=${invite.token}`;
      const session = invite.session;

      return {
        candidateId: invite.id,
        candidateName: invite.candidateName,
        candidateEmail: invite.candidateEmail,
        inviteId: invite.id,
        inviteStatus: invite.status,
        inviteLink,
        sessionId: session?.id || null,
        sessionStatus: session?.status || null,
        compositeScore: session?.score?.compositeScore ?? null,
        submittedAt: session?.submittedAt ? session.submittedAt.toISOString() : null,
      };
    });

    const invitedCount = drive.invites.length;
    const startedCount = drive.invites.filter(
      (i) => i.session && i.session.status !== "NOT_STARTED",
    ).length;
    const completedCount = drive.invites.filter(
      (i) =>
        i.session &&
        ["SUBMITTED", "AUTO_SUBMITTED", "CLOSED"].includes(i.session.status),
    ).length;

    return {
      id: drive.id,
      name: drive.name,
      roleTemplateId: drive.roleTemplateId,
      roleTemplateName: drive.roleTemplate.roleName,
      moduleConfig: drive.moduleConfig as any,
      status: drive.status as any,
      scheduleStart: drive.scheduleStart ? drive.scheduleStart.toISOString() : null,
      scheduleEnd: drive.scheduleEnd ? drive.scheduleEnd.toISOString() : null,
      createdById: drive.createdById,
      createdByName: drive.createdBy.name,
      createdAt: drive.createdAt.toISOString(),
      roster,
      invitedCount,
      startedCount,
      completedCount,
    };
  }

  async update(driveId: string, dto: UpdateDriveDto, staffId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const inviteCount = await this.prisma.invite.count({
      where: { driveId },
    });

    if (inviteCount > 0) {
      throw new BadRequestException("This drive cannot be modified because candidate invite links have already been generated.");
    }

    const { name, roleTemplateId, moduleConfig, scheduleStart, scheduleEnd, status } = dto;

    const data: any = {};
    if (name) data.name = name;
    if (roleTemplateId) {
      const template = await this.prisma.roleTemplate.findUnique({
        where: { id: roleTemplateId },
      });
      if (!template) {
        throw new NotFoundException(`Role template not found with ID ${roleTemplateId}`);
      }
      data.roleTemplateId = roleTemplateId;
    }
    if (moduleConfig) data.moduleConfig = moduleConfig;
    if (scheduleStart) data.scheduleStart = new Date(scheduleStart);
    if (scheduleEnd) data.scheduleEnd = new Date(scheduleEnd);
    if (status) data.status = status;

    if (data.scheduleStart && data.scheduleEnd && data.scheduleStart >= data.scheduleEnd) {
      throw new BadRequestException("Schedule start date must be before end date");
    }

    const updated = await this.prisma.drive.update({
      where: { id: driveId },
      data,
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "DRIVE_UPDATED",
        entityType: "Drive",
        entityId: driveId,
        metadata: { dto: dto as any },
      },
    });

    return {
      driveId: updated.id,
      name: updated.name,
      status: updated.status,
    };
  }

  async duplicate(driveId: string, staffId: string) {
    const sourceDrive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: { questions: true },
    });

    if (!sourceDrive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const duplicated = await this.prisma.$transaction(async (tx) => {
      const drive = await tx.drive.create({
        data: {
          name: `Copy of ${sourceDrive.name}`,
          roleTemplateId: sourceDrive.roleTemplateId,
          moduleConfig: sourceDrive.moduleConfig as any,
          status: "DRAFT",
          createdById: staffId,
        },
      });

      if (sourceDrive.questions.length > 0) {
        await tx.driveQuestion.createMany({
          data: sourceDrive.questions.map((q) => ({
            driveId: drive.id,
            questionId: q.questionId,
            moduleType: q.moduleType,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_DUPLICATED",
          entityType: "Drive",
          entityId: drive.id,
          metadata: { sourceDriveId: driveId },
        },
      });

      return drive;
    });

    return {
      driveId: duplicated.id,
      name: duplicated.name,
      status: duplicated.status,
    };
  }

  async closeEarly(driveId: string, staffId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    if (drive.status !== "ACTIVE") {
      throw new BadRequestException("Only ACTIVE drives can be closed early");
    }

    const updated = await this.prisma.drive.update({
      where: { id: driveId },
      data: {
        status: "CLOSED",
        scheduleEnd: new Date(),
      },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "DRIVE_CLOSED_EARLY",
        entityType: "Drive",
        entityId: driveId,
        metadata: {},
      },
    });

    return {
      driveId: updated.id,
      name: updated.name,
      status: updated.status,
    };
  }

  async delete(driveId: string, staffId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        invites: {
          include: {
            session: true,
          },
        },
      },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Get all session IDs and invite IDs
      const inviteIds = drive.invites.map((i) => i.id);
      const sessionIds = drive.invites
        .map((i) => i.session?.id)
        .filter((id): id is string => !!id);

      // Get any sessions directly linked to the drive
      const directSessions = await tx.session.findMany({
        where: { driveId },
        select: { id: true },
      });
      const directSessionIds = directSessions.map((s) => s.id);
      const allSessionIds = Array.from(new Set([...sessionIds, ...directSessionIds]));

      if (allSessionIds.length > 0) {
        // Query flag IDs for these sessions to delete evidence clips safely without relation filters in write
        const flags = await tx.integrityFlag.findMany({
          where: { sessionId: { in: allSessionIds } },
          select: { id: true },
        });
        const flagIds = flags.map((f) => f.id);

        if (flagIds.length > 0) {
          // Delete evidence clips associated with integrity flags
          await tx.evidenceClip.deleteMany({
            where: {
              flagId: { in: flagIds },
            },
          });
        }

        // Delete integrity flags
        await tx.integrityFlag.deleteMany({
          where: { sessionId: { in: allSessionIds } },
        });
        // Delete event logs
        await tx.eventLog.deleteMany({
          where: { sessionId: { in: allSessionIds } },
        });
        // Delete module responses
        await tx.moduleResponse.deleteMany({
          where: { sessionId: { in: allSessionIds } },
        });
        // Delete scores
        await tx.score.deleteMany({
          where: { sessionId: { in: allSessionIds } },
        });
        // Delete reviewer decisions
        await tx.reviewerDecision.deleteMany({
          where: { sessionId: { in: allSessionIds } },
        });
      }

      // 2. Unlink sessions from invites to prevent foreign key errors
      if (inviteIds.length > 0) {
        await tx.invite.updateMany({
          where: { id: { in: inviteIds } },
          data: { sessionId: null },
        });
      }

      // 3. Delete sessions
      if (allSessionIds.length > 0) {
        await tx.session.deleteMany({
          where: { id: { in: allSessionIds } },
        });
      }

      // 4. Delete invites
      if (inviteIds.length > 0) {
        await tx.invite.deleteMany({
          where: { id: { in: inviteIds } },
        });
      }

      // 5. Delete drive questions
      await tx.driveQuestion.deleteMany({
        where: { driveId },
      });

      // 6. Delete drive
      await tx.drive.delete({
        where: { id: driveId },
      });

      // 7. Audit log
      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_DELETED",
          entityType: "Drive",
          entityId: driveId,
          metadata: { name: drive.name },
        },
      });
    });

    return { success: true };
  }
}
