import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQuestionDto, UpdateQuestionDto, ListQuestionsQueryDto } from "../common/dto/question.dto";
import { ModuleType, QuestionStatus } from "@cd-recruit/shared-types";
import { RakeExtractor } from "../ai-prompting/ai-prompting-guardrails";

@Injectable()
export class QuestionService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const debuggingCandidates = await this.prisma.question.findMany({
        where: {
          OR: [
            { tags: { has: "debugging" } },
            { moduleType: "DEBUGGING" as any },
          ],
        },
      });
      const debuggingIds: string[] = [];

      for (const q of debuggingCandidates) {
        const tags = q.tags || [];
        const promptText = (q.content as any)?.prompt || (q.content as any)?.title || (q.content as any)?.text || "";
        const isDebug =
          q.moduleType === "DEBUGGING" ||
          tags.includes("debugging") ||
          (typeof promptText === "string" && promptText.toLowerCase().includes("debugging"));

        if (isDebug) {
          debuggingIds.push(q.id);
          if (q.moduleType !== ("DEBUGGING" as any)) {
            await this.prisma.question.update({
              where: { id: q.id },
              data: { moduleType: "DEBUGGING" as any },
            });
          }
        }
      }

      if (debuggingIds.length > 0) {
        await this.prisma.driveQuestion.updateMany({
          where: { questionId: { in: debuggingIds } },
          data: { moduleType: "DEBUGGING" as any },
        });
      }
    } catch (err) {
      console.warn("Failed auto-normalizing debugging questions on startup:", err);
    }
  }

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
      case ModuleType.DEBUGGING:
        if (!content.prompt || (!content.starterCode && !content.buggyCode && !content.code)) {
          throw new BadRequestException("Coding/Debugging question must contain prompt and starterCode/buggyCode");
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
      case ModuleType.TEST_SCENARIOS:
        if (!content.prompt || (!content.expectedAnswer && !content.referenceAnswer && !content.criteria)) {
          throw new BadRequestException("Test Scenario question must contain prompt and expected reference criteria");
        }
        break;
    }
  }

  async create(dto: CreateQuestionDto) {
    const {
      moduleType,
      content,
      scoringConfig = {},
      difficulty = "medium",
      targetLevel,
      tags = [],
      status = QuestionStatus.PUBLISHED,
      role = "General",
    } = dto;
    
    this.validateQuestionContent(moduleType, content, scoringConfig);

    if (moduleType === ModuleType.AI_PROMPTING) {
      const textToExtract = content.prompt || content.text || "";
      content.extractedKeywords = RakeExtractor.extract(textToExtract);
    }

    const question = await this.prisma.question.create({
      data: {
        moduleType: moduleType as any,
        role,
        content: content as any,
        scoringConfig: scoringConfig as any,
        difficulty,
        targetLevel: targetLevel || null,
        tags,
        status: status as any,
        version: 1,
      },
    });

    return question;
  }

  async list(query: ListQuestionsQueryDto) {
    const { page, pageSize, moduleType, difficulty, targetLevel, search, status, role, department } = query as any;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};

    // 1. Role / Department module restrictions
    const targetDept = department || role;
    if (targetDept && targetDept !== "all") {
      const deptUpper = targetDept.toUpperCase().trim();
      let allowedMods: string[] = [];

      if (deptUpper.includes("PMO") || deptUpper.includes("PROJECT")) allowedMods = ["MCQ", "TEST_SCENARIOS"];
      else if (deptUpper.includes("SRE") || deptUpper.includes("RELIABILITY")) allowedMods = ["MCQ", "TEST_SCENARIOS"];
      else if (deptUpper.includes("SYSOPS")) allowedMods = ["MCQ", "TEST_SCENARIOS"];
      else if (deptUpper.includes("ITOPS")) allowedMods = ["MCQ", "TEST_SCENARIOS"];
      else if (deptUpper.includes("SECOPS") || deptUpper.includes("SECURITY")) allowedMods = ["MCQ", "TEST_SCENARIOS"];
      else if (deptUpper.includes("DATA")) allowedMods = ["MCQ", "SQL", "CODING"];
      else if (deptUpper.includes("QA") || deptUpper.includes("QUALITY") || deptUpper.includes("TEST")) allowedMods = ["MCQ", "SQL", "CODING", "DEBUGGING", "TEST_SCENARIOS"];
      else if (deptUpper.includes("SOFTWARE") || deptUpper.includes("SDE") || deptUpper.includes("DEVELOPER")) allowedMods = ["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"];

      if (allowedMods.length > 0) {
        where.moduleType = { in: allowedMods as any[] };
      }
    }

    if (moduleType) {
      if (where.moduleType?.in) {
        // If moduleType is requested, make sure it is in allowedMods
        if (where.moduleType.in.includes(moduleType)) {
          where.moduleType = moduleType;
        } else {
          // Requested module not allowed for this role/department
          where.moduleType = "NONE"; // Will match 0 records
        }
      } else {
        where.moduleType = moduleType;
      }
    }

    if (difficulty) {
      where.difficulty = difficulty;
    }
    if (targetLevel) {
      where.targetLevel = targetLevel;
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
      const s = `%${search.toLowerCase().trim()}%`;
      const matched: { id: string }[] = await this.prisma.$queryRaw`
        SELECT id FROM "question"
        WHERE (
          "content"::text ILIKE ${s}
          OR array_to_string("tags", ' ') ILIKE ${s}
          OR "role" ILIKE ${s}
          OR "difficulty" ILIKE ${s}
          OR "module_type"::text ILIKE ${s}
          OR "target_level" ILIKE ${s}
        )
      `;
      const matchedIds = matched.map((m) => m.id);
      where.id = { in: matchedIds };
    }

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip,
        take,
        orderBy: [{ moduleType: "asc" }, { id: "asc" }],
        include: {
          _count: {
            select: { driveQuestions: true, moduleResponses: true },
          },
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    const itemsWithStats = items.map((q) => ({
      id: q.id,
      moduleType: q.moduleType,
      content: q.content,
      difficulty: q.difficulty,
      targetLevel: q.targetLevel,
      tags: q.tags,
      version: q.version,
      status: q.status,
      role: q.role,
      usageCount: q._count.driveQuestions,
      avgScore: null,
    }));

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

    const {
      moduleType = question.moduleType as ModuleType,
      content = question.content,
      scoringConfig = question.scoringConfig,
      difficulty,
      targetLevel,
      tags,
      status,
      role,
    } = dto;

    this.validateQuestionContent(moduleType, content, scoringConfig);

    if (moduleType === ModuleType.AI_PROMPTING && content) {
      const textToExtract = content.prompt || content.text || "";
      content.extractedKeywords = RakeExtractor.extract(textToExtract);
    }

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
          targetLevel: targetLevel !== undefined ? targetLevel : question.targetLevel,
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
          targetLevel: targetLevel !== undefined ? targetLevel : question.targetLevel,
          tags: tags ?? question.tags,
          status: (status as any) ?? question.status,
          version: { increment: 1 },
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
        const targetModule = (q.moduleType || moduleType) as ModuleType;
        this.validateQuestionContent(targetModule, q.content, q.scoringConfig);

        const created = await tx.question.create({
          data: {
            moduleType: targetModule as any,
            role: q.role ?? "General",
            content: q.content,
            scoringConfig: q.scoringConfig ?? {},
            difficulty: q.difficulty ?? "medium",
            targetLevel: q.targetLevel ?? null,
            tags: q.tags ?? [String(targetModule).toLowerCase()],
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
