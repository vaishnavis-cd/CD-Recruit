import React, { useEffect, useState, useMemo } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES, TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'
import { StatusChip } from '../components/common/StatusChip'
import { Clock, Sparkles, LifeBuoy, CheckCircle2 } from 'lucide-react'
import waitingRoomCalmImg from '../assets/waiting-room-calm.png'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

const MOTIVATIONAL_QUOTES = [
  { quote: "Take a deep breath. You've prepared for this moment.", author: "Stay focused & confident" },
  { quote: "Success is the sum of small efforts repeated day in and day out.", author: "Trust your process" },
  { quote: "Focus on being productive instead of busy. One step at a time.", author: "Quality over speed" },
]

interface WaitingRoomScreenProps {
  scheduledTimeMs: number
  inviteToken: string
}

export function WaitingRoomScreen({ scheduledTimeMs, inviteToken }: WaitingRoomScreenProps) {
  const { transitionTo, session, assessment, initAssessment } = useSessionStore()
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  // Pick a consistent motivational quote
  const currentQuote = useMemo(() => {
    const idx = Math.abs(scheduledTimeMs) % MOTIVATIONAL_QUOTES.length
    return MOTIVATIONAL_QUOTES[idx]
  }, [scheduledTimeMs])

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  // Dynamic allocated minutes
  const allocatedMinutes = session?.durationMinutes
    ? session.durationMinutes
    : assessment?.totalSeconds
    ? Math.round(assessment.totalSeconds / 60)
    : TOTAL_ASSESSMENT_MINUTES

  // Filter modules to assigned modules
  const activeModules = useMemo(() => {
    const questions = session?.questions || assessment?.questions
    if (questions && questions.length > 0) {
      const activeTypes = new Set(questions.map((q: any) => q.moduleType || q.type))
      return MODULES.filter(m => activeTypes.has(m.type as any))
    }
    return MODULES
  }, [session, assessment])

  // When 1-minute countdown reaches 0, automatically start the assessment
  useEffect(() => {
    if (nowMs >= scheduledTimeMs) {
      const currentSession = session || useSessionStore.getState().session
      const sessionId = currentSession?.id || 'demo-session'
      const questions = currentSession?.questions || assessment?.questions
      const durationSeconds = (currentSession?.durationMinutes || allocatedMinutes) * 60

      initAssessment(sessionId, durationSeconds, questions)
      transitionTo({ type: 'assessment', moduleIndex: 0, sessionId })
    }
  }, [nowMs, scheduledTimeMs, session, assessment, allocatedMinutes, initAssessment, transitionTo])

  const msRemaining = Math.max(0, scheduledTimeMs - nowMs)
  const minutes = Math.floor(msRemaining / 60000)
  const seconds = Math.floor((msRemaining % 60000) / 1000)

  return (
    <div
      className="min-h-screen px-6 py-10 flex justify-center items-center"
      role="main"
      aria-labelledby="waiting-room-heading"
    >
      <div className="w-full max-w-5xl animate-cd-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Side: ONLY the figure illustration */}
          <div className="lg:col-span-5 flex items-center justify-center p-2">
            <img
              src={waitingRoomCalmImg}
              alt="Calm candidate illustration"
              className="w-full h-auto object-contain max-h-[380px]"
            />
          </div>

          {/* Right Side: All Content, Timer, Quote & 1-Minute Tips */}
          <div className="lg:col-span-7 space-y-6">
            {/* Top Chip & Timer */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusChip tone="accent" label="PREPARING YOUR ASSESSMENT" size="sm" loading />
                <span className="text-[11px] font-mono text-[var(--muted-foreground)]">• {allocatedMinutes}m total time</span>
              </div>
              <h1 id="waiting-room-heading" className="text-[28px] font-bold tracking-tight text-[var(--foreground)]">
                Take a deep breath
              </h1>
              
              {/* Reverse Timer */}
              <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between shadow-[var(--shadow-sm)]">
                <div>
                  <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                    Starting Automatically In
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                    Your assessment begins as soon as the timer reaches 00:00.
                  </div>
                </div>
                <div
                  className="font-mono-data text-[44px] font-bold tabular-nums text-[var(--accent)] tracking-tight"
                  role="timer"
                  aria-live="off"
                >
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
              </div>
            </div>

            {/* Motivational Quote Box */}
            <div className="p-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-subtle)]/40 space-y-1.5">
              <div className="flex items-center gap-2 text-[var(--accent)] text-xs font-bold uppercase tracking-wider">
                <Sparkles size={14} />
                <span>Mindset Check</span>
              </div>
              <blockquote className="text-xs text-[var(--foreground)] italic leading-relaxed">
                "{currentQuote.quote}"
              </blockquote>
              <div className="text-[11px] text-[var(--muted-foreground)] font-medium">
                — {currentQuote.author}
              </div>
            </div>

            {/* Quick 1-Minute Tips Box */}
            <div className="card-base p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] uppercase tracking-wider">
                <CheckCircle2 size={15} className="text-[var(--success)]" />
                <span>Quick 1-Minute Tips</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[var(--muted-foreground)]">
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex items-start gap-2">
                  <span className="shrink-0">🧘</span>
                  <span><strong>Stay Calm:</strong> Focus on one problem at a time. Quality over speed.</span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex items-start gap-2">
                  <span className="shrink-0">⏱️</span>
                  <span><strong>Manage Time:</strong> Monitor your total allocated time budget.</span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex items-start gap-2">
                  <span className="shrink-0">▶️</span>
                  <span><strong>Run Code:</strong> Test your logic against sample test cases before submitting.</span>
                </div>
                <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex items-start gap-2">
                  <span className="shrink-0">🚩</span>
                  <span><strong>Flag & Return:</strong> Press <kbd className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[10px] font-mono">F</kbd> to mark tough questions for review.</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--muted-foreground)]">
              <a
                href={SUPPORT_EMAIL}
                className="inline-flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors"
              >
                <LifeBuoy size={13} />
                <span>Need support?</span>
              </a>
              <span>CD-Recruit Candidate Environment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
