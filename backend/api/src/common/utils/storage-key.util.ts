import * as crypto from 'crypto';

export interface BuildEvidenceKeyParams {
  clientSlug?: string | null;
  candidateId: string;
  candidateName?: string | null;
  sessionId: string;
  eventType: string;
  eventId?: string | null;
  timestamp?: Date | number | string | null;
  extension?: string;
}

/**
 * Extracts the candidate's first name from a full name string.
 * e.g. "Priya Sharma" -> "Priya", "John Doe" -> "John"
 */
export function extractFirstName(fullName?: string | null): string {
  if (!fullName || typeof fullName !== 'string') return 'unnamed';
  const trimmed = fullName.trim();
  if (!trimmed) return 'unnamed';
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || 'unnamed';
}

/**
 * Slugifies human-readable strings (e.g. candidate first names, organization slugs).
 * Lowercases, strips non-alphanumeric/hyphen characters, collapses whitespace/hyphens,
 * and prevents path-traversal inputs ('../', '/', '\\').
 */
export function slugify(input?: string | null, fallback = 'unnamed', maxLength = 40): string {
  if (!input || typeof input !== 'string') {
    return fallback;
  }

  // 1. Remove path traversal indicators and directory separators
  let cleaned = input.replace(/[\/\\]/g, '-').replace(/\.\./g, '');

  // 2. Normalize unicode (e.g. accents) to ascii where possible
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 3. Lowercase & strip everything except lowercase alphanumeric and hyphens/spaces
  cleaned = cleaned.toLowerCase().replace(/[^a-z0-9\s-]/g, '');

  // 4. Collapse spaces and hyphens into a single hyphen
  cleaned = cleaned.replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '');

  if (!cleaned) {
    return fallback;
  }

  return cleaned.slice(0, maxLength);
}

/**
 * Converts a ProctoringEventType enum or event string to a clean URL-friendly slug.
 * e.g. "MULTIPLE_FACES" -> "multiple-faces"
 */
export function slugifyEventType(eventType: string): string {
  if (!eventType) return 'event';
  return eventType.toLowerCase().replace(/_/g, '-');
}

/**
 * Formats a Date object to readable UTC ISO format YYYY-MM-DD_HH-MM-SS.
 * e.g. "2026-07-23_09-16-01"
 */
export function formatReadableTimestamp(ts?: Date | number | string | null): string {
  const date = ts ? new Date(ts) : new Date();
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  const yyyy = validDate.getUTCFullYear();
  const mm = String(validDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(validDate.getUTCDate()).padStart(2, '0');
  const hh = String(validDate.getUTCHours()).padStart(2, '0');
  const min = String(validDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(validDate.getUTCSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

/**
 * Single centralized function to build evidence keys with clean, organized filename convention.
 *
 * Folder Hierarchy:
 *   clientSlug / candidateId_candidateFirstName / eventType / filename.webm
 *
 * Filename Convention:
 *   YYYY-MM-DD_HH-MM-SS_session-<shortSessionId>_event-<shortEventId>.webm
 *
 * Example:
 *   acme-corp / bf6201db_priya / phone-detected / 2026-07-23_09-16-01_session-0973d8a7_event-0973d8a7.webm
 */
export function buildEvidenceKey(params: BuildEvidenceKeyParams): string {
  const clientSlug = slugify(params.clientSlug, 'default-org', 30);
  
  const firstName = extractFirstName(params.candidateName);
  const firstNameSlug = slugify(firstName, 'unnamed', 30);

  const candidateIdPrefix = (params.candidateId || 'cand').slice(0, 8);
  const eventTypeSlug = slugifyEventType(params.eventType);
  
  const rawSessionId = params.sessionId || 'session';
  const sessionIdShort = rawSessionId.slice(0, 8);
  
  const timestampStr = formatReadableTimestamp(params.timestamp);

  const rawEventId = params.eventId || crypto.randomUUID();
  const cleanEventId = rawEventId.replace(/^(evt_)+/i, '');
  const eventIdShort = cleanEventId.slice(0, 8);
  const ext = params.extension || 'webm';

  return `${clientSlug}/${candidateIdPrefix}_${firstNameSlug}/${eventTypeSlug}/${timestampStr}_session-${sessionIdShort}_event-${eventIdShort}.${ext}`;
}
