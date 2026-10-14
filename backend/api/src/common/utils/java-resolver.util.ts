/**
 * Inspects candidate Java source code, strips package declarations to avoid package mismatch in assessment sandboxes,
 * extracts public class name (including final/abstract modifiers), and resolves appropriate filename.
 * Defaults to "Main.java".
 */
export function resolveJavaFileName(sourceCode: string): { fileName: string; sanitizedCode: string } {
  if (!sourceCode) {
    return { fileName: "Main.java", sanitizedCode: "" };
  }

  // Strip package declaration (e.g. package com.example;) as sandbox executes in default root package
  const sanitizedCode = sourceCode.replace(/^\s*package\s+[^;]+;\s*/m, "");

  // Match: public class Foo, public final class Foo, public abstract class Foo
  const match = sanitizedCode.match(/public\s+(?:final\s+|abstract\s+)*class\s+([A-Za-z0-9_]+)/);
  const fileName = match && match[1] ? `${match[1]}.java` : "Main.java";

  return { fileName, sanitizedCode };
}
