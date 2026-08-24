import { CandidateCategory as SharedCandidateCategory } from "@cd-recruit/shared-types";

export type ExperienceTierCode = "0-1" | "2-5" | "6-10" | "11-15";

export enum CandidateCategory {
  FRESHER = "FRESHER",
  EXPERIENCED = "EXPERIENCED",
}

export interface NormalizedTierResult {
  tier: ExperienceTierCode;
  code: "FRESHER" | "LEVEL_1" | "LEVEL_2" | "LEVEL_3";
  category: CandidateCategory;
  label: string;
  shortLabel: string;
}

export const VALID_EXPERIENCE_TIERS: Record<ExperienceTierCode, NormalizedTierResult> = {
  "0-1": {
    tier: "0-1",
    code: "FRESHER",
    category: CandidateCategory.FRESHER,
    label: "0-1 yrs (Fresher)",
    shortLabel: "0-1 yrs",
  },
  "2-5": {
    tier: "2-5",
    code: "LEVEL_1",
    category: CandidateCategory.EXPERIENCED,
    label: "2-5 yrs (Level 1)",
    shortLabel: "2-5 yrs",
  },
  "6-10": {
    tier: "6-10",
    code: "LEVEL_2",
    category: CandidateCategory.EXPERIENCED,
    label: "6-10 yrs (Level 2)",
    shortLabel: "6-10 yrs",
  },
  "11-15": {
    tier: "11-15",
    code: "LEVEL_3",
    category: CandidateCategory.EXPERIENCED,
    label: "11-15 yrs (Level 3)",
    shortLabel: "11-15 yrs",
  },
};

/**
 * Fast string normalization map for O(1) alias lookup
 */
const TIER_LOOKUP_MAP: Record<string, ExperienceTierCode> = {
  "0-1": "0-1",
  "0-1yrs": "0-1",
  "0-1years": "0-1",
  "0to1": "0-1",
  "0-1yr": "0-1",
  "fresher": "0-1",
  "fresh": "0-1",
  "freshgraduate": "0-1",
  "entry": "0-1",
  "intern": "0-1",
  "0": "0-1",
  "1": "0-1",

  "2-5": "2-5",
  "2-5yrs": "2-5",
  "2-5years": "2-5",
  "2to5": "2-5",
  "level-1": "2-5",
  "level1": "2-5",
  "l1": "2-5",
  "junior": "2-5",
  "mid": "2-5",
  "2": "2-5",
  "3": "2-5",
  "4": "2-5",
  "5": "2-5",

  "6-10": "6-10",
  "6-10yrs": "6-10",
  "6-10years": "6-10",
  "6to10": "6-10",
  "level-2": "6-10",
  "level2": "6-10",
  "l2": "6-10",
  "senior": "6-10",
  "sr": "6-10",
  "6": "6-10",
  "7": "6-10",
  "8": "6-10",
  "9": "6-10",
  "10": "6-10",

  "11-15": "11-15",
  "11-15yrs": "11-15",
  "11-15years": "11-15",
  "11to15": "11-15",
  "10+": "11-15",
  "11+": "11-15",
  "15+": "11-15",
  "level-3": "11-15",
  "level3": "11-15",
  "l3": "11-15",
  "lead": "11-15",
  "staff": "11-15",
  "principal": "11-15",
  "architect": "11-15",
};

/**
 * Resolves canonical NormalizedTierResult from a numeric years value.
 * - < 2 yrs: 0-1 (Fresher)
 * - 2 to 5.9 yrs: 2-5 (Level 1)
 * - 6 to 10.9 yrs: 6-10 (Level 2)
 * - >= 11 yrs: 11-15 (Level 3)
 */
export function resolveTierFromYears(years: number): NormalizedTierResult {
  if (isNaN(years) || years < 2) {
    return VALID_EXPERIENCE_TIERS["0-1"];
  }
  if (years < 6) {
    return VALID_EXPERIENCE_TIERS["2-5"];
  }
  if (years < 11) {
    return VALID_EXPERIENCE_TIERS["6-10"];
  }
  return VALID_EXPERIENCE_TIERS["11-15"];
}

/**
 * Normalizes input string (e.g. "2-5", "LEVEL_1", "7+ experience", "7 years", "3.5 yrs")
 * into canonical NormalizedTierResult.
 * If input is missing/empty and category is FRESHER, returns 0-1 tier.
 */
export function normalizeExperienceTier(
  input?: string | null,
  categoryHint?: string | null,
): NormalizedTierResult | null {
  const normCategory = (categoryHint || "").trim().toUpperCase();
  const isFresherCategory = normCategory === "FRESHER";

  if (!input || !input.trim()) {
    if (isFresherCategory) {
      return VALID_EXPERIENCE_TIERS["0-1"];
    }
    return null;
  }

  const raw = input.trim();
  const cleaned = raw.toLowerCase().replace(/\s+/g, "").replace(/_+/g, "-");

  // 1. Direct dictionary match
  const matchedTier = TIER_LOOKUP_MAP[cleaned];
  if (matchedTier && VALID_EXPERIENCE_TIERS[matchedTier]) {
    return VALID_EXPERIENCE_TIERS[matchedTier];
  }

  // 2. Range match (e.g. "3-5 years", "3 to 5 yrs", "6-8 yrs", "7 - 10 yrs")
  const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[2]);
    if (!isNaN(minVal) && !isNaN(maxVal)) {
      const avgVal = (minVal + maxVal) / 2;
      return resolveTierFromYears(avgVal);
    }
  }

  // 3. Single numeric extraction with keywords (e.g. "7+ experience", "7 years", "3.5 yrs", "12+ yrs exp", "8 yoe")
  const numMatch = raw.match(/(\d+(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?|yr|y|yoe|exp|experience)?/i);
  if (numMatch) {
    let val = parseFloat(numMatch[1]);
    const hasPlus = !!numMatch[2] || raw.includes("+");
    if (!isNaN(val)) {
      if (val === 10 && hasPlus) {
        val = 11;
      }
      return resolveTierFromYears(val);
    }
  }

  return null;
}

/**
 * Normalizes category ("FRESHER" | "EXPERIENCED").
 * Defaults to FRESHER if null/undefined.
 */
export function normalizeCategory(categoryOrLevel?: string | null): CandidateCategory {
  const raw = (categoryOrLevel || "").trim().toUpperCase();
  if (raw === "EXPERIENCED" || raw === "EXP" || raw === "LEVEL_1" || raw === "LEVEL_2" || raw === "LEVEL_3") {
    return CandidateCategory.EXPERIENCED;
  }
  return CandidateCategory.FRESHER;
}
