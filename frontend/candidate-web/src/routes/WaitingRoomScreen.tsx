import React, { useEffect, useState, useMemo } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES } from '../fixtures/questions'
import { StatusChip } from '../components/common/StatusChip'
import { LifeBuoy, ArrowRight, ShieldCheck } from 'lucide-react'
import waitingRoomCalmImg from '../assets/waiting-room-calm.png'

const SUPPORT_EMAIL = 'mailto:support@proctora.com'

interface WaitingRoomScreenProps {
  scheduledTimeMs: number
  inviteToken: string
}

export function WaitingRoomScreen({ scheduledTimeMs, inviteToken }: WaitingRoomScreenProps) {
  const { transitionTo, session, assessment, initAssessment } = useSessionStore()
  const [nowMs, setNowMs] = useState(() => services.time.getServerNow())

  // Lock target preheat countdown time once on mount
  const [targetTimeMs] = useState(() => {
    const currentNow = services.time.getServerNow()
    if (scheduledTimeMs && scheduledTimeMs > currentNow + 2000) {
      return scheduledTimeMs
    }
    try {
      const stored = localStorage.getItem('cd-recruit-scheduled-ms')
      if (stored) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed) && parsed > currentNow) {
          return parsed
        }
      }
    } catch { /* ignore */ }

    const preheatTarget = currentNow + 60 * 1000
    localStorage.setItem('cd-recruit-scheduled-ms', String(preheatTarget))
    return preheatTarget
  })

  useEffect(() => {
    return services.time.subscribe(setNowMs)
  }, [])

  // Dynamic allocated minutes
  const allocatedMinutes = session?.durationMinutes
    ? session.durationMinutes
    : assessment?.totalSeconds
    ? Math.round(assessment.totalSeconds / 60)
    : 60

  // Filter modules to assigned modules
  const activeModules = useMemo(() => {
    const questions = session?.questions || assessment?.questions
    if (questions && questions.length > 0) {
      const activeTypes = new Set(questions.map((q: any) => (q.moduleType || q.type || '').toUpperCase()))
      return MODULES.filter(m => {
        const mType = m.type.toUpperCase()
        if (mType === 'CONTEXTUAL' || mType === 'SIMULATION') {
          return activeTypes.has('CONTEXTUAL') || activeTypes.has('SIMULATION')
        }
        return activeTypes.has(mType as any) || (mType === 'CODING' && activeTypes.has('DEBUGGING'))
      })
    }
    return MODULES
  }, [session, assessment])

  const handleStartNow = () => {
    const storeState = useSessionStore.getState()
    const currentSession = session || storeState.session
    const validSessionId =
      currentSession?.id ||
      storeState.assessment?.sessionId ||
      localStorage.getItem('cd-recruit-session-id') ||
      'sess_candidate'

    const questions = currentSession?.questions || assessment?.questions || storeState.assessment?.questions
    const durationSeconds = (currentSession?.durationMinutes || allocatedMinutes) * 60

    initAssessment(validSessionId, durationSeconds, questions)
    transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: validSessionId })
  }

  // When 1-minute countdown reaches 0, automatically start the assessment
  useEffect(() => {
    if (nowMs >= targetTimeMs) {
      handleStartNow()
    }
  }, [nowMs, targetTimeMs])

  const msRemaining = Math.max(0, targetTimeMs - nowMs)
  const minutes = Math.floor(msRemaining / 60000)
  const seconds = Math.floor((msRemaining % 60000) / 1000)

  return (
    <div
      className="min-h-screen px-6 py-10 flex justify-center items-center bg-[var(--background)]"
      role="main"
      aria-labelledby="waiting-room-heading"
    >
      <div className="w-full max-w-4xl animate-cd-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Side: Illustration */}
          <div className="lg:col-span-5 flex items-center justify-center p-4">
            <img
              src={waitingRoomCalmImg}
              alt="Calm candidate illustration"
              className="w-full h-auto object-contain max-h-[340px]"
            />
          </div>

          {/* Right Side: Clean Content & Timer */}
          <div className="lg:col-span-7 space-y-6">
            {/* Top Chip & Heading */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusChip tone="accent" label="PREPARING YOUR ASSESSMENT" size="sm" loading />
                <span className="text-xs font-mono text-[var(--muted-foreground)]">• {allocatedMinutes}m total time</span>
              </div>
              <h1 id="waiting-room-heading" className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
                Take a deep breath
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                Your test environment is initialized. Take a moment to relax before beginning.
              </p>
            </div>

            {/* Reverse Timer & Start Now CTA */}
            <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Starting Automatically In
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1 font-medium">
                  <ShieldCheck size={13} className="text-[var(--success)]" /> Environment Ready
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div
                  className="font-mono-data text-4xl font-bold tabular-nums text-[var(--accent)] tracking-tight"
                  role="timer"
                  aria-live="off"
                >
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>

                <button
                  onClick={handleStartNow}
                  className="px-6 py-3 rounded-xl bg-[var(--accent)] hover:opacity-90 text-white font-bold text-sm transition-all flex items-center gap-2 cursor-pointer shadow-md active:scale-95 w-full sm:w-auto justify-center"
                >
                  <span>Start Assessment Now</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Active Modules Badges */}
            {activeModules.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">Assigned Modules:</span>
                {activeModules.map((m) => (
                  <span
                    key={m.type}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]"
                  >
                    {m.name}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              <a
                href={SUPPORT_EMAIL}
                className="inline-flex items-center gap-1.5 hover:text-[var(--foreground)] transition-colors"
              >
                <LifeBuoy size={14} />
                <span>Need support?</span>
              </a>
              <span>Proctora Candidate Environment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
