export type TimeGateWindow = "TOO_EARLY" | "BUFFER" | "GRACE" | "EXPIRED";

export interface TimeGateConfig {
  scheduledTime: Date | string | number; // T
  bufferMinutes: number;                 // e.g. 30
  graceMinutes: number;                  // e.g. 20
}

/**
 * Classifies a specific reference time (server time) against a scheduled T and its buffer/grace windows.
 * Relies on date millisecond timestamps to be completely timezone-resilient.
 */
export function resolveTimeWindow(
  checkTime: Date | string | number,
  config: TimeGateConfig
): TimeGateWindow {
  const checkMs = new Date(checkTime).getTime();
  const tMs = new Date(config.scheduledTime).getTime();

  if (isNaN(checkMs) || isNaN(tMs)) {
    throw new Error("Invalid checkTime or scheduledTime provided to resolveTimeWindow");
  }

  const bufferMs = config.bufferMinutes * 60 * 1000;
  const graceMs = config.graceMinutes * 60 * 1000;

  const bufferStartMs = tMs - bufferMs;
  const graceEndMs = tMs + graceMs;

  if (checkMs < bufferStartMs) {
    return "TOO_EARLY";
  }
  if (checkMs >= bufferStartMs && checkMs < tMs) {
    return "BUFFER";
  }
  if (checkMs >= tMs && checkMs <= graceEndMs) {
    return "GRACE";
  }
  return "EXPIRED";
}

/**
 * Formats a time duration into HH:MM:SS for countdown display.
 */
export function formatCountdown(durationMs: number): string {
  if (durationMs <= 0) return "00:00:00";
  const seconds = Math.floor((durationMs / 1000) % 60);
  const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
  const hours = Math.floor(durationMs / (1000 * 60 * 60));

  const pad = (num: number) => String(num).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
