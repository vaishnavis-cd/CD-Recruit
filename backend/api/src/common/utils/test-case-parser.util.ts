import { SubmissionType } from "@cd-recruit/shared-types";

export interface ParsedTestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  label: string;
}

export type TestCaseSubmissionType = "run" | "submit" | "RUN" | "SUBMIT" | SubmissionType;

/**
 * Extracts and maps visible and hidden test cases from question content payload.
 */
export function getQuestionTestCases(
  content: any,
  type: TestCaseSubmissionType,
): ParsedTestCase[] {
  let list: ParsedTestCase[] = [];

  if (Array.isArray(content?.visibleTestCases)) {
    list = content.visibleTestCases.map((tc: any, i: number) => ({
      input: tc.input || "",
      expectedOutput: tc.expectedOutput || "",
      isHidden: false,
      label: tc.label || `Visible Test Case ${i + 1}`,
    }));
  } else if (Array.isArray(content?.testCases)) {
    list = content.testCases
      .filter((tc: any) => !tc.isHidden)
      .map((tc: any, i: number) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: false,
        label: tc.label || `Visible Test Case ${i + 1}`,
      }));
  }

  const isSubmit = String(type).toLowerCase() === "submit" || type === SubmissionType.SUBMIT;
  if (isSubmit) {
    const rawHidden = content?.hiddenTestCases || content?.hiddenTests || [];
    if (Array.isArray(rawHidden) && rawHidden.length > 0) {
      const hiddenMapped = rawHidden.map((tc: any, i: number) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: true,
        label: tc.label || `Hidden Test Case ${i + 1}`,
      }));
      list = [...list, ...hiddenMapped];
    } else if (Array.isArray(content?.testCases)) {
      const hiddenMapped = content.testCases
        .filter((tc: any) => tc.isHidden)
        .map((tc: any, i: number) => ({
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          isHidden: true,
          label: tc.label || `Hidden Test Case ${i + 1}`,
        }));
      list = [...list, ...hiddenMapped];
    }
  }

  return list;
}
