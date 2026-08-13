import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { Department, ExperienceLevel } from "@prisma/client";
import { AllocationEngineService } from "../src/role-template/allocation-engine.service";

const engine = new AllocationEngineService();

console.log("=== PHASE 3 ALLOCATION ENGINE VERIFICATION ===");

const result = engine.allocate({
  department: Department.QA,
  level: ExperienceLevel.FRESHER,
  moduleWeights: {
    MCQ: 0.30,
    CODING: 0.30,
    SQL: 0.20,
    DEBUGGING: 0.10,
    TEST_SCENARIOS: 0.10,
  },
  codingCategorySplit: {
    standard: 0.60,
    automation: 0.40,
  },
});

console.log("Total Time:", result.totalTimeMinutes, "min");
console.log("Simulation Deducted:", result.simulationTimeMinutes, "min");
console.log("Module Pool:", result.modulePoolMinutes, "min");
console.log("\nBreakdown of Allocations:");

for (const alloc of result.allocations) {
  console.log(`- ${alloc.moduleType}${alloc.category ? ' (' + alloc.category + ')' : ''}: Budget ${alloc.timeBudgetMinutes.toFixed(2)} min | Counts: Easy=${alloc.counts.easy}, Med=${alloc.counts.medium}, Hard=${alloc.counts.hard} (Total: ${alloc.counts.total})`);
}

// Verify insufficient questions error throwing
console.log("\nTesting insufficient questions pool validation:");
try {
  engine.allocate({
    department: Department.QA,
    level: ExperienceLevel.FRESHER,
    moduleWeights: { MCQ: 1.0 },
    availableQuestionCounts: {
      MCQ: { easy: 0, medium: 10, hard: 10 },
    },
  });
} catch (err: any) {
  console.log("CONFIRMED: Engine threw explicit error on insufficient question pool:");
  console.log("Exception message:", err.message);
}
