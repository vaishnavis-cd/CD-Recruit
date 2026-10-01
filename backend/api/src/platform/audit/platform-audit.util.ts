/**
 * Audit Data Sanitization Utility
 *
 * Ensures passwords, password hashes, secrets, JWT tokens, and MFA secrets
 * never enter audit log metadata (Artifact 06 & INV-PII-02).
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwordhash/i,
  /password_hash/i,
  /secret/i,
  /totp/i,
  /token/i,
  /refreshtoken/i,
  /refresh_token/i,
  /challenge/i,
  /apikey/i,
  /api_key/i,
  /jwt/i,
  /authorization/i,
];

// Exempt safe metadata keys that might match patterns (e.g. ticketRef, subjectId)
const SAFE_EXEMPTION_KEYS = new Set([
  "ticketref",
  "ticket_ref",
  "subjectid",
  "subject_id",
  "actorid",
  "actor_id",
  "requestid",
  "request_id",
  "sessionid",
  "session_id",
  "organizationid",
  "organization_id",
  "tenantid",
  "tenant_id",
  "poolid",
  "pool_id",
]);

/**
 * Recursively sanitizes an object or array, masking sensitive values with "[REDACTED]".
 */
export function sanitizeAuditData<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (data instanceof Date) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase();

    // If key is explicitly exempt, keep value (recursively sanitizing children if object)
    if (SAFE_EXEMPTION_KEYS.has(normalizedKey)) {
      sanitized[key] = typeof value === "object" ? sanitizeAuditData(value) : value;
      continue;
    }

    // Check if key matches any sensitive pattern
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));

    if (isSensitive) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
