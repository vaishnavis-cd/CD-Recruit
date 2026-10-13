import { normalizeOutput } from "./comparator.util";

describe("normalizeOutput", () => {
  it("trims and strips all internal whitespace", () => {
    expect(normalizeOutput("  hello   world  ")).toBe("helloworld");
    expect(normalizeOutput("hello\nworld\t\r")).toBe("helloworld");
  });

  it("converts to lowercase", () => {
    expect(normalizeOutput("Hello WORLD")).toBe("helloworld");
  });

  it("handles empty and null strings safely", () => {
    expect(normalizeOutput("")).toBe("");
    expect(normalizeOutput(null as any)).toBe("");
    expect(normalizeOutput(undefined as any)).toBe("");
  });

  it("normalizes array string representations", () => {
    expect(normalizeOutput("[0, 1]")).toBe("[0,1]");
    expect(normalizeOutput("[ 0 ,   1 ]")).toBe("[0,1]");
  });
});
