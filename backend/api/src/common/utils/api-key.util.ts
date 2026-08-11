import * as crypto from "crypto";

/**
 * Computes deterministic SHA-256 hash of a raw API key for secure database storage.
 */
export function hashApiKey(apiKey: string): string {
  if (!apiKey) return "";
  return crypto.createHash("sha256").update(apiKey.trim()).digest("hex");
}
