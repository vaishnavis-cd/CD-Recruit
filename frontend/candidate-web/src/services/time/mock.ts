import type { TimeAuthorityPort } from './port'

// The mock time authority holds a simulated server offset controlled by the dev panel.
// This is the canonical time source for ALL gating and countdown logic.

let devOffsetMs = 0
const subscribers = new Set<(nowMs: number) => void>()
let tickInterval: ReturnType<typeof setInterval> | null = null

function startTicking() {
  if (tickInterval !== null) return
  tickInterval = setInterval(() => {
    const now = Date.now() + devOffsetMs
    subscribers.forEach(cb => cb(now))
  }, 1000)
}

export const mockTimeAuthorityAdapter: TimeAuthorityPort = {
  getServerNow(): number {
    return Date.now() + devOffsetMs
  },

  subscribe(callback: (nowMs: number) => void): () => void {
    subscribers.add(callback)
    startTicking()
    // Emit immediately on subscribe
    callback(Date.now() + devOffsetMs)
    return () => {
      subscribers.delete(callback)
      if (subscribers.size === 0 && tickInterval !== null) {
        clearInterval(tickInterval)
        tickInterval = null
      }
    }
  },

  setDevOffset(offsetMs: number): void {
    devOffsetMs = offsetMs
    // Immediately notify all subscribers of the time jump
    const now = Date.now() + devOffsetMs
    subscribers.forEach(cb => cb(now))
  },

  getDevOffset(): number {
    return devOffsetMs
  },
}
