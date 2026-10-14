/**
 * Normalizes stdout and expected output for deterministic whitespace- and case-insensitive comparison.
 * Replaces all whitespace sequences with empty string, trims, and converts to lowercase.
 */
export function normalizeOutput(str: string): string {
  if (!str) return "";
  return str.replace(/\s+/g, "").trim().toLowerCase();
}
