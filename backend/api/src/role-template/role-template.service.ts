<<<<<<< HEAD
import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Department, ExperienceLevel } from "@prisma/client";
=======
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Department, ExperienceLevel, ModuleType } from "@prisma/client";

export interface RoleTemplateQuestionInput {
  questionId: string;
  moduleType: ModuleType;
  orderIndex?: number;
  questionVersionSnapshot?: number;
  pointShare?: number;
}

export interface CreateRoleTemplateDto {
  roleName: string;
  weightingPreset: Record<string, number>;
  durationMinutes: number;
  department?: Department;
  level?: ExperienceLevel;
  version?: number;
  isActive?: boolean;
  questions?: RoleTemplateQuestionInput[];
}

export interface UpdateRoleTemplateDto {
  roleName?: string;
  weightingPreset?: Record<string, number>;
  durationMinutes?: number;
  department?: Department;
  level?: ExperienceLevel;
  version?: number;
  isActive?: boolean;
  questions?: RoleTemplateQuestionInput[];
}
>>>>>>> partner-api

@Injectable()
export class RoleTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
<<<<<<< HEAD
   * Find the active RoleTemplate for a given department and level.
   * Throws NotFoundException if no active template exists.
   * NEVER auto-creates a placeholder template.
=======
   * Lookup current active RoleTemplate for a specific Department and ExperienceLevel.
   * Throws NotFoundException if no active row exists. Never auto-creates.
>>>>>>> partner-api
   */
  async findActiveTemplate(department: Department, level: ExperienceLevel) {
    const template = await this.prisma.roleTemplate.findFirst({
      where: {
        department,
        level,
        isActive: true,
      },
      include: {
<<<<<<< HEAD
        templateQuestions: {
=======
        questions: {
>>>>>>> partner-api
          include: {
            question: true,
          },
          orderBy: {
            orderIndex: "asc",
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(
<<<<<<< HEAD
        `No active RoleTemplate found for department=${department} and level=${level}`
=======
        `Active RoleTemplate not found for department '${department}' and level '${level}'`,
>>>>>>> partner-api
      );
    }

    return template;
  }

  /**
<<<<<<< HEAD
   * Append-only versioning update path.
   * Editing a published RoleTemplate creates a NEW RoleTemplate row with version + 1,
   * re-associates/copies the RoleTemplateQuestion rows, sets the new row isActive = true,
   * and sets the old row isActive = false.
   */
  async createNextVersion(
    currentTemplateId: string,
    updates: {
      roleName?: string;
      weightingPreset?: any;
      durationMinutes?: number;
      questionIds?: string[];
    }
  ) {
    const existing = await this.prisma.roleTemplate.findUnique({
      where: { id: currentTemplateId },
      include: { templateQuestions: true },
    });

    if (!existing) {
      throw new NotFoundException(`RoleTemplate with ID ${currentTemplateId} not found`);
    }

    if (!existing.department || !existing.level) {
      throw new BadRequestException(
        `RoleTemplate ${currentTemplateId} lacks department/level metadata required for versioning`
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Deactivate old template
      await tx.roleTemplate.update({
        where: { id: currentTemplateId },
        data: { isActive: false },
      });

      // 2. Create new template with version + 1
      const newVersion = existing.version + 1;
      const newTemplate = await tx.roleTemplate.create({
        data: {
          roleName: updates.roleName ?? existing.roleName,
          department: existing.department,
          level: existing.level,
          version: newVersion,
          isActive: true,
          weightingPreset: updates.weightingPreset ?? (existing.weightingPreset as any),
          durationMinutes: updates.durationMinutes ?? existing.durationMinutes,
        },
      });

      // 3. Associate questions
      if (updates.questionIds && updates.questionIds.length > 0) {
        const questions = await tx.question.findMany({
          where: { id: { in: updates.questionIds } },
        });

        const questionMap = new Map(questions.map((q) => [q.id, q]));

        for (let i = 0; i < updates.questionIds.length; i++) {
          const qId = updates.questionIds[i];
          const q = questionMap.get(qId);
          if (q) {
            await tx.roleTemplateQuestion.create({
              data: {
                roleTemplateId: newTemplate.id,
                questionId: qId,
                moduleType: q.moduleType,
                orderIndex: i,
              },
            });
          }
        }
      } else {
        for (const tq of existing.templateQuestions) {
          await tx.roleTemplateQuestion.create({
            data: {
              roleTemplateId: newTemplate.id,
              questionId: tq.questionId,
              moduleType: tq.moduleType,
              orderIndex: tq.orderIndex,
            },
=======
   * Standard CRUD: Create a new RoleTemplate with optional initial questions.
   */
  async create(dto: CreateRoleTemplateDto) {
    const { roleName, weightingPreset, durationMinutes, department, level, version = 1, isActive = true, questions } = dto;

    return this.prisma.roleTemplate.create({
      data: {
        roleName,
        weightingPreset: weightingPreset as any,
        durationMinutes,
        department,
        level,
        version,
        isActive,
        questions:
          questions && questions.length > 0
            ? {
                create: questions.map((q, idx) => ({
                  questionId: q.questionId,
                  moduleType: q.moduleType,
                  orderIndex: q.orderIndex ?? idx,
                  questionVersionSnapshot: q.questionVersionSnapshot,
                  pointShare: q.pointShare,
                })),
              }
            : undefined,
      },
      include: {
        questions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    });
  }

  /**
   * Standard CRUD: List all RoleTemplates with optional filtering.
   */
  async findAll(filters?: { department?: Department; level?: ExperienceLevel; isActive?: boolean }) {
    return this.prisma.roleTemplate.findMany({
      where: {
        ...(filters?.department ? { department: filters.department } : {}),
        ...(filters?.level ? { level: filters.level } : {}),
        ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
      },
      include: {
        questions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
      },
      orderBy: [{ department: "asc" }, { level: "asc" }, { version: "desc" }],
    });
  }

  /**
   * Standard CRUD: Find a single RoleTemplate by ID.
   */
  async findOne(id: string) {
    const template = await this.prisma.roleTemplate.findUnique({
      where: { id },
      include: {
        questions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(`RoleTemplate not found with ID ${id}`);
    }

    return template;
  }

  /**
   * Standard CRUD: Update an existing RoleTemplate.
   */
  async update(id: string, dto: UpdateRoleTemplateDto) {
    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const { roleName, weightingPreset, durationMinutes, department, level, version, isActive, questions } = dto;

      if (questions) {
        await tx.roleTemplateQuestion.deleteMany({
          where: { roleTemplateId: id },
        });

        if (questions.length > 0) {
          await tx.roleTemplateQuestion.createMany({
            data: questions.map((q, idx) => ({
              roleTemplateId: id,
              questionId: q.questionId,
              moduleType: q.moduleType,
              orderIndex: q.orderIndex ?? idx,
              questionVersionSnapshot: q.questionVersionSnapshot,
              pointShare: q.pointShare,
            })),
>>>>>>> partner-api
          });
        }
      }

<<<<<<< HEAD
      return tx.roleTemplate.findUnique({
        where: { id: newTemplate.id },
        include: { templateQuestions: { include: { question: true } } },
=======
      return tx.roleTemplate.update({
        where: { id },
        data: {
          ...(roleName !== undefined ? { roleName } : {}),
          ...(weightingPreset !== undefined ? { weightingPreset: weightingPreset as any } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
          ...(department !== undefined ? { department } : {}),
          ...(level !== undefined ? { level } : {}),
          ...(version !== undefined ? { version } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        include: {
          questions: {
            include: { question: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      });
    });
  }

  /**
   * Standard CRUD: Delete a RoleTemplate by ID.
   */
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.roleTemplate.delete({
      where: { id },
    });
  }

  /**
   * Clones current active row + its RoleTemplateQuestion rows into a new version,
   * sets the new row active, and flips the old row inactive in a transaction.
   */
  async publishNewVersion(templateId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.roleTemplate.findUnique({
        where: { id: templateId },
        include: {
          questions: true,
        },
      });

      if (!current) {
        throw new NotFoundException(`RoleTemplate not found with ID ${templateId}`);
      }

      let nextVersion = current.version + 1;

      if (current.department && current.level) {
        const maxVersionRow = await tx.roleTemplate.findFirst({
          where: {
            department: current.department,
            level: current.level,
          },
          orderBy: { version: "desc" },
        });

        if (maxVersionRow) {
          nextVersion = Math.max(nextVersion, maxVersionRow.version + 1);
        }

        await tx.roleTemplate.updateMany({
          where: {
            department: current.department,
            level: current.level,
            isActive: true,
          },
          data: { isActive: false },
        });
      } else {
        await tx.roleTemplate.update({
          where: { id: templateId },
          data: { isActive: false },
        });
      }

      const newTemplate = await tx.roleTemplate.create({
        data: {
          roleName: current.roleName,
          weightingPreset: current.weightingPreset as any,
          durationMinutes: current.durationMinutes,
          department: current.department,
          level: current.level,
          version: nextVersion,
          isActive: true,
        },
      });

      if (current.questions.length > 0) {
        await tx.roleTemplateQuestion.createMany({
          data: current.questions.map((q) => ({
            roleTemplateId: newTemplate.id,
            questionId: q.questionId,
            moduleType: q.moduleType,
            orderIndex: q.orderIndex,
            questionVersionSnapshot: q.questionVersionSnapshot,
            pointShare: q.pointShare,
          })),
        });
      }

      return tx.roleTemplate.findUnique({
        where: { id: newTemplate.id },
        include: {
          questions: {
            include: { question: true },
            orderBy: { orderIndex: "asc" },
          },
        },
>>>>>>> partner-api
      });
    });
  }
}
