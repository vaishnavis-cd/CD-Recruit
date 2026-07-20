export { SubmissionType, ExecutionStatus } from "@cd-recruit/shared-types";

export interface CodingTestCase {
  input: string;
  expectedOutput: string;
  label?: string;
  /** When true this test case is not shown to the candidate; only pass/fail is returned. */
  isHidden?: boolean;
}

export interface CodingQuestionContentJson {
  prompt: string;
  starterCode: Record<string, string>;
  /**
   * All test cases for the question.
   * isHidden: false (or omitted) → sample/visible — used by both Run and Submit.
   * isHidden: true → hidden — used only by Submit.
   */
  testCases: CodingTestCase[];
  /**
   * @deprecated Use testCases with isHidden: true instead.
   * Kept for backwards-compatibility with older seed data.
   */
  hiddenTests?: Array<{ input: string; expectedOutput: string; label?: string }>;
  constraints?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
  timeLimit?: number; // in seconds
  memoryLimit?: number; // in KB
}
