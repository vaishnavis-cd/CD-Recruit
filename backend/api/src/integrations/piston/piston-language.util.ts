import { BadRequestException } from "@nestjs/common";

export interface PistonLanguageTarget {
  language: string;
  version: string;
  defaultFileName: string;
}

export const PISTON_LANGUAGE_TARGETS: Record<string, PistonLanguageTarget> = {
  python: {
    language: "python",
    version: "3.10.0",
    defaultFileName: "main.py",
  },
  javascript: {
    language: "javascript",
    version: "18.15.0",
    defaultFileName: "main.js",
  },
  typescript: {
    language: "typescript",
    version: "18.15.0",
    defaultFileName: "main.ts",
  },
  java: {
    language: "java",
    version: "15.0.2",
    defaultFileName: "Main.java",
  },
  "c++": {
    language: "c++",
    version: "10.2.0",
    defaultFileName: "main.cpp",
  },
  c: {
    language: "c",
    version: "10.2.0",
    defaultFileName: "main.c",
  },
  go: {
    language: "go",
    version: "*",
    defaultFileName: "main.go",
  },
};

/**
 * Maps numeric Judge0 language ID or language string to Piston language target specification.
 */
export function resolvePistonLanguage(languageIdOrName: number | string | undefined | null): PistonLanguageTarget {
  if (languageIdOrName === undefined || languageIdOrName === null) {
    return PISTON_LANGUAGE_TARGETS.python;
  }

  // Handle numeric Judge0 IDs
  if (typeof languageIdOrName === "number") {
    switch (languageIdOrName) {
      case 71: // Python 3
        return PISTON_LANGUAGE_TARGETS.python;
      case 63: // JavaScript
        return PISTON_LANGUAGE_TARGETS.javascript;
      case 74: // TypeScript
        return PISTON_LANGUAGE_TARGETS.typescript;
      case 62: // Java
        return PISTON_LANGUAGE_TARGETS.java;
      case 54: // C++ (GCC)
        return PISTON_LANGUAGE_TARGETS["c++"];
      case 50: // C (GCC)
        return PISTON_LANGUAGE_TARGETS.c;
      case 60: // Go
        return PISTON_LANGUAGE_TARGETS.go;
      default:
        return PISTON_LANGUAGE_TARGETS.python;
    }
  }

  const clean = languageIdOrName.toLowerCase().trim();

  if (clean.includes("python") || clean === "py") return PISTON_LANGUAGE_TARGETS.python;
  if (clean.includes("javascript") || clean === "js" || clean.includes("node")) return PISTON_LANGUAGE_TARGETS.javascript;
  if (clean.includes("typescript") || clean === "ts") return PISTON_LANGUAGE_TARGETS.typescript;
  if (clean.includes("java") && !clean.includes("javascript")) return PISTON_LANGUAGE_TARGETS.java;
  if (clean.includes("c++") || clean.includes("cpp")) return PISTON_LANGUAGE_TARGETS["c++"];
  if (clean === "c" || clean.startsWith("c ")) return PISTON_LANGUAGE_TARGETS.c;
  if (clean.includes("go")) return PISTON_LANGUAGE_TARGETS.go;

  const supported = ["python", "javascript", "typescript", "java", "c++", "c", "go"];
  throw new BadRequestException(
    `Language "${languageIdOrName}" is not supported by Piston sandbox. Supported: ${supported.join(", ")}`,
  );
}

/**
 * Returns consistent numeric ID for database storage compatibility (zero schema change).
 */
export function resolveLanguageNumericId(languageIdOrName: number | string | undefined | null): number {
  if (typeof languageIdOrName === "number") return languageIdOrName;
  if (!languageIdOrName) return 71;
  const clean = languageIdOrName.toLowerCase().trim();
  if (clean.includes("python") || clean === "py") return 71;
  if (clean.includes("javascript") || clean === "js" || clean.includes("node")) return 63;
  if (clean.includes("typescript") || clean === "ts") return 74;
  if (clean.includes("java") && !clean.includes("javascript")) return 62;
  if (clean.includes("c++") || clean.includes("cpp")) return 54;
  if (clean === "c" || clean.startsWith("c ")) return 50;
  if (clean.includes("go")) return 60;
  return 71;
}
