import React, { useEffect, useState } from 'react'
import { services } from '../services'
import { useSessionStore } from '../store/sessionMachine'
import { TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function Timer() {
  const assessment = useSessionStore(s => s.assessment)
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  if (!assessment || assessment.timerStartMs === null) {
    return (
      <div className="timer-shell font-mono text-sm px-3 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]">
        <span className="sr-only">Assessment timer not started</span>
        <span aria-hidden>--:--</span>
      </div>
    )
  }

  const elapsedMs = nowMs - assessment.timerStartMs
  const totalMs = assessment.totalSeconds * 1000
  const remainingSeconds = Math.max(0, Math.round((totalMs - elapsedMs) / 1000))

  // Color thresholds: amber at 10/5/1 min, never red per spec
  let colorClass = 'text-[var(--text-primary)]'
  if (remainingSeconds <= 60) colorClass = 'text-[var(--warning)] font-bold animate-pulse'
  else if (remainingSeconds <= 300) colorClass = 'text-[var(--warning)] font-semibold'
  else if (remainingSeconds <= 600) colorClass = 'text-[var(--warning)]'

  const label = remainingSeconds <= 60
    ? 'Less than 1 minute remaining'
    : remainingSeconds <= 300
    ? 'Less than 5 minutes remaining'
    : `${Math.ceil(remainingSeconds / 60)} minutes remaining`

  return (
    <div
      className={`timer-shell font-mono text-sm px-3 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)] ${colorClass} tabular-nums`}
      role="timer"
      aria-label={label}
      aria-live="off"
    >
      <span aria-hidden>{formatTime(remainingSeconds)}</span>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function useAssessmentTimer() {
  const assessment = useSessionStore(s => s.assessment)
  const screen = useSessionStore(s => s.screen)
  const transitionTo = useSessionStore(s => s.transitionTo)
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  useEffect(() => {
    if (!assessment || assessment.timerStartMs === null) return
    if (screen.type !== 'assessment' && screen.type !== 'pre-submit-review') return

    const elapsedMs = nowMs - assessment.timerStartMs
    const totalMs = assessment.totalSeconds * 1000

    if (elapsedMs >= totalMs && screen.type === 'assessment') {
      // Auto-submit on timeout
      transitionTo({ type: 'syncing', sessionId: assessment.sessionId, auto: true })
    }
  }, [nowMs, assessment, screen, transitionTo])

  if (!assessment || assessment.timerStartMs === null) return null

  const elapsedMs = nowMs - assessment.timerStartMs
  const totalMs = assessment.totalSeconds * 1000
  const remainingSeconds = Math.max(0, Math.round((totalMs - elapsedMs) / 1000))
  return remainingSeconds
}

// Warning banner thresholds — amber, never red
export function TimerWarningBanner() {
  const remaining = useAssessmentTimer()
  if (remaining === null || remaining === undefined) return null

  if (remaining <= 60 && remaining > 0) {
    return (
      <div
        role="alert"
        className="w-full bg-[var(--warning)] text-white text-center text-sm font-semibold py-2 px-4"
      >
        ⚠ 1 minute remaining — your work will be auto-submitted when the timer reaches zero
      </div>
    )
  }
  if (remaining <= 300 && remaining > 60) {
    return (
      <div role="alert" className="w-full bg-amber-50 dark:bg-amber-900/30 border-b border-[var(--warning)] text-[var(--warning)] text-center text-sm font-medium py-1.5 px-4">
        5 minutes remaining
      </div>
    )
  }
  if (remaining <= 600 && remaining > 300) {
    return (
      <div className="w-full bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-center text-sm py-1 px-4">
        10 minutes remaining
      </div>
    )
  }
  return null
}

// Suggested time allocations shown as guidance (soft-budget model)
export function ModuleTimeBudgetIndicator({ moduleIndex, suggestedMinutes }: { moduleIndex: number; suggestedMinutes: number }) {
  const assessment = useSessionStore(s => s.assessment)
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  if (!assessment || assessment.timerStartMs === null) return null

  const elapsed = (nowMs - assessment.timerStartMs) / 1000 / 60
  const previousModulesMinutes = TOTAL_ASSESSMENT_MINUTES - (TOTAL_ASSESSMENT_MINUTES - moduleIndex * (TOTAL_ASSESSMENT_MINUTES / 5))

  const moduleElapsed = elapsed - previousModulesMinutes
  const budgetRemaining = suggestedMinutes - moduleElapsed

  if (budgetRemaining < 0) {
    return (
      <span className="text-xs text-[var(--warning)] font-medium">
        Suggested time elapsed
      </span>
    )
  }

  return (
    <span className="text-xs text-[var(--text-secondary)]">
      ~{Math.ceil(budgetRemaining)}m suggested for this module
    </span>
  )
}
