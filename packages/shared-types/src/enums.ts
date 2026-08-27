// Mirrors the Prisma enum definitions — keep in sync with backend/prisma/schema.prisma.
// SessionStatus and ModuleType must match schema.prisma exactly (same values, same casing).

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export enum CvMode {
  FULL = "FULL",
  REDUCED = "REDUCED",
}

/**
 * Full set of session lifecycle states.
 *
 * Transition graph (simplified):
 *   NOT_STARTED → IN_PROGRESS → SUBMITTED → CLOSED
 *                           ↘ DISCONNECTED → IN_PROGRESS (resume) or AUTO_SUBMITTED (timeout / 3rd disconnect)
 *                           ↘ ABANDONED (admin force-close)
 *                           ↘ AUTO_SUBMITTED (deadline passed or max disconnects reached)
 */
export enum SessionStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  DISCONNECTED = "DISCONNECTED",
  AUTO_SUBMITTED = "AUTO_SUBMITTED",
  SUBMITTED = "SUBMITTED",
  CLOSED = "CLOSED",
  ABANDONED = "ABANDONED",
}

export enum Department {
  SOFTWARE_ENGINEERING = "SOFTWARE_ENGINEERING",
  DATA_ENGINEERING = "DATA_ENGINEERING",
  QA = "QA",
  SRE = "SRE",
  SYSOPS = "SYSOPS",
  ITOPS = "ITOPS",
  PMO = "PMO",
  SECOPS = "SECOPS",
}

export enum ExperienceLevel {
  FRESHER = "FRESHER",
  EXPERIENCED = "EXPERIENCED",
}

export enum QuestionCategory {
  ALGORITHM = "ALGORITHM",
  AUTOMATION = "AUTOMATION",
}

export enum AutomationFramework {
  SELENIUM = "SELENIUM",
  PLAYWRIGHT = "PLAYWRIGHT",
}

// ---------------------------------------------------------------------------
// Questions / Modules
// ---------------------------------------------------------------------------

export enum ModuleType {
  MCQ = "MCQ",
  SQL = "SQL",
  CODING = "CODING",
  DEBUGGING = "DEBUGGING",
  AI_PROMPTING = "AI_PROMPTING",
  SIMULATION = "SIMULATION",
  TEST_SCENARIOS = "TEST_SCENARIOS",
  NOSQL = "NOSQL",
}

// ---------------------------------------------------------------------------
// Review / Scoring
// ---------------------------------------------------------------------------

export enum FlagSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum ReviewDecision {
  ADVANCE = "ADVANCE",
  REJECT = "REJECT",
}

export enum InviteStatus {
  PENDING = "PENDING",
  REDEEMED = "REDEEMED",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

export enum FlagDisposition {
  CONFIRMED = "CONFIRMED",
  FALSE_POSITIVE = "FALSE_POSITIVE",
}

export enum DriveStatus {
  DRAFT = "DRAFT",
  SCHEDULED = "SCHEDULED",
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
}

export enum QuestionStatus {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export enum SubmissionType {
  RUN = "RUN",
  SUBMIT = "SUBMIT",
}

export enum ExecutionStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  COMPILATION_ERROR = "COMPILATION_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  TIMEOUT = "TIMEOUT",
  MEMORY_LIMIT = "MEMORY_LIMIT",
  FAILED = "FAILED",
}

export enum SqlExecutionStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  QUERY_ERROR = "QUERY_ERROR",
  TIMEOUT = "TIMEOUT",
  FAILED = "FAILED",
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export enum StaffRole {
  RECRUITER = "RECRUITER",
  ADMIN = "ADMIN",
}

// ---------------------------------------------------------------------------
// Experience Tiering
// ---------------------------------------------------------------------------


export enum CandidateCategory {
  FRESHER = "FRESHER",
  EXPERIENCED = "EXPERIENCED",
}

export enum ExperienceLevelCode {
  FRESHER = "FRESHER",
  LEVEL_1 = "LEVEL_1",
  LEVEL_2 = "LEVEL_2",
  LEVEL_3 = "LEVEL_3",
}

export enum ExperienceTier {
  TIER_0_1 = "0-1",
  TIER_2_5 = "2-5",
  TIER_6_10 = "6-10",
  TIER_11_15 = "11-15",
}

export const EXPERIENCE_TIER_CONFIG = {
  "0-1": {
    code: ExperienceLevelCode.FRESHER,
    tier: "0-1",
    label: "0-1 yrs (Fresher)",
    shortLabel: "0-1 yrs",
    category: CandidateCategory.FRESHER,
    years: "0-1",
  },
  "2-5": {
    code: ExperienceLevelCode.LEVEL_1,
    tier: "2-5",
    label: "2-5 yrs (Level 1)",
    shortLabel: "2-5 yrs",
    category: CandidateCategory.EXPERIENCED,
    years: "2-5",
  },
  "6-10": {
    code: ExperienceLevelCode.LEVEL_2,
    tier: "6-10",
    label: "6-10 yrs (Level 2)",
    shortLabel: "6-10 yrs",
    category: CandidateCategory.EXPERIENCED,
    years: "6-10",
  },
  "11-15": {
    code: ExperienceLevelCode.LEVEL_3,
    tier: "11-15",
    label: "11+ yrs (Level 3)",
    shortLabel: "11+ yrs",
    category: CandidateCategory.EXPERIENCED,
    years: "11+",
  },
} as const;

/**
 * Normalizes any variation of level input string into canonical tier ("0-1", "2-5", "6-10", "11-15").
 * Supports raw resume parsed strings like "7+ experience", "7 years", "3.5 yrs", ranges "3-5 yrs".
 * Returns null if invalid.
 */
export function normalizeExperienceTier(
  input?: string | null,
  category?: CandidateCategory | string,
): { tier: string; code: ExperienceLevelCode; category: CandidateCategory; label: string } | null {
  const normCategory = (category || "").trim().toUpperCase();
  if (!input && normCategory === CandidateCategory.FRESHER) {
    return {
      tier: "0-1",
      code: ExperienceLevelCode.FRESHER,
      category: CandidateCategory.FRESHER,
      label: "0-1 yrs (Fresher)",
    };
  }

  if (!input || !input.trim()) return null;

  const raw = input.trim();
  const cleaned = raw.toLowerCase().replace(/\s+/g, "").replace(/_+/g, "-");

  // 1. Direct tier / alias matching
  if (
    cleaned === "0-1" ||
    cleaned === "0-1yrs" ||
    cleaned === "0-1years" ||
    cleaned === "0-1yr" ||
    cleaned === "0to1" ||
    cleaned === "fresher" ||
    cleaned === "fresh" ||
    cleaned === "freshgraduate" ||
    cleaned === "entry" ||
    cleaned === "intern" ||
    cleaned === "0" ||
    cleaned === "1"
  ) {
    return {
      tier: "0-1",
      code: ExperienceLevelCode.FRESHER,
      category: CandidateCategory.FRESHER,
      label: "0-1 yrs (Fresher)",
    };
  }

  if (
    cleaned === "2-5" ||
    cleaned === "2-5yrs" ||
    cleaned === "2-5years" ||
    cleaned === "2to5" ||
    cleaned === "level-1" ||
    cleaned === "level1" ||
    cleaned === "l1" ||
    cleaned === "junior" ||
    cleaned === "mid" ||
    cleaned === "2" ||
    cleaned === "3" ||
    cleaned === "4" ||
    cleaned === "5"
  ) {
    return {
      tier: "2-5",
      code: ExperienceLevelCode.LEVEL_1,
      category: CandidateCategory.EXPERIENCED,
      label: "2-5 yrs (Level 1)",
    };
  }

  if (
    cleaned === "6-10" ||
    cleaned === "6-10yrs" ||
    cleaned === "6-10years" ||
    cleaned === "6to10" ||
    cleaned === "level-2" ||
    cleaned === "level2" ||
    cleaned === "l2" ||
    cleaned === "senior" ||
    cleaned === "sr" ||
    cleaned === "6" ||
    cleaned === "7" ||
    cleaned === "8" ||
    cleaned === "9" ||
    cleaned === "10"
  ) {
    return {
      tier: "6-10",
      code: ExperienceLevelCode.LEVEL_2,
      category: CandidateCategory.EXPERIENCED,
      label: "6-10 yrs (Level 2)",
    };
  }

  if (
    cleaned === "11-15" ||
    cleaned === "11-15yrs" ||
    cleaned === "11-15years" ||
    cleaned === "11to15" ||
    cleaned === "10+" ||
    cleaned === "11+" ||
    cleaned === "15+" ||
    cleaned === "level-3" ||
    cleaned === "level3" ||
    cleaned === "l3" ||
    cleaned === "lead" ||
    cleaned === "staff" ||
    cleaned === "principal" ||
    cleaned === "architect"
  ) {
    return {
      tier: "11-15",
      code: ExperienceLevelCode.LEVEL_3,
      category: CandidateCategory.EXPERIENCED,
      label: "11+ yrs (Level 3)",
    };
  }

  // 2. Range match (e.g. "3-5 years", "6-8 yrs", "7 to 10 yrs")
  const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const minVal = parseFloat(rangeMatch[1]);
    const maxVal = parseFloat(rangeMatch[2]);
    if (!isNaN(minVal) && !isNaN(maxVal)) {
      const avgVal = (minVal + maxVal) / 2;
      return resolveTierFromNumericYears(avgVal);
    }
  }

  // 3. Single numeric extraction (e.g. "7+ experience", "7 years", "3.5 yrs", "12+ yrs")
  const numMatch = raw.match(/(\d+(?:\.\d+)?)\s*(\+)?\s*(?:years?|yrs?|yr|y|yoe|exp|experience)?/i);
  if (numMatch) {
    let val = parseFloat(numMatch[1]);
    const hasPlus = !!numMatch[2] || raw.includes("+");
    if (!isNaN(val)) {
      if (val === 10 && hasPlus) {
        val = 11;
      }
      return resolveTierFromNumericYears(val);
    }
  }

  return null;
}

function resolveTierFromNumericYears(years: number) {
  if (isNaN(years) || years < 2) {
    return {
      tier: "0-1",
      code: ExperienceLevelCode.FRESHER,
      category: CandidateCategory.FRESHER,
      label: "0-1 yrs (Fresher)",
    };
  }
  if (years < 6) {
    return {
      tier: "2-5",
      code: ExperienceLevelCode.LEVEL_1,
      category: CandidateCategory.EXPERIENCED,
      label: "2-5 yrs (Level 1)",
    };
  }
  if (years < 11) {
    return {
      tier: "6-10",
      code: ExperienceLevelCode.LEVEL_2,
      category: CandidateCategory.EXPERIENCED,
      label: "6-10 yrs (Level 2)",
    };
  }
  return {
    tier: "11-15",
    code: ExperienceLevelCode.LEVEL_3,
    category: CandidateCategory.EXPERIENCED,
    label: "11+ yrs (Level 3)",
  };
}

export const SUPPORTED_CODING_LANGUAGES = ["python", "javascript", "java", "cpp"] as const;
