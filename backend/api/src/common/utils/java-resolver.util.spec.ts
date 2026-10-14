import { resolveJavaFileName } from "./java-resolver.util";

describe("resolveJavaFileName", () => {
  it("defaults to Main.java for standard public class Main", () => {
    const code = "public class Main { public static void main(String[] args) {} }";
    const res = resolveJavaFileName(code);
    expect(res.fileName).toBe("Main.java");
    expect(res.sanitizedCode).toContain("public class Main");
  });

  it("resolves Solution.java for public class Solution", () => {
    const code = "public class Solution { public static void main(String[] args) {} }";
    const res = resolveJavaFileName(code);
    expect(res.fileName).toBe("Solution.java");
  });

  it("handles public final class CustomClass", () => {
    const code = "public final class CustomClass { public static void main(String[] args) {} }";
    const res = resolveJavaFileName(code);
    expect(res.fileName).toBe("CustomClass.java");
  });

  it("handles public abstract class Base", () => {
    const code = "public abstract class Base { public static void main(String[] args) {} }";
    const res = resolveJavaFileName(code);
    expect(res.fileName).toBe("Base.java");
  });

  it("strips package declarations to avoid package path execution mismatch", () => {
    const code = `
package com.candidate.test;

import java.util.*;

public class Main {
    public static void main(String[] args) {}
}
`;
    const res = resolveJavaFileName(code);
    expect(res.fileName).toBe("Main.java");
    expect(res.sanitizedCode).not.toContain("package com.candidate.test;");
    expect(res.sanitizedCode).toContain("public class Main");
  });

  it("defaults to Main.java if no public class is declared", () => {
    const code = "class Helper { void run() {} }";
    const res = resolveJavaFileName(code);
    expect(res.fileName).toBe("Main.java");
  });
});
