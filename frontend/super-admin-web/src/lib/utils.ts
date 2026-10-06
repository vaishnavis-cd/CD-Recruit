import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency minor units to human string (e.g. 5000 INR minor -> ₹50.00).
 */
export function formatCurrencyMinor(amountMinor: number, currency = 'INR'): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

/**
 * Format standard number with commas.
 */
export function formatNumber(val: number): string {
  return new Intl.NumberFormat('en-US').format(val);
}

/**
 * Format ISO datetime string into concise readable date & time.
 */
export function formatDateTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

export function truncateId(id?: string | null, startLen = 8, endLen?: number): string {
  if (!id) return '—';
  const tail = endLen !== undefined ? endLen : startLen;
  if (id.length <= startLen + tail) return id;
  return `${id.slice(0, startLen)}...${id.slice(-tail)}`;
}
