import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { useSessionStore } from '../store/sessionMachine'
import { Clock, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@proctora.com'

function formatCountdown(ms: number) {
  if (ms <= 0) return { d: '00', h: '00', m: '00', s: '00' }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return {
    d: String(d).padStart(2, '0'),
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(s).padStart(2, '0'),
  }
}

interface TooEarlyScreenProps {
  scheduledTimeMs: number
  inviteToken: string
}

export function TooEarlyScreen({ scheduledTimeMs, inviteToken }: TooEarlyScreenProps) {
  const transitionTo = useSessionStore(s => s.transitionTo)
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  // Auto-poll: check gate when reaching T-15m
  useEffect(() => {
    const msToUnlock = scheduledTimeMs - nowMs

    if (msToUnlock <= 0) {
      // System Check unlocks at T-15m
      transitionTo({ type: 'system-check', mode: 'full', inviteToken })
    }
    if (msToUnlock < 2 * 60 * 1000) {
      const timer = setTimeout(() => {
        setNowMs(services.time.getServerNow())
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [nowMs, scheduledTimeMs, inviteToken, transitionTo])

  const scheduledDate = new Date(scheduledTimeMs + 15 * 60 * 1000) // Test start time T
  const msUntilUnlock = scheduledTimeMs - nowMs
  const { d, h, m, s } = formatCountdown(msUntilUnlock)

  const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  const formattedDate = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div
      className="min-h-screen px-6 py-10 flex items-center justify-center bg-[var(--background)]"
      role="main"
      aria-labelledby="too-early-heading"
    >
      <div className="w-full max-w-6xl animate-cd-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Side: Enormous too-early.png Illustration */}
          <div className="lg:col-span-6 flex items-center justify-center p-2">
            <img
              src="/too-early.png"
              alt="Too early illustration"
              className="w-full max-w-[720px] h-auto object-contain max-h-[700px]"
            />
          </div>

          {/* Right Side: All Content & Live Countdown */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[var(--surface)] text-[var(--muted-foreground)]">
                <Clock size={14} /> Scheduled Test
              </div>
              <h1 id="too-early-heading" className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
                Your assessment opens soon
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                System check unlocks 15 minutes prior to test time. Keep this tab open — you'll be moved to System Check automatically.
              </p>
            </div>

            {/* Live Timer Hero Card */}
            <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-2 text-center shadow-[var(--shadow-sm)]">
              <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                System Check Opens In
              </div>
              <div
                className="font-mono-data text-3xl sm:text-4xl font-bold tabular-nums text-[var(--accent)] tracking-tight py-2 flex items-center justify-center gap-1.5"
                role="timer"
                aria-live="off"
              >
                <span>{d}d</span>
                <span className="text-[var(--text-secondary)] font-normal">:</span>
                <span>{h}h</span>
                <span className="text-[var(--text-secondary)] font-normal">:</span>
                <span>{m}m</span>
                <span className="text-[var(--text-secondary)] font-normal">:</span>
                <span>{s}s</span>
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Test starts at {formattedTime} · {formattedDate}
              </div>
            </div>

            {/* Action & Support */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                onClick={() => transitionTo({ type: 'system-check', mode: 'full', inviteToken })}
                className="btn-primary w-full sm:w-auto px-6 py-2.5 cursor-pointer disabled:opacity-50"
                disabled={msUntilUnlock > 0}
              >
                {msUntilUnlock > 0 ? "Waiting for system check unlock" : "Proceed to System Check"}
              </button>

              <a
                href={SUPPORT_EMAIL}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <LifeBuoy size={14} />
                <span>Contact Support</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
