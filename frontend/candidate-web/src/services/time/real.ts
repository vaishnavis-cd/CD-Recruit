import type { TimeAuthorityPort } from './port'
import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

let serverTimeOffsetMs = 0
const subscribers = new Set<(nowMs: number) => void>()

// Clock sync function
async function syncClock() {
  try {
    const start = Date.now()
    const res = await axios.get(`${apiBaseUrl}/health`)
    const latency = (Date.now() - start) / 2
    const serverTimestamp = new Date(res.data.timestamp).getTime()
    // Server time estimated at the moment the request completed:
    const targetNow = serverTimestamp + latency
    serverTimeOffsetMs = targetNow - Date.now()
  } catch (err) {
    console.error('Failed to sync time authority clock:', err)
  }
}

// Initial sync on module load
void syncClock()

// Tick interval to notify subscribers every 1s
setInterval(() => {
  const currentNow = Date.now() + serverTimeOffsetMs
  subscribers.forEach((cb) => cb(currentNow))
}, 1000)

export const realTimeAuthorityAdapter: TimeAuthorityPort = {
  getServerNow(): number {
    return Date.now() + serverTimeOffsetMs
  },

  subscribe(callback: (nowMs: number) => void): () => void {
    subscribers.add(callback)
    // Send immediate tick
    callback(Date.now() + serverTimeOffsetMs)
    return () => {
      subscribers.delete(callback)
    }
  },

  setDevOffset(_offsetMs: number): void {
    // No-op in real mode
  },

  getDevOffset(): number {
    return 0
  },
}
