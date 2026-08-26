import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Department, ExperienceLevel, ModuleType } from "@prisma/client";
import { CandidateCategory, normalizeCategory, normalizeExperienceTier } from "../common/utils/experience-tier.util";

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
  category?: CandidateCategory;
  experienceTier?: string;
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
  category?: CandidateCategory;
  experienceTier?: string;
  version?: number;
  isActive?: boolean;
  questions?: RoleTemplateQuestionInput[];
}

@Injectable()
export class RoleTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lookup current active RoleTemplate for a specific Department and ExperienceLevel / Category / Tier.
   * Throws NotFoundException if no active row exists. Never auto-creates.
   */
  async findActiveTemplate(
    department: Department,
    levelOrCategory?: string,
    experienceTier?: string,
  ) {
    const norm = normalizeExperienceTier(experienceTier, levelOrCategory);
    const category = norm?.category || normalizeCategory(levelOrCategory);
    const tier = norm?.tier;

    // 1. Try finding by (department, category, experienceTier)
    let template = await this.prisma.roleTemplate.findFirst({
      where: {
        department,
        category,
        ...(tier ? { experienceTier: tier } : {}),
        isActive: true,
      },
      include: {
        questions: {
          include: {
            question: true,
          },
          orderBy: {
            orderIndex: "asc",
          },
        },
      },
      orderBy: { version: "desc" },
    });

    // 2. Fallback to legacy level lookup (FRESHER / EXPERIENCED) if tier-specific template not found
    if (!template && levelOrCategory) {
      const legacyLevel = levelOrCategory.toUpperCase() as ExperienceLevel;
      template = await this.prisma.roleTemplate.findFirst({
        where: {
          department,
          level: legacyLevel,
          isActive: true,
        },
        include: {
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderIndex: "asc",
            },
          },
        },
        orderBy: { version: "desc" },
      });
    }

    // 3. Fallback to any active template in department if only 1 exists
    if (!template) {
      template = await this.prisma.roleTemplate.findFirst({
        where: {
          department,
          isActive: true,
        },
        include: {
          questions: {
            include: {
              question: true,
            },
            orderBy: {
              orderIndex: "asc",
            },
          },
        },
        orderBy: { version: "desc" },
      });
    }

    if (!template) {
      throw new NotFoundException(
        `Active RoleTemplate not found for department '${department}', category '${category}' and tier '${tier || "default"}'`,
      );
    }

    return template;
  }

  /**
   * Retrieves all active RoleTemplates for a department (pre-fetches for high-throughput batching).
   */
  async findActiveTemplatesForDepartment(department: Department) {
    return this.prisma.roleTemplate.findMany({
      where: {
        department,
        isActive: true,
      },
      include: {
        questions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
      },
      orderBy: [{ category: "asc" }, { experienceTier: "asc" }, { version: "desc" }],
    });
  }

  /**
   * Standard CRUD: Create a new RoleTemplate with optional initial questions.
   */
  async create(dto: CreateRoleTemplateDto) {
    const {
      roleName,
      weightingPreset,
      durationMinutes,
      department,
      level,
      category,
      experienceTier,
      version = 1,
      isActive = true,
      questions,
    } = dto;

    const normCategory = category || (level ? normalizeCategory(level) : CandidateCategory.FRESHER);
    const normTier = experienceTier || (normCategory === CandidateCategory.FRESHER ? "0-1" : null);

    return this.prisma.roleTemplate.create({
      data: {
        roleName,
        weightingPreset: weightingPreset as any,
        durationMinutes,
        department,
        level: level || (normCategory === CandidateCategory.FRESHER ? ExperienceLevel.FRESHER : ExperienceLevel.EXPERIENCED),
        category: normCategory,
        experienceTier: normTier,
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
  async findAll(filters?: {
    department?: Department;
    level?: ExperienceLevel;
    category?: CandidateCategory;
    experienceTier?: string;
    isActive?: boolean;
  }) {
    return this.prisma.roleTemplate.findMany({
      where: {
        ...(filters?.department ? { department: filters.department } : {}),
        ...(filters?.level ? { level: filters.level } : {}),
        ...(filters?.category ? { category: filters.category } : {}),
        ...(filters?.experienceTier ? { experienceTier: filters.experienceTier } : {}),
        ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
      },
      include: {
        questions: {
          include: { question: true },
          orderBy: { orderIndex: "asc" },
        },
      },
      orderBy: [{ department: "asc" }, { category: "asc" }, { experienceTier: "asc" }, { version: "desc" }],
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
      const {
        roleName,
        weightingPreset,
        durationMinutes,
        department,
        level,
        category,
        experienceTier,
        version,
        isActive,
        questions,
      } = dto;

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
          });
        }
      }

      return tx.roleTemplate.update({
        where: { id },
        data: {
          ...(roleName !== undefined ? { roleName } : {}),
          ...(weightingPreset !== undefined ? { weightingPreset: weightingPreset as any } : {}),
          ...(durationMinutes !== undefined ? { durationMinutes } : {}),
          ...(department !== undefined ? { department } : {}),
          ...(level !== undefined ? { level } : {}),
          ...(category !== undefined ? { category } : {}),
          ...(experienceTier !== undefined ? { experienceTier } : {}),
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

      if (current.department) {
        const maxVersionRow = await tx.roleTemplate.findFirst({
          where: {
            department: current.department,
            category: current.category,
            experienceTier: current.experienceTier,
          },
          orderBy: { version: "desc" },
        });

        if (maxVersionRow) {
          nextVersion = Math.max(nextVersion, maxVersionRow.version + 1);
        }

        await tx.roleTemplate.updateMany({
          where: {
            department: current.department,
            category: current.category,
            experienceTier: current.experienceTier,
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
          category: current.category,
          experienceTier: current.experienceTier,
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
      });
    });
  }
}
