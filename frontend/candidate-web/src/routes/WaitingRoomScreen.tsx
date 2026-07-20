import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES, TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'

const SUPPORT_LINK = 'mailto:support@cd-recruit.example.com'

interface WaitingRoomScreenProps {
  scheduledTimeMs: number
  inviteToken: string
}

const FAQ = [
  {
    q: 'Can I take notes during the assessment?',
    a: 'Yes. Use any paper or digital notes tool you prefer — they won\'t be monitored.',
  },
  {
    q: 'What if I lose my internet connection mid-assessment?',
    a: 'Your work saves locally every time you make a change. The timer continues server-side. When you reconnect, your progress will sync automatically.',
  },
  {
    q: 'Can I go back to earlier modules?',
    a: 'Yes — you can navigate freely between modules at any time during the assessment. There are no per-module locks.',
  },
  {
    q: 'What happens when time runs out?',
    a: 'Whatever you\'ve last entered for each question will be automatically submitted. You\'ll see a brief confirmation before the results screen.',
  },
]

export function WaitingRoomScreen({ scheduledTimeMs, inviteToken }: WaitingRoomScreenProps) {
  const { transitionTo, session, cvMode, initAssessment } = useSessionStore()
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  // When T arrives, start the assessment
  useEffect(() => {
    if (nowMs >= scheduledTimeMs) {
      if (!session) return
      initAssessment(session.id, TOTAL_ASSESSMENT_MINUTES * 60)
      transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: session.id })
    }
  }, [nowMs, scheduledTimeMs, session, initAssessment, transitionTo])

  const msRemaining = Math.max(0, scheduledTimeMs - nowMs)
  const minutes = Math.floor(msRemaining / 60000)
  const seconds = Math.floor((msRemaining % 60000) / 1000)

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="waiting-room-heading"
    >
      <div className="max-w-xl w-full">
        {/* Light visual weight — holding state */}
        <div className="text-center mb-10">
          <h1 id="waiting-room-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
            You're all set
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Your assessment begins automatically at the scheduled time.
          </p>

          {/* Countdown to T */}
          <div className="mt-8 mb-6">
            <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-2">Starting in</div>
            <div
              className="text-5xl font-mono font-bold text-[var(--text-primary)] tabular-nums"
              role="timer"
              aria-live="off"
              aria-label={`Assessment starting in ${minutes} minutes and ${seconds} seconds`}
            >
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* Module overview — names only, zero content */}
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
            What to expect — {TOTAL_ASSESSMENT_MINUTES} minutes total
          </h2>
          <div className="space-y-3">
            {MODULES.map(mod => (
              <div key={mod.index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-[var(--bg)] border border-[var(--border)] text-xs flex items-center justify-center text-[var(--text-secondary)] font-medium flex-shrink-0">
                    {mod.index + 1}
                  </span>
                  <span className="text-[var(--text-primary)]">{mod.name}</span>
                </div>
                <span className="text-[var(--text-secondary)] text-xs">~{mod.suggestedMinutes} min</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-4 pt-4 border-t border-[var(--border)]">
            These are suggested time allocations. You can spend as much or as little time on each module as you like.
          </p>
        </div>

        {/* FAQ */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQ.map((item, i) => (
              <details key={i} className="group">
                <summary className="text-sm font-medium text-[var(--text-primary)] cursor-pointer list-none flex items-center justify-between py-2 border-b border-[var(--border)] hover:text-[var(--accent)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded">
                  {item.q}
                  <span className="text-[var(--text-secondary)] text-xs group-open:rotate-180 transition-transform" aria-hidden>▼</span>
                </summary>
                <p className="text-sm text-[var(--text-secondary)] pt-3 pb-2 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="text-center">
          <a
            href={SUPPORT_LINK}
            className="text-sm text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded"
          >
            Contact support
          </a>
          <p className="text-xs text-[var(--text-secondary)] mt-2">
            The assessment opens automatically — no refresh needed.
          </p>
        </div>
      </div>
    </div>
  )
}
