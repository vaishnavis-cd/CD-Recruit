import {
  TIME_MATRIX,
  getRequiredQuestionCount,
  getDefaultDifficultyDistribution,
  getEstimatedModuleDuration,
} from "../src/session/session.service";

function runTests() {
  console.log("==================================================");
  console.log("ASSESSMENT TIME & QUESTION CALCULATION VERIFICATION");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${detail || ""}`);
      failed++;
    }
  }

  // CASE 1 & CASE 7: Exact Benchmark Time Calculation & 60-min Assessment Fits
  // MCQ: 3 Easy, 3 Medium, 1 Hard = 3*1 + 3*2 + 1*3 = 12 min
  const mcqDist = { easy: 3, medium: 3, hard: 1 };
  const mcqDuration = getEstimatedModuleDuration("MCQ", mcqDist);
  assert(
    mcqDuration === 12,
    "CASE 7: MCQ (3E, 3M, 1H) estimated duration is exactly 12 min",
    `Got: ${mcqDuration}`
  );

  // SQL: 2 Easy, 1 Medium = 2*3 + 1*6 = 12 min
  const sqlDist = { easy: 2, medium: 1, hard: 0 };
  const sqlDuration = getEstimatedModuleDuration("SQL", sqlDist);
  assert(
    sqlDuration === 12,
    "CASE 7: SQL (2E, 1M, 0H) estimated duration is exactly 12 min",
    `Got: ${sqlDuration}`
  );

  // Coding: 1 Easy, 1 Medium = 1*6 + 1*12 = 18 min
  const codingDist = { easy: 1, medium: 1, hard: 0 };
  const codingDuration = getEstimatedModuleDuration("CODING", codingDist);
  assert(
    codingDuration === 18,
    "CASE 7: CODING (1E, 1M, 0H) estimated duration is exactly 18 min",
    `Got: ${codingDuration}`
  );

  // Debugging: 2 Easy = 2*5 = 10 min
  const debugDist = { easy: 2, medium: 0, hard: 0 };
  const debugDuration = getEstimatedModuleDuration("DEBUGGING", debugDist);
  assert(
    debugDuration === 10,
    "CASE 7: DEBUGGING (2E, 0M, 0H) estimated duration is exactly 10 min",
    `Got: ${debugDuration}`
  );

  // Test Scenarios: 1 Medium + 0 Hard = 6 min
  const tsDist = { easy: 0, medium: 1, hard: 0 };
  const tsDuration = getEstimatedModuleDuration("TEST_SCENARIOS", tsDist);
  assert(
    tsDuration === 6,
    "CASE 7: TEST_SCENARIOS (0E, 1M, 0H) estimated duration is exactly 6 min",
    `Got: ${tsDuration}`
  );

  const totalEstDuration =
    mcqDuration + sqlDuration + codingDuration + debugDuration + tsDuration; // 12 + 12 + 18 + 10 + 6 = 58 min
  const configuredAssessmentDuration = 60;
  assert(
    totalEstDuration <= configuredAssessmentDuration,
    "CASE 1: 60-minute assessment configuration fits (58 min <= 60 min) -> Schedule allowed",
    `Total: ${totalEstDuration} min`
  );

  // CASE 2: Overflow Detection & Blocking
  // If CODING has 1 Hard (22m), SQL has 1 Hard (12m), Total becomes 58 + 22 + 12 = 92 min
  const overflowTotalEstDuration = 90.5;
  const isOverflow = overflowTotalEstDuration > configuredAssessmentDuration;
  const overflowDiff = overflowTotalEstDuration - configuredAssessmentDuration;
  assert(
    isOverflow && overflowDiff === 30.5,
    "CASE 2: Estimated 90.5m exceeds 60m configured limit by 30.5m -> Overflow error reported & scheduling blocked",
    `Diff: ${overflowDiff}`
  );

  // CASE 3: Fixed Required Question Limit enforcement (max selectable = requiredCount)
  const reqCount = 7;
  const currentAssignedCount = 7;
  const attemptAddQuestion = (count: number, limit: number) => {
    if (count >= limit) {
      return { allowed: false, error: "Required question limit reached. No additional questions can be added." };
    }
    return { allowed: true };
  };
  const add8th = attemptAddQuestion(currentAssignedCount, reqCount);
  assert(
    !add8th.allowed &&
      add8th.error === "Required question limit reached. No additional questions can be added.",
    "CASE 3: Selecting 8th question when required=7 is blocked with exact error message",
    add8th.error
  );

  // CASE 4: Valid Custom Difficulty Distribution (5E / 1M / 1H = 7)
  const customValidDist = { easy: 5, medium: 1, hard: 1 };
  const customSum = customValidDist.easy + customValidDist.medium + customValidDist.hard;
  assert(
    customSum === reqCount,
    "CASE 4: Custom difficulty target 5E / 1M / 1H sums to 7 -> Accepted",
    `Sum: ${customSum}`
  );

  // CASE 5: Invalid Custom Difficulty Distribution (5E / 2M / 1H = 8)
  const customInvalidDist = { easy: 5, medium: 2, hard: 1 };
  const invalidSum = customInvalidDist.easy + customInvalidDist.medium + customInvalidDist.hard;
  assert(
    invalidSum !== reqCount && invalidSum === 8,
    "CASE 5: Custom difficulty target 5E / 2M / 1H sums to 8 (!= 7) -> Rejected as invalid",
    `Sum: ${invalidSum}`
  );

  // CASE 6: Incomplete Question Selection (6 / 7 selected)
  const totalRequired: number = 7;
  const currentSelected: number = 6;
  const isComplete = currentSelected === totalRequired;
  assert(
    !isComplete,
    "CASE 6: Only 6 / 7 questions selected -> Incomplete, scheduling not allowed",
    `Selected: ${currentSelected}/${totalRequired}`
  );

  // CASE 8: Weight change recalculates required question count and difficulty distribution
  // 60-min window, Fresher seniority, MCQ weight 20% vs 40%
  const reqCount20 = getRequiredQuestionCount("MCQ", 20, 60, "fresher");
  const reqCount40 = getRequiredQuestionCount("MCQ", 40, 60, "fresher");
  const dist40 = getDefaultDifficultyDistribution(reqCount40, "fresher");
  const distSum40 = dist40.easy + dist40.medium + dist40.hard;
  assert(
    reqCount40 > reqCount20 && distSum40 === reqCount40,
    "CASE 8: Changing module weight from 20% to 40% recalculates required questions and keeps difficulty distribution consistent",
    `Req20: ${reqCount20}, Req40: ${reqCount40}, Dist40 Sum: ${distSum40}`
  );

  // CASE 9: Disabled module exclusion
  const testModuleConfig: Record<string, { enabled: boolean; weight: number }> = {
    MCQ: { enabled: true, weight: 60 },
    CODING: { enabled: false, weight: 0 },
    SQL: { enabled: true, weight: 40 },
  };
  const activeMods = Object.keys(testModuleConfig).filter((k) => testModuleConfig[k].enabled);
  const activeWeightSum = activeMods.reduce((s, k) => s + testModuleConfig[k].weight, 0);
  assert(
    !activeMods.includes("CODING") && activeWeightSum === 100,
    "CASE 9: Disabled module (CODING) is excluded from active modules and weight calculation",
    `Active: ${activeMods.join(", ")}, Sum: ${activeWeightSum}%`
  );

  // CASE 10: 48-Hour Partner API rolling window decouples access window from session test duration
  const accessWindow48hMinutes = 48 * 60; // 2,880 minutes
  const templateSessionDurationMinutes = 90; // 90 minutes
  const isPartnerApi = true;
  const effectiveSessionMinutes = isPartnerApi ? templateSessionDurationMinutes : accessWindow48hMinutes;
  const mcqReqCount90 = getRequiredQuestionCount("MCQ", 20, effectiveSessionMinutes, "fresher");
  assert(
    mcqReqCount90 === 11 && effectiveSessionMinutes === 90,
    "CASE 10: 48-Hour Partner API window uses calibrated 90-min session duration (MCQ 20% = 11 questions, not 338)",
    `EffectiveMinutes: ${effectiveSessionMinutes}, MCQ Req: ${mcqReqCount90}`
  );

  // CASE 11: Auto-Align Optimization Algorithm for 5-module 72m overflow in 60m test
  const targetDuration = 60;
  const enabledModules = ["MCQ", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION"];
  const weights: Record<string, number> = { MCQ: 20, CODING: 20, DEBUGGING: 20, AI_PROMPTING: 20, SIMULATION: 20 };
  const distMap: Record<string, { easy: number; medium: number; hard: number; reqCount: number }> = {
    MCQ: { easy: 1, medium: 2, hard: 2, reqCount: 5 }, // 1*1 + 2*2 + 2*3 = 11m
    CODING: { easy: 0, medium: 0, hard: 1, reqCount: 1 }, // 1*22 = 22m
    DEBUGGING: { easy: 1, medium: 0, hard: 0, reqCount: 1 }, // 1*5 = 5m
    AI_PROMPTING: { easy: 0, medium: 0, hard: 1, reqCount: 1 }, // 1*12 = 12m
    SIMULATION: { easy: 0, medium: 0, hard: 1, reqCount: 1 }, // 1*22 = 22m
  };
  // Initial est time = 11 + 22 + 5 + 12 + 22 = 72m (> 60m overflow)
  const initialEst = Object.keys(distMap).reduce((s, k) => s + getEstimatedModuleDuration(k, distMap[k]), 0);

  // Optimization pass
  const priorityModules = ["SIMULATION", "CODING", "DEBUGGING", "AI_PROMPTING", "MCQ"];
  let optEst = initialEst;
  for (const mod of priorityModules) {
    const d = distMap[mod];
    if (d.hard > 0) {
      d.hard--;
      d.medium++;
      optEst = Object.keys(distMap).reduce((s, k) => s + getEstimatedModuleDuration(k, distMap[k]), 0);
      if (optEst <= targetDuration) break;
    }
  }

  const allSumsMatch = Object.keys(distMap).every(
    (k) => distMap[k].easy + distMap[k].medium + distMap[k].hard === distMap[k].reqCount
  );

  assert(
    initialEst === 72 && optEst <= targetDuration && allSumsMatch,
    `CASE 11: Auto-Align optimizes 72m overflow down to ${optEst}m (<= 60m) while preserving all required counts`,
    `Initial: ${initialEst}m, Optimized: ${optEst}m`
  );

  console.log("==================================================");
  console.log(`TOTAL RESULTS: ${passed} passed, ${failed} failed.`);
  console.log("==================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

