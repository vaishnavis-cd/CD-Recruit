import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQuestionDto, UpdateQuestionDto, ListQuestionsQueryDto } from "../common/dto/question.dto";
import { ModuleType, QuestionStatus } from "@cd-recruit/shared-types";

@Injectable()
export class QuestionService {
  constructor(private readonly prisma: PrismaService) {}

  private validateQuestionContent(moduleType: ModuleType, content: any, scoringConfig: any) {
    if (!content) {
      throw new BadRequestException("Question content is required");
    }

    switch (moduleType) {
      case ModuleType.MCQ:
        if (!content.prompt || !Array.isArray(content.options) || content.options.length < 2) {
          throw new BadRequestException("MCQ must contain a prompt and at least 2 options");
        }
        if (scoringConfig?.correctIndex === undefined && content.correctIndex === undefined) {
          throw new BadRequestException("MCQ must specify correctIndex");
        }
        break;
      case ModuleType.SQL:
        if (!content.prompt || !content.schema || !content.seedData) {
          throw new BadRequestException("SQL question must contain prompt, schema, and seedData");
        }
        break;
      case ModuleType.CODING:
        if (!content.prompt || !content.starterCode) {
          throw new BadRequestException("Coding question must contain prompt and starterCode");
        }
        break;
      case ModuleType.AI_PROMPTING:
        if (!content.prompt || !content.rubric) {
          throw new BadRequestException("AI Prompting question must contain prompt and rubric");
        }
        break;
      case ModuleType.SIMULATION:
        if (!content.title || !Array.isArray(content.triggers) || !Array.isArray(content.rubric)) {
          throw new BadRequestException("Simulation must contain title, triggers, and rubric");
        }
        break;
    }
  }

  async create(dto: CreateQuestionDto) {
    const { moduleType, content, scoringConfig = {}, difficulty = "medium", tags = [], status = QuestionStatus.PUBLISHED, role = "General" } = dto;
    
    this.validateQuestionContent(moduleType, content, scoringConfig);

    const question = await this.prisma.question.create({
      data: {
        moduleType: moduleType as any,
        role,
        content: content as any,
        scoringConfig: scoringConfig as any,
        difficulty,
        tags,
        status: status as any,
        version: 1,
      },
    });

    return question;
  }

  async list(query: ListQuestionsQueryDto) {
    const { page, pageSize, moduleType, difficulty, search, status, role } = query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};
    if (moduleType) {
      where.moduleType = moduleType;
    }
    if (difficulty) {
      where.difficulty = difficulty;
    }
    if (role) {
      where.role = { contains: role, mode: "insensitive" };
    }
    if (status) {
      where.status = status;
    } else {
      where.status = { not: QuestionStatus.ARCHIVED }; // Default hide archived
    }

    if (search) {
      where.OR = [
        { content: { path: ["prompt"], string_contains: search } },
        { content: { path: ["title"], string_contains: search } },
        { tags: { has: search } },
        { role: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip,
        take,
        orderBy: { version: "desc" },
      }),
      this.prisma.question.count({ where }),
    ]);

    // Map items to include summary statistics
    const itemsWithStats = await Promise.all(
      items.map(async (q) => {
        const usageCount = await this.prisma.driveQuestion.count({
          where: { questionId: q.id },
        });

        // Compute average score on this question
        const responses = await this.prisma.moduleResponse.findMany({
          where: { questionId: q.id },
          include: {
            session: {
              include: {
                score: true,
              },
            },
          },
        });

        let avgScore: number | null = null;
        if (responses.length > 0) {
          let sum = 0;
          let count = 0;
          for (const res of responses) {
            const modScores = res.session.score?.moduleScores as Record<string, number>;
            if (modScores && modScores[q.moduleType]) {
              sum += modScores[q.moduleType];
              count += 1;
            }
          }
          if (count > 0) {
            avgScore = Math.round((sum / count) * 100);
          }
        }

        return {
          id: q.id,
          moduleType: q.moduleType,
          content: q.content,
          difficulty: q.difficulty,
          tags: q.tags,
          version: q.version,
          status: q.status,
          usageCount,
          avgScore,
        };
      }),
    );

    return {
      items: itemsWithStats,
      total,
      page,
      pageSize,
    };
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException(`Question not found with ID ${id}`);
    }

    const stats = await this.getStats(id);

    return {
      ...question,
      stats,
    };
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException(`Question not found with ID ${id}`);
    }

    const { moduleType = question.moduleType as ModuleType, content = question.content, scoringConfig = question.scoringConfig, difficulty, tags, status, role } = dto;

    this.validateQuestionContent(moduleType, content, scoringConfig);

    // Check if this question is used in any Drive
    const usageCount = await this.prisma.driveQuestion.count({
      where: { questionId: id },
    });

    if (usageCount > 0) {
      // Create new version
      const newQuestion = await this.prisma.question.create({
        data: {
          moduleType: moduleType as any,
          role: role ?? question.role,
          content: content as any,
          scoringConfig: scoringConfig as any,
          difficulty: difficulty ?? question.difficulty,
          tags: tags ?? question.tags,
          status: (status as any) ?? question.status,
          version: question.version + 1,
          folderId: question.folderId ?? question.id, // Original question links versions
        },
      });

      // Soft archive old question
      await this.prisma.question.update({
        where: { id },
        data: { status: QuestionStatus.ARCHIVED as any },
      });

      return newQuestion;
    } else {
      // Edit in-place
      const updated = await this.prisma.question.update({
        where: { id },
        data: {
          moduleType: moduleType as any,
          role: role ?? question.role,
          content: content as any,
          scoringConfig: scoringConfig as any,
          difficulty: difficulty ?? question.difficulty,
          tags: tags ?? question.tags,
          status: (status as any) ?? question.status,
        },
      });
      return updated;
    }
  }

  async remove(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException(`Question not found with ID ${id}`);
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: { status: QuestionStatus.ARCHIVED as any },
    });

    return { id: updated.id, status: updated.status };
  }

  async bulkUpload(moduleType: ModuleType, questions: any[]) {
    const createdList: any[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const q of questions) {
        this.validateQuestionContent(moduleType, q.content, q.scoringConfig);

        const created = await tx.question.create({
          data: {
            moduleType: moduleType as any,
            role: q.role ?? "General",
            content: q.content,
            scoringConfig: q.scoringConfig ?? {},
            difficulty: q.difficulty ?? "medium",
            tags: q.tags ?? [moduleType.toLowerCase()],
            version: 1,
            status: "PUBLISHED",
          },
        });
        createdList.push(created);
      }
    });

    return {
      count: createdList.length,
      questions: createdList,
    };
  }

  async getStats(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!question) {
      throw new NotFoundException(`Question not found with ID ${id}`);
    }

    const usageCount = await this.prisma.driveQuestion.count({
      where: { questionId: id },
    });

    // Average Score
    const responses = await this.prisma.moduleResponse.findMany({
      where: { questionId: id },
      include: {
        session: {
          include: {
            score: true,
          },
        },
      },
    });

    let avgScore: number | null = null;
    let passRate: number | null = null;

    if (responses.length > 0) {
      let sum = 0;
      let count = 0;
      let passes = 0;
      for (const res of responses) {
        const modScores = res.session.score?.moduleScores as Record<string, number>;
        if (modScores && modScores[question.moduleType]) {
          const score = modScores[question.moduleType];
          sum += score;
          count += 1;
          if (score >= 0.7) {
            passes += 1;
          }
        }
      }
      if (count > 0) {
        avgScore = Math.round((sum / count) * 100) / 100;
        passRate = Math.round((passes / count) * 100);
      }
    }

    return {
      driveCount: usageCount,
      avgScore,
      passRate,
    };
  }
}
