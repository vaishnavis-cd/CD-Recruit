import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
import { InviteStatus, SessionStatus, ModuleType, OriginChannel, Department } from "@prisma/client";

import { CandidateIngestionService } from "./candidate-ingestion.service";
import { CsvIngestionService } from "./csv-ingestion.service";
import { DriveRepository } from "./drive.repository";
import {
  getRequiredQuestionCount,
  getDefaultDifficultyDistribution,
  getEstimatedModuleDuration,
} from "../session/session.service";

@Injectable()
export class DriveService {
  private readonly driveRepo: DriveRepository;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly candidateIngestionService: CandidateIngestionService,
    private readonly csvIngestionService: CsvIngestionService,
    driveRepository?: DriveRepository,
  ) {
    this.driveRepo = driveRepository ?? new DriveRepository(prisma);
  }

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

    // 1. Verify RoleTemplate exists by ID, roleName, or department/level
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleTemplateId);
    const isDept = Object.values(Department).includes(roleTemplateId.toUpperCase().trim() as any);

    const searchOr: any[] = [
      { roleName: { equals: roleTemplateId, mode: "insensitive" } },
    ];
    if (isUuid) {
      searchOr.unshift({ id: roleTemplateId });
    }
    if (isDept) {
      searchOr.push({ department: roleTemplateId.toUpperCase().trim() as Department });
    }

    let template = await this.prisma.roleTemplate.findFirst({
      where: {
        OR: searchOr,
        isActive: true,
      },
      orderBy: { version: "desc" },
    });

    if (!template) {
      template = await this.prisma.roleTemplate.create({
        data: {
          roleName: roleTemplateId.trim() || "Software Developer",
          department: "SOFTWARE_ENGINEERING",
          level: "FRESHER",
          weightingPreset: { MCQ: 0.15, SQL: 0.15, CODING: 0.20, DEBUGGING: 0.15, AI_PROMPTING: 0.10, SIMULATION: 0.15, TEST_SCENARIOS: 0.10 },
          durationMinutes: 90,
          isActive: true,
        },
      });
    }
    const finalRoleTemplateId = template.id;
    const targetDept = template.department || "SOFTWARE_ENGINEERING";

    const dbSettings = await this.prisma.moduleSetting.findMany({
      where: { department: targetDept },
    });
    const enabledModules = new Set(
      dbSettings.filter((s) => s.isEnabled).map((s) => s.moduleType)
    );

    let defaultModuleConfig: any;
    const isCustomRole = Boolean((moduleConfig as any)?.isCustomRole);
    const hasModuleEntries = moduleConfig && Object.keys(moduleConfig).some((k) => Object.values(ModuleType).includes(k as any));

    if (hasModuleEntries) {
      defaultModuleConfig = moduleConfig;
      let totalWeight = 0;
      for (const [moduleType, modConf] of Object.entries(defaultModuleConfig)) {
        if (!Object.values(ModuleType).includes(moduleType as any)) continue;
        const conf = modConf as any;
        if (!conf) continue;
        const weight = Number(conf.weight) || 0;
        if (weight < 0) {
          throw new BadRequestException(`Weight for module ${moduleType} cannot be negative.`);
        }
        const isEnabled = conf.enabled === true;
        if (!enabledModules.has(moduleType as any)) {
          if (isEnabled || weight > 0) {
            throw new BadRequestException(`Module ${moduleType} is globally disabled for department ${targetDept} and cannot be enabled or receive weight.`);
          }
        }
        if (isEnabled) {
          totalWeight += weight;
        }
      }
      if (status === DriveStatus.SCHEDULED || status === DriveStatus.ACTIVE) {
        if (totalWeight !== 100) {
          throw new BadRequestException(`Total module weight must equal exactly 100%. Current sum: ${totalWeight}%`);
        }
      }
    } else {
      const preset = (template.weightingPreset as Record<string, number>) || {};
      const allModules = Object.values(ModuleType);
      const configMap: Record<string, any> = {
        isCustomRole: isCustomRole,
      };
      let totalWeight = 0;
      for (const mod of allModules) {
        const isGloballyEnabled = enabledModules.has(mod);
        const presetWeightFraction = preset[mod] !== undefined ? Number(preset[mod]) : 0;
        const weight = isGloballyEnabled ? presetWeightFraction * 100 : 0;
        const enabled = isGloballyEnabled && weight > 0;
        configMap[mod] = {
          enabled,
          durationMinutes: mod === "CODING" ? 30 : mod === "SQL" || mod === "DEBUGGING" || mod === "NOSQL" ? 20 : mod === "SIMULATION" ? 10 : 15,
          weight,
        };
        if (enabled) {
          totalWeight += weight;
        }
      }
      defaultModuleConfig = configMap;
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
    const activeEnabledModules = Object.entries(defaultModuleConfig)
      .filter(([_, conf]: [string, any]) => conf.enabled)
      .map(([mod, _]) => mod);

    const completenessTargetDept = template.department || template.roleName;

    if (status === DriveStatus.SCHEDULED || status === DriveStatus.ACTIVE) {
      for (const mod of activeEnabledModules) {
        if (mod === "AI_PROMPTING") continue;

        let qCount = 0;
        if (dto.questionIds && dto.questionIds.length > 0) {
          qCount = await this.prisma.question.count({
            where: {
              id: { in: dto.questionIds },
              moduleType: mod as any,
              status: "PUBLISHED",
            },
          });
        } else {
          qCount = await this.prisma.question.count({
            where: {
              moduleType: mod as any,
              status: "PUBLISHED",
              OR: [
                { role: { equals: completenessTargetDept, mode: "insensitive" } },
                { content: { path: ["department"], equals: completenessTargetDept } },
              ],
            },
          });
        }

        if (qCount === 0) {
          throw new AppException(
            "INCOMPLETE_MODULE_CONFIG",
            `No published questions available for department ${targetDept} (module: ${mod}) — question bank not yet populated.`,
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
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
          roleTemplateId: finalRoleTemplateId,
          moduleConfig: defaultModuleConfig as any,
          status: status as any,
          scheduleStart: scheduleStart ? new Date(scheduleStart) : null,
          scheduleEnd: scheduleEnd ? new Date(scheduleEnd) : null,
          createdById: staffId,
        },
      });

      // Link explicitly selected questions if provided by admin, or copy from RoleTemplate
      let questionEntriesToLink: Array<{ questionId: string; moduleType: any; version?: number }> = [];

      if (dto.questionIds && Array.isArray(dto.questionIds) && dto.questionIds.length > 0) {
        const questionsToLink = await tx.question.findMany({
          where: {
            id: { in: dto.questionIds },
            status: "PUBLISHED",
          },
        });
        questionEntriesToLink = questionsToLink.map((q) => {
          const tags = q.tags || [];
          const prompt = typeof (q.content as any)?.prompt === "string" ? (q.content as any).prompt.toLowerCase() : "";
          const isDebug = q.moduleType === "DEBUGGING" || tags.includes("debugging") || prompt.includes("debugging challenge");
          return {
            questionId: q.id,
            moduleType: (isDebug ? "DEBUGGING" : q.moduleType) as any,
            version: q.version ?? 1,
          };
        });
      } else if (finalRoleTemplateId) {
        const tplQuestions = await tx.roleTemplateQuestion.findMany({
          where: { roleTemplateId: finalRoleTemplateId },
          include: { question: true },
        });
        if (tplQuestions.length > 0) {
          questionEntriesToLink = tplQuestions.map((tq) => ({
            questionId: tq.questionId,
            moduleType: tq.moduleType,
            version: tq.questionVersionSnapshot || tq.question?.version || 1,
          }));
        }
      }

      if (questionEntriesToLink.length > 0) {
        await tx.driveQuestion.createMany({
          data: questionEntriesToLink.map((entry) => ({
            driveId: createdDrive.id,
            questionId: entry.questionId,
            moduleType: entry.moduleType,
            questionVersionSnapshot: entry.version ?? 1,
          })),
        });
      }

      // Generate Invites/Roster
      if (candidates.length > 0) {
        await this.candidateIngestionService.processBulkCandidates(
          tx,
          createdDrive.id,
          finalRoleTemplateId,
          candidates,
          staffId,
          true,
        );
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

  /**
   * Instantiate a Drive from a RoleTemplate.
   * Copies RoleTemplateQuestion rows into DriveQuestion (with questionVersionSnapshot populated),
   * carrying over weightingPreset and durationMinutes from the template unless explicitly overridden.
   */
  async createFromTemplate(roleTemplateId: string, driveMeta: any = {}, staffId: string = "system") {
    const template = await this.prisma.roleTemplate.findUnique({
      where: { id: roleTemplateId },
      include: {
        questions: {
          include: {
            question: true,
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`RoleTemplate not found with ID ${roleTemplateId}`);
    }

    const name = driveMeta.name || `${template.roleName} Drive - ${new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
    const status = driveMeta.status || DriveStatus.DRAFT;
    const scheduleStart = driveMeta.scheduleStart;
    const scheduleEnd = driveMeta.scheduleEnd;
    const candidates = driveMeta.candidates || [];

    // Build moduleConfig carrying over weightingPreset and durationMinutes from template unless overridden
    let moduleConfig = driveMeta.moduleConfig;
    if (!moduleConfig) {
      const preset = (template.weightingPreset as Record<string, number>) || {};
      moduleConfig = {};
      const totalDuration = driveMeta.durationMinutes ?? template.durationMinutes ?? 90;

      const entries = Object.entries(preset);
      if (entries.length > 0) {
        let totalWeight = entries.reduce((sum, [_, w]) => sum + (typeof w === "number" ? w : 0), 0);
        if (totalWeight <= 1 && totalWeight > 0) {
          totalWeight = Math.round(totalWeight * 100);
        }

        let allocatedMinutesSum = 0;
        entries.forEach(([mod, w], idx) => {
          let weightNum = typeof w === "number" ? w : 0.2;
          if (weightNum <= 1 && weightNum > 0) weightNum = Math.round(weightNum * 100);

          let modDuration = Math.max(5, Math.round((weightNum / (totalWeight || 100)) * totalDuration));
          if (idx === entries.length - 1) {
            modDuration = Math.max(5, totalDuration - allocatedMinutesSum);
          } else {
            allocatedMinutesSum += modDuration;
          }

          moduleConfig[mod] = {
            enabled: true,
            durationMinutes: modDuration,
            weight: weightNum,
            questionWeighting: { mode: "equal" },
          };
        });
      } else {
        moduleConfig = {
          MCQ: { enabled: true, durationMinutes: 15, weight: 20 },
          SQL: { enabled: true, durationMinutes: 20, weight: 20 },
          CODING: { enabled: true, durationMinutes: 30, weight: 30 },
          DEBUGGING: { enabled: true, durationMinutes: 15, weight: 15 },
          AI_PROMPTING: { enabled: true, durationMinutes: 10, weight: 15 },
        };
      }
    }

    // Schedule validation
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

    return this.prisma.$transaction(async (tx) => {
      const createdDrive = await tx.drive.create({
        data: {
          name,
          roleTemplateId: template.id,
          organizationId: driveMeta.organizationId || undefined,
          moduleConfig: moduleConfig as any,
          status: status as any,
          scheduleStart: scheduleStart ? new Date(scheduleStart) : null,
          scheduleEnd: scheduleEnd ? new Date(scheduleEnd) : null,
          createdById: staffId,
          bufferMinutes: driveMeta.bufferMinutes ?? 15,
          graceMinutes: driveMeta.graceMinutes ?? 5,
        },
      });

      // Copy RoleTemplateQuestion rows into DriveQuestion with questionVersionSnapshot populated
      if (template.questions && template.questions.length > 0) {
        await tx.driveQuestion.createMany({
          data: template.questions.map((rtq) => ({
            driveId: createdDrive.id,
            questionId: rtq.questionId,
            moduleType: rtq.moduleType,
            questionVersionSnapshot: rtq.questionVersionSnapshot ?? rtq.question?.version ?? 1,
            pointShare: rtq.pointShare ?? null,
          })),
        });
      } else if (driveMeta.questionIds && Array.isArray(driveMeta.questionIds) && driveMeta.questionIds.length > 0) {
        const questionsToLink = await tx.question.findMany({
          where: {
            id: { in: driveMeta.questionIds },
            status: "PUBLISHED",
          },
        });

        if (questionsToLink.length > 0) {
          await tx.driveQuestion.createMany({
            data: questionsToLink.map((q) => ({
              driveId: createdDrive.id,
              questionId: q.id,
              moduleType: q.moduleType,
              questionVersionSnapshot: q.version ?? 1,
            })),
          });
        }
      } else {
        const finalMc = (createdDrive.moduleConfig as Record<string, any>) || {};
        const enabledModTypes = Object.entries(finalMc)
          .filter(([_, conf]: [string, any]) => conf?.enabled)
          .map(([mod]) => mod);

        const deptUpper = template.department.toUpperCase();
        const isSde = deptUpper.includes("SOFTWARE") || deptUpper.includes("SDE");

        const autoQuestions = await tx.question.findMany({
          where: {
            status: "PUBLISHED",
            moduleType: { in: enabledModTypes as any },
            OR: [
              { role: { equals: template.department, mode: "insensitive" } },
              { role: { equals: isSde ? "SDE" : template.department, mode: "insensitive" } },
            ],
          },
          take: 40,
        });

        if (autoQuestions.length > 0) {
          await tx.driveQuestion.createMany({
            data: autoQuestions.map((q) => ({
              driveId: createdDrive.id,
              questionId: q.id,
              moduleType: q.moduleType,
              questionVersionSnapshot: q.version ?? 1,
            })),
          });
        }
      }

      // Generate Invites/Roster if candidates provided
      if (candidates.length > 0) {
        await this.candidateIngestionService.processBulkCandidates(
          tx,
          createdDrive.id,
          template.id,
          candidates,
          staffId,
          true,
        );
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_CREATED_FROM_TEMPLATE",
          entityType: "Drive",
          entityId: createdDrive.id,
          metadata: {
            roleTemplateId: template.id,
            templateVersion: template.version,
            department: template.department,
            level: template.level,
          },
        },
      });

      return tx.drive.findUnique({
        where: { id: createdDrive.id },
        include: {
          roleTemplate: true,
          questions: {
            include: { question: true },
          },
          invites: true,
        },
      });
    });
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
        roleTemplateName: drive.roleTemplate?.roleName || "Software Developer",
        moduleConfig: drive.moduleConfig as any,
        status: drive.status as any,
        originChannel: drive.originChannel,
        scheduleStart: drive.scheduleStart ? drive.scheduleStart.toISOString() : null,
        scheduleEnd: drive.scheduleEnd ? drive.scheduleEnd.toISOString() : null,
        createdById: drive.createdById,
        createdByName: drive.createdBy?.name || "System Admin",
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

  async findOne(driveId: string): Promise<DriveDetail & { questionIds: string[] }> {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        roleTemplate: true,
        createdBy: true,
        questions: true,
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
      const candidateAppBase = process.env.CANDIDATE_WEB_URL || process.env.VITE_CANDIDATE_URL || "http://localhost:5173";
      const inviteLink = `${candidateAppBase}/invite/${invite.token}`;
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
        isGenerated: invite.isGenerated,
        category: invite.category,
        experienceTier: invite.experienceTier,
        level: invite.experienceTier || (invite.category === "EXPERIENCED" ? "2-5" : "0-1"),
        roleTemplateId: invite.roleTemplateId,
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

    const baseModuleConfig = {
      MCQ: { enabled: true, durationMinutes: 15, weight: 20 },
      SQL: { enabled: true, durationMinutes: 20, weight: 20 },
      CODING: { enabled: true, durationMinutes: 30, weight: 25 },
      DEBUGGING: { enabled: true, durationMinutes: 20, weight: 15 },
      AI_PROMPTING: { enabled: true, durationMinutes: 15, weight: 10 },
      SIMULATION: { enabled: true, durationMinutes: 10, weight: 10 },
    };
    const finalModuleConfig = {
      ...baseModuleConfig,
      ...((drive.moduleConfig as object) || {}),
    };

    return {
      id: drive.id,
      name: drive.name,
      roleTemplateId: drive.roleTemplateId,
      roleTemplateName: drive.roleTemplate?.roleName || "Software Developer",
      moduleConfig: finalModuleConfig as any,
      status: drive.status as any,
      scheduleStart: drive.scheduleStart ? drive.scheduleStart.toISOString() : null,
      scheduleEnd: drive.scheduleEnd ? drive.scheduleEnd.toISOString() : null,
      createdById: drive.createdById,
      createdByName: drive.createdBy?.name || "System Admin",
      createdAt: drive.createdAt.toISOString(),
      roster,
      invitedCount,
      startedCount,
      completedCount,
      questionIds: drive.questions.map((dq) => dq.questionId),
    };
  }

  async update(driveId: string, dto: UpdateDriveDto, staffId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const generatedInviteCount = await this.prisma.invite.count({
      where: { driveId, isGenerated: true },
    });

    if (generatedInviteCount > 0) {
      throw new BadRequestException("This drive cannot be modified because candidate invite links have already been generated.");
    }

    const { name, roleTemplateId, moduleConfig, scheduleStart, scheduleEnd, status } = dto;

    const data: any = {};
    if (name) data.name = name;
    if (roleTemplateId) {
      let template = await this.prisma.roleTemplate.findFirst({
        where: {
          OR: [
            { id: roleTemplateId },
            { roleName: { equals: roleTemplateId, mode: "insensitive" } },
          ],
        },
      });
      if (!template) {
        template = await this.prisma.roleTemplate.create({
          data: {
            roleName: roleTemplateId.trim() || "Software Developer",
            weightingPreset: { MCQ: 0.2, SQL: 0.2, CODING: 0.3, AI_PROMPTING: 0.15, SIMULATION: 0.15 },
            durationMinutes: 90,
          },
        });
      }
      data.roleTemplateId = template.id;
    }
    if (moduleConfig) {
      const templateId = roleTemplateId || drive.roleTemplateId;
      const template = await this.prisma.roleTemplate.findUnique({
        where: { id: templateId },
      });
      if (!template) {
        throw new NotFoundException(`Role template not found`);
      }
      const targetDept = template.department || "SOFTWARE_ENGINEERING";

      const dbSettings = await this.prisma.moduleSetting.findMany({
        where: { department: targetDept },
      });
      const enabledModules = new Set(
        dbSettings.filter((s) => s.isEnabled).map((s) => s.moduleType)
      );

      let totalWeight = 0;
      for (const [moduleType, modConf] of Object.entries(moduleConfig)) {
        const conf = modConf as any;
        if (!conf) continue;
        const weight = Number(conf.weight) || 0;
        if (weight < 0) {
          throw new BadRequestException(`Weight for module ${moduleType} cannot be negative.`);
        }
        const isEnabled = conf.enabled === true;
        if (!enabledModules.has(moduleType as any)) {
          if (isEnabled || weight > 0) {
            throw new BadRequestException(`Module ${moduleType} is globally disabled for department ${targetDept} and cannot be enabled or receive weight.`);
          }
        }
        if (isEnabled) {
          totalWeight += weight;
        }
      }
      if (totalWeight !== 100) {
        throw new BadRequestException(`Total module weight must equal exactly 100%. Current sum: ${totalWeight}%`);
      }

      const sStart = scheduleStart ? new Date(scheduleStart) : (drive.scheduleStart || new Date());
      const sEnd = scheduleEnd ? new Date(scheduleEnd) : drive.scheduleEnd;
      let windowMinutes = template.durationMinutes || 90;
      if (sStart && sEnd) {
        const diffMs = new Date(sEnd).getTime() - new Date(sStart).getTime();
        const diffMins = Math.round(diffMs / (60 * 1000));
        if (diffMins > 0 && diffMins <= 240 && drive.originChannel !== OriginChannel.PARTNER_API) {
          windowMinutes = diffMins;
        }
      }

      const lowerName = (template.roleName || "").toLowerCase();
      const resolvedTag = lowerName.includes("fresher")
        ? "fresher"
        : lowerName.includes("l1")
        ? "l1"
        : lowerName.includes("l2")
        ? "l2"
        : "l3";

      let totalEstimatedDuration = 0;
      const sanitizedModuleConfig: Record<string, any> = { ...moduleConfig };

      for (const [moduleType, modConf] of Object.entries(moduleConfig)) {
        const conf = modConf as any;
        if (!conf || !conf.enabled || Number(conf.weight) <= 0) continue;

        const reqCount = getRequiredQuestionCount(moduleType, conf.weight, windowMinutes, resolvedTag);
        const dist = conf.difficultyDistribution || getDefaultDifficultyDistribution(reqCount, resolvedTag);

        const distSum = (Number(dist.easy) || 0) + (Number(dist.medium) || 0) + (Number(dist.hard) || 0);
        if (distSum !== reqCount) {
          throw new BadRequestException(
            `Module ${moduleType} difficulty distribution (Easy: ${dist.easy}, Med: ${dist.medium}, Hard: ${dist.hard}) must sum exactly to required count (${reqCount}). Current sum: ${distSum}.`
          );
        }

        const estDuration = getEstimatedModuleDuration(moduleType, dist);
        totalEstimatedDuration += estDuration;

        sanitizedModuleConfig[moduleType] = {
          ...conf,
          requiredCount: reqCount,
          difficultyDistribution: dist,
        };
      }

      if (totalEstimatedDuration > windowMinutes) {
        const overflow = (totalEstimatedDuration - windowMinutes).toFixed(1);
        throw new BadRequestException(
          `Estimated assessment time (${totalEstimatedDuration} min) exceeds the configured assessment duration (${windowMinutes} min) by ${overflow} minutes. Please adjust module weights or difficulty distributions.`
        );
      }

      data.moduleConfig = sanitizedModuleConfig;
    }
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

    if (moduleConfig) {
      const validModuleTypes = Object.values(ModuleType);
      const enabledModules = Object.entries(moduleConfig as Record<string, any>)
        .filter(([mod, conf]) => conf?.enabled && validModuleTypes.includes(mod as any))
        .map(([mod]) => mod as ModuleType);

      await this.prisma.driveQuestion.deleteMany({
        where: {
          driveId,
          moduleType: { notIn: enabledModules },
        },
      });
    }

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
      include: { questions: { include: { question: true } } },
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
            questionVersionSnapshot: (q as any).question?.version ?? q.questionVersionSnapshot ?? 1,
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

  async saveQuestions(
    driveId: string,
    payload: string[] | { questionIds?: string[]; questionAssignments?: Array<{ questionId: string; pointShare?: number }> },
    staffId: string,
  ) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });
    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    if (drive.originChannel === OriginChannel.PARTNER_API && !drive.isEditingUnlocked) {
      throw new ForbiddenException("Question editing for partner API drives is locked by default. Explicit unlock required.");
    }

    const totalInvites = await this.prisma.invite.count({
      where: { driveId },
    });
    const unGeneratedInviteCount = await this.prisma.invite.count({
      where: { driveId, isGenerated: false },
    });

    if (totalInvites > 0 && unGeneratedInviteCount === 0) {
      throw new BadRequestException("This drive questions mapping is locked because all candidate invite links have already been generated.");
    }

    let qIds: string[] = [];
    const shareMap = new Map<string, number | undefined>();

    if (Array.isArray(payload)) {
      qIds = payload;
    } else if (payload && typeof payload === "object") {
      if (Array.isArray(payload.questionAssignments) && payload.questionAssignments.length > 0) {
        qIds = payload.questionAssignments.map((a) => a.questionId);
        payload.questionAssignments.forEach((a) => {
          if (a.pointShare !== undefined && a.pointShare !== null) {
            shareMap.set(a.questionId, Number(a.pointShare));
          }
        });
      } else if (Array.isArray(payload.questionIds)) {
        qIds = payload.questionIds;
      }
    }

    const questions = await this.prisma.question.findMany({
      where: { id: { in: qIds } },
    });

    if (drive.moduleConfig && typeof drive.moduleConfig === "object") {
      const modConfig = drive.moduleConfig as Record<string, any>;
      for (const [modType, conf] of Object.entries(modConfig)) {
        if (!conf || !conf.enabled || Number(conf.weight) <= 0) continue;
        const reqCount = conf.requiredCount;
        if (typeof reqCount === "number" && reqCount > 0) {
          const modQuestions = questions.filter((q) => {
            const tags = q.tags || [];
            const prompt = typeof (q.content as any)?.prompt === "string" ? (q.content as any).prompt.toLowerCase() : "";
            const isDebug = q.moduleType === "DEBUGGING" || tags.includes("debugging") || prompt.includes("debugging challenge");
            const effectiveMod = isDebug ? "DEBUGGING" : q.moduleType;
            return effectiveMod === modType;
          });
          if (modQuestions.length > reqCount) {
            throw new BadRequestException(
              `Module ${modType} has ${modQuestions.length} questions selected, which exceeds the required limit of ${reqCount}. No additional questions can be added.`
            );
          }
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.driveQuestion.deleteMany({
        where: { driveId },
      });

      if (questions.length > 0) {
        await tx.driveQuestion.createMany({
          data: questions.map((q) => {
            const tags = q.tags || [];
            const prompt = typeof (q.content as any)?.prompt === "string" ? (q.content as any).prompt.toLowerCase() : "";
            const isDebug = q.moduleType === "DEBUGGING" || tags.includes("debugging") || prompt.includes("debugging challenge");
            return {
              driveId,
              questionId: q.id,
              moduleType: (isDebug ? "DEBUGGING" : q.moduleType) as any,
              pointShare: shareMap.get(q.id) ?? null,
              questionVersionSnapshot: q.version ?? 1,
            };
          }),
        });
      }

      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_QUESTIONS_UPDATED",
          entityType: "Drive",
          entityId: driveId,
          metadata: { questionCount: questions.length },
        },
      });
    });

    return { success: true };
  }

  async addCandidatesBulk(
    driveId: string,
    candidates: Array<{ name: string; candidateEmail: string }>,
    staffId: string,
  ) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: { roleTemplate: true },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const generatedInviteCount = await this.prisma.invite.count({
      where: { driveId, isGenerated: true },
    });

    if (generatedInviteCount > 0) {
      const now = new Date();
      const cutoffTime = drive.scheduleStart ? new Date(new Date(drive.scheduleStart).getTime() + 15 * 60 * 1000) : null;
      const isWithinLateWindow = cutoffTime ? now <= cutoffTime : true;
      if (!isWithinLateWindow) {
        throw new BadRequestException("This drive candidate roster is locked. Late candidate additions are only allowed prior to 15 minutes past schedule start.");
      }
    }

    if (candidates.length === 0) {
      return { count: 0 };
    }

    await this.prisma.$transaction(async (tx) => {
      await this.candidateIngestionService.processBulkCandidates(
        tx,
        driveId,
        drive.roleTemplateId,
        candidates,
        staffId,
        false,
      );

      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_CANDIDATES_BULK_ADDED",
          entityType: "Drive",
          entityId: driveId,
          metadata: { count: candidates.length },
        },
      });
    });

    return {
      count: candidates.length,
    };
  }

  async generateLinks(driveId: string, staffId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: { roleTemplate: true },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const ungeneratedInvites = await this.prisma.invite.findMany({
      where: { driveId },
    });

    if (ungeneratedInvites.length === 0) {
      throw new BadRequestException("No candidate invites found for this drive. Please add candidates first.");
    }

    const targetDept = drive.roleTemplate?.department || drive.roleTemplate?.roleName || "UNSPECIFIED";
    const driveQuestions = await this.prisma.driveQuestion.findMany({
      where: { driveId },
      include: { question: true },
    });
    const driveQuestionCount = driveQuestions.length;

    if (drive.moduleConfig && typeof drive.moduleConfig === "object") {
      const modConfig = drive.moduleConfig as Record<string, any>;
      for (const [modType, conf] of Object.entries(modConfig)) {
        if (!conf || !conf.enabled || Number(conf.weight) <= 0) continue;
        const reqCount = conf.requiredCount;
        if (typeof reqCount === "number" && reqCount > 0) {
          const modQuestions = driveQuestions.filter((dq) => dq.moduleType === modType);
          if (modQuestions.length !== reqCount) {
            throw new BadRequestException(
              `Cannot generate links: Module ${modType} requires exactly ${reqCount} questions selected (currently ${modQuestions.length} selected).`
            );
          }
          if (conf.difficultyDistribution) {
            const dist = conf.difficultyDistribution;
            const easyCount = modQuestions.filter((dq) => (dq.question?.difficulty || "medium").toUpperCase() === "EASY").length;
            const mediumCount = modQuestions.filter((dq) => (dq.question?.difficulty || "medium").toUpperCase() === "MEDIUM").length;
            const hardCount = modQuestions.filter((dq) => (dq.question?.difficulty || "medium").toUpperCase() === "HARD").length;
            if (easyCount !== dist.easy || mediumCount !== dist.medium || hardCount !== dist.hard) {
              throw new BadRequestException(
                `Cannot generate links: Module ${modType} selected difficulty mix (${easyCount}E / ${mediumCount}M / ${hardCount}H) does not match target (${dist.easy}E / ${dist.medium}M / ${dist.hard}H).`
              );
            }
          }
        }
      }
    }

    if (driveQuestionCount === 0) {
      const deptQuestionCount = await this.prisma.question.count({
        where: {
          status: "PUBLISHED",
          OR: [
            { role: { equals: targetDept, mode: "insensitive" } },
            { content: { path: ["department"], equals: targetDept } },
          ],
        },
      });

      if (deptQuestionCount === 0) {
        throw new BadRequestException(
          `Cannot generate invite links for drive '${drive.name}': No published questions available for department ${targetDept} — question bank not yet populated.`
        );
      }
    }

    const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const updates = ungeneratedInvites.map((invite) => {
      const token = this.authService.generateInviteToken(
        invite.id,
        invite.candidateEmail,
        invite.candidateName,
        drive.roleTemplateId,
      );

      return this.prisma.invite.update({
        where: { id: invite.id },
        data: {
          token,
          expiresAt,
          isGenerated: true,
        },
      });
    });

    await this.prisma.$transaction(async (tx) => {
      // Execute all updates
      await Promise.all(updates);

      // Shift drive status automatically to ACTIVE
      await tx.drive.update({
        where: { id: driveId },
        data: { status: DriveStatus.ACTIVE },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_LINKS_GENERATED",
          entityType: "Drive",
          entityId: driveId,
          metadata: { count: ungeneratedInvites.length },
        },
      });
    });

    return { count: ungeneratedInvites.length };
  }

  async removeCandidateFromDrive(
    driveId: string,
    candidateId: string,
    staffId: string,
  ) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    // Find invites for this candidate in this drive
    const invites = await this.prisma.invite.findMany({
      where: {
        driveId,
        OR: [
          { id: candidateId },
          { candidateEmail: candidateId },
        ],
      },
    });

    let targetCandidateId = candidateId;
    let candidateEmails: string[] = invites.map((i) => i.candidateEmail).filter(Boolean);

    if (invites.length === 0) {
      const candidateRecord = await this.prisma.candidate.findFirst({
        where: { OR: [{ id: candidateId }, { email: candidateId }] },
      });
      if (candidateRecord) {
        targetCandidateId = candidateRecord.id;
        candidateEmails = [candidateRecord.email];
        const matching = await this.prisma.invite.findMany({
          where: { driveId, candidateEmail: candidateRecord.email },
        });
        invites.push(...matching);
      }
    }

    if (invites.length === 0) {
      throw new NotFoundException("No matching candidate invite found for this drive.");
    }

    const inviteIds = Array.from(new Set(invites.map((i) => i.id)));

    // Resolve candidate IDs to update session statuses
    const candidateRecords = await this.prisma.candidate.findMany({
      where: {
        OR: [
          { id: targetCandidateId },
          { email: { in: candidateEmails } },
        ],
      },
      select: { id: true },
    });

    const candidateIds = Array.from(
      new Set([targetCandidateId, ...candidateRecords.map((c) => c.id)].filter(Boolean))
    );

    await this.prisma.$transaction(async (tx) => {
      // Abandon any active/unsubmitted sessions for these candidates in this drive
      if (candidateIds.length > 0) {
        await tx.session.updateMany({
          where: {
            driveId,
            candidateId: { in: candidateIds },
            status: { in: [SessionStatus.NOT_STARTED, SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
          },
          data: { status: SessionStatus.ABANDONED },
        });
      }

      // Delete the invite records
      await tx.invite.deleteMany({
        where: { id: { in: inviteIds } },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          staffId,
          action: "DRIVE_CANDIDATE_REMOVED",
          entityType: "Drive",
          entityId: driveId,
          metadata: { candidateId, inviteIds, candidateEmails },
        },
      });
    });

    return { success: true, count: inviteIds.length };
  }

  async unlockEditing(driveId: string, staffId: string) {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
    });

    if (!drive) {
      throw new NotFoundException(`Drive not found with ID ${driveId}`);
    }

    const updated = await this.prisma.drive.update({
      where: { id: driveId },
      data: { isEditingUnlocked: true },
      include: {
        roleTemplate: true,
        questions: { include: { question: true } },
        invites: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId,
        action: "DRIVE_EDITING_UNLOCKED",
        entityType: "Drive",
        entityId: driveId,
        metadata: {
          driveName: drive.name,
          unlockedAt: new Date().toISOString(),
        },
      },
    });

    return updated;
  }
}
