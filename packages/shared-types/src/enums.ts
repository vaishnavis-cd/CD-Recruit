// Mirrors the Prisma enum definitions — keep in sync with backend/prisma/schema.prisma

export enum CvMode {
  FULL = 'FULL',
  REDUCED = 'REDUCED',
}

export enum SessionStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  GRADED = 'GRADED',
  REVIEWED = 'REVIEWED',
}

export enum ModuleType {
  CODING = 'CODING',
  SIMULATION = 'SIMULATION',
}

export enum FlagSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ReviewDecision {
  ADVANCE = 'ADVANCE',
  REJECT = 'REJECT',
}

export enum ExecutionStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  ERROR = 'ERROR',
}
