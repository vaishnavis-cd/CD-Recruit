import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES, TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'
import { IllustrationContainer } from '../components/common/IllustrationContainer'
import { Clock, HelpCircle, ChevronDown, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

interface WaitingRoomScreenProps {
  scheduledTimeMs: number
  inviteToken: string
}


export function WaitingRoomScreen({ scheduledTimeMs, inviteToken }: WaitingRoomScreenProps) {
  const { transitionTo, session, initAssessment } = useSessionStore()
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  // When T arrives, start the assessment
  useEffect(() => {
    if (nowMs >= scheduledTimeMs) {
      if (!session) return
      initAssessment(session.id, TOTAL_ASSESSMENT_MINUTES * 60, session.questions)
      transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: session.id })
    }
  }, [nowMs, scheduledTimeMs, session, initAssessment, transitionTo])

  const msRemaining = Math.max(0, scheduledTimeMs - nowMs)
  const minutes = Math.floor(msRemaining / 60000)
  const seconds = Math.floor((msRemaining % 60000) / 1000)

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-4 md:p-8"
      role="main"
      aria-labelledby="waiting-room-heading"
    >
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Side: Dominant Hero Illustration Panel */}
        <div className="lg:col-span-7 flex flex-col justify-center h-full">
          <div className="w-full h-full min-h-[500px] lg:min-h-[600px] bg-[var(--surface)] rounded-3xl border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-md)] flex flex-col items-center justify-center text-center space-y-4">
            <IllustrationContainer
              src="/src/assets/waiting-room-calm.png"
              alt="Waiting Room Calm Illustration"
              fallbackIcon={Clock}
              aspectRatio=""
              imgClassName="object-contain p-0 max-h-[520px] w-full"
              className="w-full flex-1 border-none bg-transparent shadow-none"
            />
            <div className="pb-2">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Sit Back &amp; Relax</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                Take a moment to review the assessment format before your session begins automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Details, Countdown, Overview */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div>
              <h1 id="waiting-room-heading" className="text-3xl font-bold text-[var(--text-primary)] tracking-tight">
                You're All Set!
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Your assessment begins automatically when the countdown reaches 00:00.
              </p>
            </div>

            {/* Countdown display */}
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-sm)] flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Assessment Starts In</div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">No page refresh needed</div>
              </div>
              <div
                className="text-4xl md:text-5xl font-mono font-bold text-[var(--accent)] tabular-nums tracking-tight"
                role="timer"
                aria-live="off"
                aria-label={`Assessment starting in ${minutes} minutes and ${seconds} seconds`}
              >
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
            </div>
          </div>

          {/* Module overview */}
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-sm)] space-y-3">
            <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Assessment Overview — {TOTAL_ASSESSMENT_MINUTES} Minutes Budget
            </h2>
            <div className="space-y-2">
              {MODULES.map(mod => (
                <div key={mod.index} className="flex items-center justify-between text-xs p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-xs flex items-center justify-center font-bold shrink-0">
                      {mod.index + 1}
                    </span>
                    <span className="text-[var(--text-primary)] font-medium">{mod.name}</span>
                  </div>
                  <span className="text-[var(--text-secondary)] font-mono font-semibold">~{mod.suggestedMinutes} min</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border)] leading-relaxed">
              Suggested module time allocations are for guidance only. You manage your total time budget.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-[var(--border)]">
            <a
              href={SUPPORT_EMAIL}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline font-medium"
            >
              <LifeBuoy size={14} />
              <span>Contact Support</span>
            </a>
            <span className="text-[11px] text-[var(--text-secondary)]">CD-Recruit Proctoring Engine</span>
          </div>
        </div>
      </div>
    </div>
  )
}

