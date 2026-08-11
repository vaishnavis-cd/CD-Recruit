import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Department, ExperienceLevel } from "@prisma/client";

@Injectable()
export class RoleTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the active RoleTemplate for a given department and level.
   * Throws NotFoundException if no active template exists.
   * NEVER auto-creates a placeholder template.
   */
  async findActiveTemplate(department: Department, level: ExperienceLevel) {
    const template = await this.prisma.roleTemplate.findFirst({
      where: {
        department,
        level,
        isActive: true,
      },
      include: {
        templateQuestions: {
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
        `No active RoleTemplate found for department=${department} and level=${level}`
      );
    }

    return template;
  }

  /**
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
          });
        }
      }

      return tx.roleTemplate.findUnique({
        where: { id: newTemplate.id },
        include: { templateQuestions: { include: { question: true } } },
      });
    });
  }
}
