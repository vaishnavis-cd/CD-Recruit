import { ExecutionStatus } from "@cd-recruit/shared-types";

// Judge0 numeric status IDs
export const JUDGE0_STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  SIGSEGV: 7,
  SIGXFSZ: 8,
  SIGFPE: 9,
  SIGABRT: 10,
  NZEC: 11,
  OTHER_RUNTIME_ERROR: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
};

export const JUDGE0_POLLING = {
  INTERVAL_MS: 2000, // 2 seconds
  MAX_ATTEMPTS: 15,
};
