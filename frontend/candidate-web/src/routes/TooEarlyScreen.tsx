import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { useSessionStore } from '../store/sessionMachine'
import { Clock, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

function formatHHMMSS(ms: number) {
  if (ms <= 0) return { h: '00', m: '00', s: '00' }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return {
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

  // Auto-poll: check gate when nearing T-30 (within 5 minutes of Buffer start)
  useEffect(() => {
    const bufferStartMs = scheduledTimeMs - 30 * 60 * 1000
    const msToBuffer = bufferStartMs - nowMs

    if (msToBuffer <= 0) {
      // We're now in the buffer window
      transitionTo({ type: 'system-check', mode: 'full', inviteToken })
    }
    // Poll every 5s when within 2min of buffer start to avoid missing it
    if (msToBuffer < 2 * 60 * 1000) {
      const timer = setTimeout(() => {
        setNowMs(services.time.getServerNow())
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [nowMs, scheduledTimeMs, inviteToken, transitionTo])

  const scheduledDate = new Date(scheduledTimeMs)
  const msUntilBuffer = (scheduledTimeMs - 30 * 60 * 1000) - nowMs
  const { h, m, s } = formatHHMMSS(msUntilBuffer)

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

          {/* Right Side: All Content & Live HH:MM:SS Countdown */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-[var(--surface)] text-[var(--muted-foreground)]">
                <Clock size={14} /> Scheduled
              </div>
              <h1 id="too-early-heading" className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
                Your assessment opens soon
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                The link opens 30 minutes before your scheduled start time. Keep this tab open — you'll be moved forward automatically.
              </p>
            </div>

            {/* Live Timer Hero Card */}
            <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-2 text-center shadow-[var(--shadow-sm)]">
              <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Assessment Link Opens In
              </div>
              <div
                className="font-mono-data text-4xl sm:text-5xl font-bold tabular-nums text-[var(--accent)] tracking-tight py-1"
                role="timer"
                aria-live="off"
              >
                {h} : {m} : {s}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                Starts at {formattedTime} · {formattedDate}
              </div>
            </div>

            {/* Action & Support */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button className="btn-primary w-full sm:w-auto px-6 py-2.5 cursor-pointer" disabled={msUntilBuffer > 0}>
                {msUntilBuffer > 0 ? "Waiting for start time" : "Continue"}
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
