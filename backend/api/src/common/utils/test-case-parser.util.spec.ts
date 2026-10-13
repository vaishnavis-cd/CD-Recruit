import { getQuestionTestCases } from "./test-case-parser.util";
import { SubmissionType } from "@cd-recruit/shared-types";

describe("TestCaseParserUtil", () => {
  it("should parse visibleTestCases for run request", () => {
    const content = {
      visibleTestCases: [
        { input: "1\n2", expectedOutput: "3", label: "Example 1" },
        { input: "4\n5", expectedOutput: "9" },
      ],
      hiddenTestCases: [{ input: "10\n20", expectedOutput: "30" }],
    };

    const result = getQuestionTestCases(content, "run");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      input: "1\n2",
      expectedOutput: "3",
      isHidden: false,
      label: "Example 1",
    });
    expect(result[1]).toEqual({
      input: "4\n5",
      expectedOutput: "9",
      isHidden: false,
      label: "Visible Test Case 2",
    });
  });

  it("should parse both visible and hidden test cases for submit request (SubmissionType.SUBMIT)", () => {
    const content = {
      visibleTestCases: [{ input: "1", expectedOutput: "1" }],
      hiddenTestCases: [
        { input: "2", expectedOutput: "4", label: "Edge Case" },
        { input: "3", expectedOutput: "9" },
      ],
    };

    const result = getQuestionTestCases(content, SubmissionType.SUBMIT);
    expect(result).toHaveLength(3);
    expect(result[0].isHidden).toBe(false);
    expect(result[1]).toEqual({
      input: "2",
      expectedOutput: "4",
      isHidden: true,
      label: "Edge Case",
    });
    expect(result[2]).toEqual({
      input: "3",
      expectedOutput: "9",
      isHidden: true,
      label: "Hidden Test Case 2",
    });
  });

  it("should handle alternate hiddenTests field name", () => {
    const content = {
      visibleTestCases: [{ input: "1", expectedOutput: "1" }],
      hiddenTests: [{ input: "100", expectedOutput: "100" }],
    };

    const result = getQuestionTestCases(content, "submit");
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      input: "100",
      expectedOutput: "100",
      isHidden: true,
      label: "Hidden Test Case 1",
    });
  });

  it("should fall back to unified testCases array with isHidden flags", () => {
    const content = {
      testCases: [
        { input: "1", expectedOutput: "1", isHidden: false, label: "TC 1" },
        { input: "2", expectedOutput: "2", isHidden: true, label: "TC 2" },
      ],
    };

    const runResult = getQuestionTestCases(content, SubmissionType.RUN);
    expect(runResult).toHaveLength(1);
    expect(runResult[0].isHidden).toBe(false);

    const submitResult = getQuestionTestCases(content, "SUBMIT");
    expect(submitResult).toHaveLength(2);
    expect(submitResult[0].isHidden).toBe(false);
    expect(submitResult[1].isHidden).toBe(true);
    expect(submitResult[1].label).toBe("TC 2");
  });

  it("should handle empty or null content safely", () => {
    expect(getQuestionTestCases(null, "run")).toEqual([]);
    expect(getQuestionTestCases(undefined, "submit")).toEqual([]);
    expect(getQuestionTestCases({}, "run")).toEqual([]);
    expect(getQuestionTestCases({}, SubmissionType.SUBMIT)).toEqual([]);
  });

  it("should handle missing inputs or outputs gracefully with empty strings", () => {
    const content = {
      visibleTestCases: [{ label: "Empty TC" }],
      hiddenTestCases: [{}],
    };

    const result = getQuestionTestCases(content, "submit");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      input: "",
      expectedOutput: "",
      isHidden: false,
      label: "Empty TC",
    });
    expect(result[1]).toEqual({
      input: "",
      expectedOutput: "",
      isHidden: true,
      label: "Hidden Test Case 1",
    });
  });
});
