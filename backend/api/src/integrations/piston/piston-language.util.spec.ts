import { resolvePistonLanguage } from "./piston-language.util";

describe("PistonLanguageUtil", () => {
  it("should resolve numeric Judge0 language IDs", () => {
    expect(resolvePistonLanguage(71)).toEqual({
      language: "python",
      version: "3.10.0",
      defaultFileName: "main.py",
    });
    expect(resolvePistonLanguage(63)).toEqual({
      language: "javascript",
      version: "18.15.0",
      defaultFileName: "main.js",
    });
    expect(resolvePistonLanguage(62)).toEqual({
      language: "java",
      version: "15.0.2",
      defaultFileName: "Main.java",
    });
    expect(resolvePistonLanguage(54)).toEqual({
      language: "c++",
      version: "10.2.0",
      defaultFileName: "main.cpp",
    });
    expect(resolvePistonLanguage(74)).toEqual({
      language: "typescript",
      version: "18.15.0",
      defaultFileName: "main.ts",
    });
  });

  it("should resolve string language slugs", () => {
    expect(resolvePistonLanguage("python3")).toEqual({
      language: "python",
      version: "3.10.0",
      defaultFileName: "main.py",
    });
    expect(resolvePistonLanguage("node")).toEqual({
      language: "javascript",
      version: "18.15.0",
      defaultFileName: "main.js",
    });
    expect(resolvePistonLanguage("cpp")).toEqual({
      language: "c++",
      version: "10.2.0",
      defaultFileName: "main.cpp",
    });
    expect(resolvePistonLanguage("java")).toEqual({
      language: "java",
      version: "15.0.2",
      defaultFileName: "Main.java",
    });
  });

  it("should default undefined/null to python", () => {
    expect(resolvePistonLanguage(undefined)).toEqual({
      language: "python",
      version: "3.10.0",
      defaultFileName: "main.py",
    });
    expect(resolvePistonLanguage(null)).toEqual({
      language: "python",
      version: "3.10.0",
      defaultFileName: "main.py",
    });
  });

  it("should throw BadRequestException on unsupported language", () => {
    expect(() => resolvePistonLanguage("cobol")).toThrow("Language \"cobol\" is not supported");
  });
});
