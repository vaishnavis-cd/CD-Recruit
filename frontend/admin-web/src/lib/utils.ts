import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats drive names for clean display across admin interfaces.
 * Converts legacy format "[REQ:REQ-2026-ENG-003] Senior Full-Stack Sprint (P)"
 * or "[Partner:ID:REQ-2026-ENG-003] Senior Full-Stack Sprint (P)"
 * into "Senior Full-Stack Sprint (P) (REQ-2026-ENG-003)".
 */
export function formatDriveName(name?: string | null): string {
  if (!name) return "";
  const trimmed = name.trim();

  const match = trimmed.match(/^\[(?:Partner:[^:]+:|REQ:)([^\]]+)\]\s*(.+)$/i);
  if (match) {
    const reqRef = match[1].trim();
    const title = match[2].trim();
    if (title.includes(`(${reqRef})`)) return title;
    return `${title} (${reqRef})`;
  }

  return trimmed;
}

/**
 * Formats ISO date-time strings into clear, human-readable local timestamps.
 * e.g., "Aug 25, 2026, 2:45 PM"
 */
export function formatTimestamp(dateStr?: string | Date | null): string {
  if (!dateStr) return "N/A";
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Calculates and formats duration between startedAt and endedAt.
 * e.g., "45m 20s" or "1h 15m"
 */
export function formatDuration(startedAt?: string | Date | null, endedAt?: string | Date | null): string {
  if (!startedAt) return "N/A";
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const end = endedAt ? (typeof endedAt === "string" ? new Date(endedAt) : endedAt) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "N/A";

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const mins = Math.floor((diffSecs % 3600) / 60);
  const secs = diffSecs % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}
