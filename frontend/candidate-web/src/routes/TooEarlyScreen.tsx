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
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="too-early-heading"
    >
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Lucide Clock Hero */}
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--accent)]/20 flex items-center justify-center mx-auto text-[var(--accent)] shadow-[var(--shadow-sm)]">
          <Clock size={32} />
        </div>

        <div>
          <h1 id="too-early-heading" className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Your assessment hasn't opened yet
          </h1>

          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The link opens 30 minutes before your scheduled start time. Come back then to begin your system check.
          </p>
        </div>

        {/* Scheduled time card */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-md)] text-left space-y-4">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Scheduled Start
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">{formattedTime}</div>
          <div className="text-sm text-[var(--text-secondary)]">{formattedDate}</div>

          {timezoneDiffers && (
            <div className="flex items-start gap-3 text-sm bg-[var(--accent-subtle)] rounded-xl p-3.5 border border-[var(--accent)]/20 text-[var(--text-primary)]">
              <Globe size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">Timezone Note</div>
                <div><span className="text-[var(--text-secondary)]">Assessment timezone:</span> {serverTzName}</div>
                <div><span className="text-[var(--text-secondary)]">Your local timezone:</span> {localTz}</div>
                <div className="text-[var(--accent)] font-medium pt-0.5">
                  Local start time: {scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: localTz, timeZoneName: 'short' })}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Link opens in</span>
            <span
              className="text-3xl font-mono font-bold text-[var(--accent)] tabular-nums tracking-tight"
              aria-live="off"
              aria-label={`Link opens in ${formatTimeRemaining(msUntilBuffer)}`}
            >
              {formatTimeRemaining(msUntilBuffer)}
            </span>
          </div>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Assessment begins at T. The 30-minute pre-buffer gives you time to complete hardware checks and get comfortable.
        </p>

        <div className="flex flex-col items-center gap-3 pt-2">
          <a
            href={SUPPORT_EMAIL}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded"
          >
            <LifeBuoy size={14} />
            <span>Contact Support</span>
          </a>
          <p className="text-[11px] text-[var(--text-secondary)]">
            This page will automatically update when the window opens — no refresh needed.
          </p>
        </div>
      </div>
    </div>
  )
}
