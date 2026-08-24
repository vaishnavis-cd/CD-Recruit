import {
  normalizeExperienceTier,
  CandidateCategory,
} from "./experience-tier.util";
import assert from "node:assert";

async function runExperienceTierTests() {
  console.log("Running characterization tests for Experience Tier Normalization...");

  // 1. Canonical codes
  assert.strictEqual(normalizeExperienceTier("0-1")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier("2-5")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("6-10")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("11-15")?.tier, "11-15");
  console.log("  ✔ Canonical tier codes resolve correctly");

  // 2. Common role aliases
  assert.strictEqual(normalizeExperienceTier("fresher")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier("junior")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("level 1")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("level-2")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("senior")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("sr")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("level 3")?.tier, "11-15");
  assert.strictEqual(normalizeExperienceTier("lead")?.tier, "11-15");
  assert.strictEqual(normalizeExperienceTier("principal")?.tier, "11-15");
  console.log("  ✔ Role title and level aliases resolve correctly");

  // 3. Parsed resume strings (Numeric + Keywords)
  const res7Plus = normalizeExperienceTier("7+ experience");
  assert.strictEqual(res7Plus?.tier, "6-10");
  assert.strictEqual(res7Plus?.code, "LEVEL_2");
  assert.strictEqual(res7Plus?.category, CandidateCategory.EXPERIENCED);

  assert.strictEqual(normalizeExperienceTier("7 years")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("7 yrs")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("7.5 years")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("8 yoe")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("9 years of experience")?.tier, "6-10");
  console.log("  ✔ Level 2 (6-10 yrs) parsed resume strings ('7+ experience', '7 years', etc.) resolve correctly");

  // 4. Level 1 (2-5 yrs) parsed strings
  assert.strictEqual(normalizeExperienceTier("3.5 yrs")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("4 years exp")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("2 yrs")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("5 years")?.tier, "2-5");
  console.log("  ✔ Level 1 (2-5 yrs) parsed resume strings ('3.5 yrs', '4 years exp', etc.) resolve correctly");

  // 5. Level 3 (11-15 yrs) parsed strings
  assert.strictEqual(normalizeExperienceTier("12+ years")?.tier, "11-15");
  assert.strictEqual(normalizeExperienceTier("15 yrs exp")?.tier, "11-15");
  assert.strictEqual(normalizeExperienceTier("11+ exp")?.tier, "11-15");
  assert.strictEqual(normalizeExperienceTier("10+ yrs")?.tier, "11-15");
  console.log("  ✔ Level 3 (11-15 yrs) parsed resume strings ('12+ years', '10+ yrs', etc.) resolve correctly");

  // 6. Fresher (0-1 yrs) parsed strings
  assert.strictEqual(normalizeExperienceTier("0.5 years")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier("1 yr")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier("Fresh graduate")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier("0")?.tier, "0-1");
  console.log("  ✔ Fresher (0-1 yrs) parsed resume strings ('0.5 years', '1 yr', etc.) resolve correctly");

  // 7. Ranges
  assert.strictEqual(normalizeExperienceTier("3-5 years")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("3 to 5 yrs")?.tier, "2-5");
  assert.strictEqual(normalizeExperienceTier("6-8 yrs")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("7 to 10 years")?.tier, "6-10");
  assert.strictEqual(normalizeExperienceTier("11-14 yrs")?.tier, "11-15");
  console.log("  ✔ Numeric ranges ('3-5 years', '7 to 10 years', etc.) resolve correctly");

  // 8. Fallback & empty input
  assert.strictEqual(normalizeExperienceTier("", "FRESHER")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier(undefined, "FRESHER")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier(null, "FRESHER")?.tier, "0-1");
  assert.strictEqual(normalizeExperienceTier("", "EXPERIENCED"), null);
  assert.strictEqual(normalizeExperienceTier("invalid-xyz"), null);
  console.log("  ✔ Fallback and error cases behave as expected");

  console.log("\n All 8 test suites for experience tier normalization passed successfully!");
}

runExperienceTierTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

