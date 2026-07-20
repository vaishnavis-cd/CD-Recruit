import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { useSessionStore } from '../store/sessionMachine'

const SUPPORT_LINK = 'mailto:support@cd-recruit.example.com'

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
  const msUntilStart = scheduledTimeMs - nowMs

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
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4"
      role="main"
      aria-labelledby="too-early-heading"
    >
      <div className="max-w-lg w-full text-center">
        {/* Light visual weight per spec — this is a holding state */}
        <div className="text-6xl mb-6 opacity-60" aria-hidden>🕐</div>

        <h1 id="too-early-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
          Your assessment hasn't opened yet
        </h1>

        <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
          The link opens 30 minutes before your scheduled start time. Come back then to begin your system check.
        </p>

        {/* Scheduled time — labeled timezone, side by side if they differ */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">
            Scheduled Start
          </div>
          <div className="text-xl font-semibold text-[var(--text-primary)] mb-1">{formattedTime}</div>
          <div className="text-sm text-[var(--text-secondary)] mb-4">{formattedDate}</div>

          {timezoneDiffers && (
            <div className="flex items-start gap-3 text-sm bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <div className="text-left">
                <div className="font-medium text-[var(--text-primary)] mb-1">Timezone note</div>
                <div className="text-[var(--text-secondary)]">
                  <span className="font-medium">Shown above:</span> {serverTzName}
                </div>
                <div className="text-[var(--text-secondary)]">
                  <span className="font-medium">Your local timezone:</span> {localTz}
                </div>
                <div className="text-[var(--text-secondary)] mt-1">
                  In your timezone: {scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: localTz, timeZoneName: 'short' })}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--text-secondary)] mb-1">Link opens in</div>
            <div
              className="text-3xl font-mono font-bold text-[var(--accent)] tabular-nums"
              aria-live="off"
              aria-label={`Link opens in ${formatTimeRemaining(msUntilBuffer)}`}
            >
              {formatTimeRemaining(msUntilBuffer)}
            </div>
          </div>
        </div>

        <div className="text-sm text-[var(--text-secondary)] mb-6">
          Assessment begins at T. The 30-minute window before gives you time to complete a system check and get familiar with the interface.
        </div>

        <div className="flex flex-col items-center gap-3">
          <a
            href={SUPPORT_LINK}
            className="text-sm text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded"
          >
            Contact support
          </a>
          <p className="text-xs text-[var(--text-secondary)]">
            This page will automatically update when the window opens — no refresh needed.
          </p>
        </div>
      </div>
    </div>
  )
}
