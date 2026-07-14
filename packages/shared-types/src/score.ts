export interface Score {
  compositeScore: number;
  moduleScores: Record<string, number>;
  sayDoConsistencyScore: number;
  aiConfidence: number;
}
