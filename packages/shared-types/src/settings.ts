export interface TimeMatrixDifficulty {
  EASY: number;
  MEDIUM: number;
  HARD: number;
}

export type TimeMatrixConfig = Record<string, TimeMatrixDifficulty>;

export interface SeniorityRatioDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export type SeniorityRatiosConfig = Record<string, SeniorityRatioDistribution>;

export interface ProctoringThresholdsConfig {
  faceThreshold: number;
  nameThreshold: number;
  lookingAwayThresholdMs: number;
  voiceSensitivityThreshold: number;
  voiceSustainedMs: number;
  cooldowns: Record<string, number>;
}

export interface PublicProctoringConfig {
  lookingAwayThresholdMs: number;
  cooldowns: Record<string, number>;
}
