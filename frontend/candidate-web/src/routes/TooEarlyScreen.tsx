import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { useSessionStore } from '../store/sessionMachine'
import { Clock, Globe, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
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
    // Poll every 10s when within 2min of buffer start to avoid missing it
    if (msToBuffer < 2 * 60 * 1000) {
      const timer = setTimeout(() => {
        setNowMs(services.time.getServerNow())
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [nowMs, scheduledTimeMs, inviteToken, transitionTo])

  const scheduledDate = new Date(scheduledTimeMs)
  const msUntilBuffer = (scheduledTimeMs - 30 * 60 * 1000) - nowMs

  // Show candidate's local timezone alongside server timezone
  const serverTzName = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(scheduledDate)
    .find(p => p.type === 'timeZoneName')?.value ?? 'UTC'

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const timezoneDiffers = serverTzName !== localTz

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
      className="min-h-screen flex items-center justify-center px-6"
      role="main"
      aria-labelledby="too-early-heading"
    >
      <div className="w-full max-w-lg card-base p-10 animate-cd-fade-in text-center space-y-6">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
          style={{ background: 'var(--surface)', color: 'var(--muted-foreground)' }}
        >
          <Clock size={14} /> Scheduled
        </div>

        <div>
          <h1 id="too-early-heading" className="text-[32px] font-semibold tracking-tight text-[var(--foreground)] mb-2">
            Your assessment opens soon
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            The link opens 30 minutes before your scheduled start time. Keep this tab open — you'll be moved forward automatically.
          </p>
        </div>

        <div className="space-y-2">
          <div
            className="font-mono-data text-[48px] font-bold tabular-nums text-[var(--accent)]"
            aria-live="off"
            aria-label={`Link opens in ${formatTimeRemaining(msUntilBuffer)}`}
          >
            {formatTimeRemaining(msUntilBuffer)}
          </div>
          <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Starts at {formattedTime} · {formattedDate}
          </div>
        </div>

        {timezoneDiffers && (
          <div className="flex items-start gap-3 text-sm bg-[var(--surface)] rounded-xl p-4 border border-[var(--border)] text-left">
            <Globe size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="font-semibold text-[var(--foreground)]">Timezone Comparison</div>
              <div><span className="text-[var(--muted-foreground)]">Assessment TZ:</span> {serverTzName}</div>
              <div><span className="text-[var(--muted-foreground)]">Your local TZ:</span> {localTz}</div>
              <div className="text-[var(--accent)] font-medium pt-0.5">
                Local start: {scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: localTz, timeZoneName: 'short' })}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 pt-2">
          <button className="btn-primary" disabled={msUntilBuffer > 0}>
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
  )
}
