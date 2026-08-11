import { Injectable, BadRequestException } from "@nestjs/common";
import { Department, ExperienceLevel } from "@prisma/client";

export interface QuestionBenchmark {
  easy: number;
  medium: number;
  hard: number;
}

export const QUESTION_BENCHMARKS: Record<string, QuestionBenchmark> = {
  MCQ: { easy: 1, medium: 2, hard: 3 },
  SQL: { easy: 3, medium: 6, hard: 12 },
  CODING_STANDARD: { easy: 6, medium: 12, hard: 22 },
  CODING_AUTOMATION: { easy: 8, medium: 15, hard: 25 },
  DEBUGGING: { easy: 5, medium: 10, hard: 18 },
  AI_PROMPTING: { easy: 4, medium: 7, hard: 12 },
  TEST_SCENARIOS: { easy: 3, medium: 6, hard: 12 },
};

export const COMPLEXITY_RATIOS: Record<ExperienceLevel, { easy: number; medium: number; hard: number }> = {
  FRESHER: { easy: 0.50, medium: 0.35, hard: 0.15 },
  EXPERIENCED: { easy: 0.15, medium: 0.35, hard: 0.50 },
};

export interface ModuleAllocationResult {
  moduleType: string;
  category?: string;
  timeBudgetMinutes: number;
  counts: {
    easy: number;
    medium: number;
    hard: number;
    total: number;
  };
}

export interface AllocationEngineInput {
  department: Department;
  level: ExperienceLevel;
  moduleWeights: Record<string, number>;
  codingCategorySplit?: { standard: number; automation: number };
  availableQuestionCounts?: Record<string, { easy: number; medium: number; hard: number }>;
}

@Injectable()
export class AllocationEngineService {
  allocate(input: AllocationEngineInput) {
    const totalTimeMinutes = 90;
    let modulePoolMinutes = totalTimeMinutes;

    const isSde = input.department === Department.SOFTWARE_ENGINEERING;
    const hasSimulation = input.moduleWeights["SIMULATION"] !== undefined || input.moduleWeights["CONTEXT_SIMULATION"] !== undefined;

    let simulationTimeMinutes = 0;
    if (isSde || hasSimulation) {
      simulationTimeMinutes = input.level === ExperienceLevel.FRESHER ? 20 : 30;
      modulePoolMinutes -= simulationTimeMinutes;
    }

    const filteredWeights: Record<string, number> = {};
    let totalWeightSum = 0;
    for (const [mod, w] of Object.entries(input.moduleWeights)) {
      if (mod !== "SIMULATION" && mod !== "CONTEXT_SIMULATION") {
        filteredWeights[mod] = w;
        totalWeightSum += w;
      }
    }

    const allocations: ModuleAllocationResult[] = [];
    const ratios = COMPLEXITY_RATIOS[input.level];

    for (const [mod, weight] of Object.entries(filteredWeights)) {
      const normalizedWeight = totalWeightSum > 0 ? weight / totalWeightSum : 0;
      const modTimeBudget = modulePoolMinutes * normalizedWeight;

      if (mod === "CODING" && input.codingCategorySplit) {
        const stdBudget = modTimeBudget * input.codingCategorySplit.standard;
        const autoBudget = modTimeBudget * input.codingCategorySplit.automation;

        allocations.push(
          this.calculateModuleCounts("CODING", "ALGORITHM", stdBudget, QUESTION_BENCHMARKS.CODING_STANDARD, ratios, input.availableQuestionCounts)
        );
        allocations.push(
          this.calculateModuleCounts("CODING", "AUTOMATION", autoBudget, QUESTION_BENCHMARKS.CODING_AUTOMATION, ratios, input.availableQuestionCounts)
        );
      } else {
        const benchmarkKey = mod === "CODING" ? "CODING_STANDARD" : mod;
        const benchmark = QUESTION_BENCHMARKS[benchmarkKey] || QUESTION_BENCHMARKS.MCQ;
        allocations.push(
          this.calculateModuleCounts(mod, undefined, modTimeBudget, benchmark, ratios, input.availableQuestionCounts)
        );
      }
    }

    return {
      totalTimeMinutes,
      simulationTimeMinutes,
      modulePoolMinutes,
      allocations,
    };
  }

  private calculateModuleCounts(
    moduleType: string,
    category: string | undefined,
    timeBudget: number,
    benchmark: QuestionBenchmark,
    ratios: { easy: number; medium: number; hard: number },
    availableCounts?: Record<string, { easy: number; medium: number; hard: number }>
  ): ModuleAllocationResult {
    const easyBudget = timeBudget * ratios.easy;
    const mediumBudget = timeBudget * ratios.medium;
    const hardBudget = timeBudget * ratios.hard;

    const easyCount = Math.floor(easyBudget / benchmark.easy);
    const mediumCount = Math.floor(mediumBudget / benchmark.medium);
    const hardCount = Math.floor(hardBudget / benchmark.hard);

    const poolKey = category ? `${moduleType}_${category}` : moduleType;
    if (availableCounts && availableCounts[poolKey]) {
      const avail = availableCounts[poolKey];
      if (avail.easy < easyCount) {
        throw new BadRequestException(
          `INSUFFICIENT_QUESTIONS: Combination ${poolKey} (EASY) requires ${easyCount} questions, but only ${avail.easy} available.`
        );
      }
      if (avail.medium < mediumCount) {
        throw new BadRequestException(
          `INSUFFICIENT_QUESTIONS: Combination ${poolKey} (MEDIUM) requires ${mediumCount} questions, but only ${avail.medium} available.`
        );
      }
      if (avail.hard < hardCount) {
        throw new BadRequestException(
          `INSUFFICIENT_QUESTIONS: Combination ${poolKey} (HARD) requires ${hardCount} questions, but only ${avail.hard} available.`
        );
      }
    }

    return {
      moduleType,
      category,
      timeBudgetMinutes: timeBudget,
      counts: {
        easy: easyCount,
        medium: mediumCount,
        hard: hardCount,
        total: easyCount + mediumCount + hardCount,
      },
    };
  }
}
