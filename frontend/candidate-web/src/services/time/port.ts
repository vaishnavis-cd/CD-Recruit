// PORT: TimeAuthorityPort
// THE MOST IMPORTANT PORT — no component ever calls Date.now() / new Date()
// for gating or countdown logic. All time goes through this port.

export interface TimeAuthorityPort {
  /** Returns the current server-authoritative time as a Unix timestamp (ms). */
  getServerNow(): number

  /**
   * Subscribe to a 1-second tick with the current server time.
   * Returns an unsubscribe function.
   */
  subscribe(callback: (nowMs: number) => void): () => void

  /**
   * DEV ONLY: Offset the simulated server time by the given number of milliseconds.
   * Positive = fast-forward, negative = rewind.
   * Only effective in mock adapter.
   */
  setDevOffset(offsetMs: number): void

  /** DEV ONLY: Get the current offset. */
  getDevOffset(): number
}
