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

// ---------------------------------------------------------------------------
// Questions / Modules
// ---------------------------------------------------------------------------

export enum ModuleType {
  MCQ = "MCQ",
  SQL = "SQL",
  CODING = "CODING",
  AI_PROMPTING = "AI_PROMPTING",
  SIMULATION = "SIMULATION",
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

// ---------------------------------------------------------------------------
// Code Execution (Judge0)
// ---------------------------------------------------------------------------

/**
 * Result from the Judge0 code-execution pipeline.
 * Maps to the Correlation Engine scoring status used on ModuleResponse.
 */
export enum ExecutionStatus {
  PASS = "PASS",
  FAIL = "FAIL",
  ERROR = "ERROR",
  PENDING = "PENDING", // async poll in-flight (Judge0 timeout-then-poll fallback)
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export enum StaffRole {
  RECRUITER = "RECRUITER",
  ADMIN = "ADMIN",
}
