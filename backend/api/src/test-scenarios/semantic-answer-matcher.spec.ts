import { SemanticAnswerMatcher } from "./semantic-answer-matcher";

describe("SemanticAnswerMatcher", () => {
  it("should handle exact matches and basic differences", () => {
    const expected = "Clarify or reproduce the issue before coding.";
    
    // Case difference
    let res = SemanticAnswerMatcher.matchAnswer("clarify or reproduce the issue before coding", expected);
    expect(res.score).toBe(100);

    // Punctuation difference
    res = SemanticAnswerMatcher.matchAnswer("Clarify or reproduce the issue before coding!!!", expected);
    expect(res.score).toBe(100);

    res = SemanticAnswerMatcher.matchAnswer("Clarify, or reproduce the issue before coding.", expected);
    expect(res.score).toBe(100);
  });

  it("should handle slash and hyphen normalizations cleanly (preserves words)", () => {
    const expected = "Direct behavior plus affected callers/regression paths.";
    
    // Candidate with slashes
    let res = SemanticAnswerMatcher.matchAnswer("direct behavior plus affected callers/regression paths", expected);
    expect(res.score).toBe(100);

    // Candidate with spacing or punctuation differences
    res = SemanticAnswerMatcher.matchAnswer("Direct behavior plus affected callers, regression paths.", expected);
    expect(res.score).toBe(100);
  });

  it("should handle singular/plural and morphological variations", () => {
    const expected = "Run tests on all affected callers.";
    
    // Singular forms
    let res = SemanticAnswerMatcher.matchAnswer("run test on all affected caller", expected);
    expect(res.score).toBe(100);
  });

  it("should resolve synonyms and semantic equivalents", () => {
    const expected = "Clarify or reproduce the issue before coding.";
    
    // First reproduce the problem and understand the failure before implementing a fix
    let res = SemanticAnswerMatcher.matchAnswer("First reproduce the problem and understand the failure before implementing a fix", expected);
    expect(res.score).toBeGreaterThanOrEqual(80);

    // Verify changed behavior and test all impacted callers
    const expected2 = "Run regression tests for affected callers.";
    res = SemanticAnswerMatcher.matchAnswer("Verify the changed behavior and test all impacted callers.", expected2);
    expect(res.score).toBeGreaterThanOrEqual(80);
  });

  it("should award partial credit correctly", () => {
    const expected = "Reproduce the issue, identify the root cause, implement the fix, and run regression tests.";
    
    // Partial coverage
    let res = SemanticAnswerMatcher.matchAnswer("Reproduce the issue and implement the fix.", expected);
    expect(res.score).toBeGreaterThanOrEqual(40);
    expect(res.score).toBeLessThan(100);

    // Incorrect answer
    res = SemanticAnswerMatcher.matchAnswer("Ignore the issue and deploy the change.", expected);
    expect(res.score).toBe(0);
  });

  it("should protect against negation", () => {
    const expected = "Do not deploy without testing.";
    
    // Opposite meaning
    let res = SemanticAnswerMatcher.matchAnswer("Deploy without testing.", expected);
    expect(res.score).toBe(0);
  });

  it("should keep distinct technical terms separate", () => {
    const expected = "Use authentication.";
    
    // Unrelated tech term
    let res = SemanticAnswerMatcher.matchAnswer("Use authorization.", expected);
    expect(res.score).toBe(0);
  });
});
