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
