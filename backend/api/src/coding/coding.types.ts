export { SubmissionType, ExecutionStatus } from "@cd-recruit/shared-types";

export interface CodingQuestionContentJson {
  prompt: string;
  starterCode: Record<string, string>;
  testCases: Array<{ input: string; expectedOutput: string; label?: string }>;
  hiddenTests?: Array<{ input: string; expectedOutput: string }>;
  constraints?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
  timeLimit?: number; // in seconds
  memoryLimit?: number; // in KB
}
