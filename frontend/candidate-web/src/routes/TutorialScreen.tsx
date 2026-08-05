import React, { useEffect, useState, useMemo } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES, TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'
import { getEffectiveModuleType } from '../utils/moduleType'
import { StatusChip } from '../components/common/StatusChip'
import { CheckCircle2, ArrowRight, ArrowLeft, Clock, Inbox, Sparkles, Image as ImageIcon } from 'lucide-react'
import workspaceIntroImg from '../assets/workspace-intro.png'

interface TutorialScreenProps {
  mode: 'full' | 'condensed'
  inviteToken: string
}

type TutorialStep =
  | 'layout'
  | 'timer'
  | 'palette'
  | 'contextual-sim'
  | 'run-vs-submit'
  | 'practice'
  | 'done'

const FULL_STEPS: TutorialStep[] = ['layout', 'timer', 'palette', 'contextual-sim', 'run-vs-submit', 'practice', 'done']
const CONDENSED_STEPS: TutorialStep[] = ['layout', 'timer', 'palette', 'contextual-sim', 'done']

export function TutorialScreen({ mode, inviteToken }: TutorialScreenProps) {
  const { transitionTo, session, assessment, cvMode, initAssessment, setSession } = useSessionStore()
  const [stepIndex, setStepIndex] = useState(0)
  const [practiceAnswer, setPracticeAnswer] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const steps = mode === 'full' ? FULL_STEPS : CONDENSED_STEPS

  const [scheduledMs] = useState(() => {
    try {
      const stored = localStorage.getItem('cd-recruit-scheduled-ms')
      return stored ? parseInt(stored) : null
    } catch { return null }
  })

  // Dynamic allocated assessment duration from session/backend DB
  const allocatedMinutes = session?.durationMinutes
    ? session.durationMinutes
    : assessment?.totalSeconds
    ? Math.round(assessment.totalSeconds / 60)
    : 60

  const formattedTimerDisplay = `${allocatedMinutes}:00`

  // Filter modules to present ONLY assigned/selected modules for this candidate's assessment
  const activeModules = useMemo(() => {
    const questions = session?.questions || assessment?.questions
    if (questions && questions.length > 0) {
      const activeTypes = new Set(questions.map((q: any) => getEffectiveModuleType(q)))
      return MODULES.filter(m => {
        const mType = m.type.toUpperCase()
        if (mType === 'CONTEXTUAL' || mType === 'SIMULATION') {
          return activeTypes.has('CONTEXTUAL') || activeTypes.has('SIMULATION')
        }
        if (mType === 'PROMPTING' || mType === 'AI_PROMPTING') {
          return activeTypes.has('PROMPTING') || activeTypes.has('AI_PROMPTING')
        }
        return activeTypes.has(mType as any)
      })
    }
    return MODULES
  }, [session, assessment])

  useEffect(() => {
    if (!scheduledMs || mode !== 'full') return

    const unsub = services.time.subscribe(nowMs => {
      const remaining = Math.round((scheduledMs - nowMs) / 1000)

      if (remaining <= 0) {
        setCountdown(0)
      } else if (remaining <= 60) {
        setCountdown(remaining)
      } else {
        setCountdown(null)
      }
    })
    return unsub
  }, [scheduledMs, mode])

  const currentStep = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  function handleNext() {
    if (stepIndex < steps.length - 1) {
      setStepIndex(i => i + 1)
    } else {
      proceedToAssessment()
    }
  }

  async function proceedToAssessment() {
    const nowMs = services.time.getServerNow()

    // Derive the real scheduled start time in priority order:
    // 1. localStorage value set by InviteResolver / TooEarlyScreen (contains the real schedule time)
    // 2. Fallback: now + 60s preheat buffer
    let preheatTargetMs: number

    if (scheduledMs && scheduledMs > nowMs) {
      // Real schedule time is still in the future — countdown to it
      preheatTargetMs = scheduledMs
    } else {
      // Already past schedule (or no info) — short 60s preheat buffer
      preheatTargetMs = nowMs + 60 * 1000
    }

    localStorage.setItem('cd-recruit-scheduled-ms', preheatTargetMs.toString())

    try {
      const selfieDataUrl = localStorage.getItem('cd-recruit-selfie-data')
      const newSession = await services.sessionApi.createSession(
        inviteToken,
        cvMode,
        mode,
        selfieDataUrl
      )
      setSession(newSession)

      const sessionDuration = (newSession.durationMinutes || allocatedMinutes) * 60
      initAssessment(newSession.id, sessionDuration, newSession.questions)
      transitionTo({ type: 'waiting-room', scheduledTimeMs: preheatTargetMs, inviteToken })
    } catch (err: any) {
      const code = err?.response?.data?.code ?? err?.response?.data?.error
      console.error('[TutorialScreen] Failed to create session:', code, err)

      const currentSession = session || useSessionStore.getState().session
      if (currentSession?.id) {
        const sessionDuration = (currentSession.durationMinutes || allocatedMinutes) * 60
        initAssessment(currentSession.id, sessionDuration, currentSession.questions)
        transitionTo({ type: 'waiting-room', scheduledTimeMs: preheatTargetMs, inviteToken })
        return
      }

      // Mandatory fallback: push to waiting room with computed target
      transitionTo({ type: 'waiting-room', scheduledTimeMs: preheatTargetMs, inviteToken })
    }
  }


  const StepContent = () => {
    switch (currentStep) {
      case 'layout':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Interface Overview</h2>

            {/* Image Placeholder Space */}
            <div className="w-full h-44 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)]/50 flex flex-col items-center justify-center gap-2 text-[var(--muted-foreground)]">
              <div className="p-3 rounded-full bg-[var(--background)] border border-[var(--border)] text-[var(--accent)]">
                <ImageIcon size={24} />
              </div>
              <span className="text-xs font-medium">Image Placeholder</span>
            </div>

            <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>The top bar displays your total remaining timer, integrity indicator, module navigation tabs, and the Review &amp; Submit trigger.</p>
              <p>The left sidebar contains the question navigation palette for jumping directly to any item within the active module. You can switch between modules at any time.</p>
              <p>The main central workspace changes dynamically based on the active module (Multiple Choice, SQL, Coding Workspace, AI Prompting, or Contextual Simulation).</p>
            </div>
          </div>
        )

      case 'timer':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Timer &amp; Server Synchronization</h2>
            <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center gap-4 shadow-[var(--shadow-sm)]">
              <div className="p-3 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20">
                <Clock size={24} />
              </div>
              <div>
                <div className="text-2xl font-mono font-bold text-[var(--text-primary)] tracking-tight">
                  {formattedTimerDisplay}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">Server-authoritative timer synced with backend allocated duration.</div>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Total allocated assessment duration is <strong>{allocatedMinutes} minutes</strong>. Assigned assessment modules:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {activeModules.map(m => (
                <div key={m.index} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0" />
                  <span className="font-semibold text-[var(--text-primary)]">{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        )

      case 'palette':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Question Navigation Palette</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">Each question tile in the sidebar palette indicates its current response status:</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { status: 'Unvisited', variant: 'neutral' as const, note: 'Not yet opened' },
                { status: 'Answered', variant: 'success' as const, note: 'Response saved' },
                { status: 'Skipped', variant: 'warning' as const, note: 'Marked for return' },
                { status: 'Flagged', variant: 'warning' as const, note: 'Flagged for review' },
              ].map(({ status, variant, note }) => (
                <div key={status} className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] flex items-center gap-3">
                  <StatusChip variant={variant} label={status.toUpperCase()} size="sm" />
                  <span className="text-[var(--text-secondary)] text-[11px]">{note}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg)] font-mono text-[11px]">F</kbd> on any question to flag or unflag it for review.
            </p>
          </div>
        )

      case 'contextual-sim':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles size={20} className="text-[var(--accent)]" />
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Contextual Simulation &amp; On-Call Guide</h2>
            </div>
            <div className="p-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-subtle)] space-y-2">
              <div className="font-semibold text-sm text-[var(--text-primary)]">Simulated Real-World Incident Workspace</div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                In this module, realistic engineering scenarios unfold dynamically. You are placed on-call to triage production incidents, communicate with team members, and formulate root-cause solutions.
              </p>
            </div>
            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <ul className="space-y-2 pl-4 list-disc text-[var(--text-primary)]">
                <li><strong>Incident Triage:</strong> Review incoming PagerDuty alerts, inspect server log streams, and isolate root causes.</li>
                <li><strong>AI Collaboration:</strong> Use built-in AI prompting tools to analyze stack traces and draft resolutions.</li>
                <li><strong>Stakeholder Communication:</strong> Compose clear, professional responses to team members and tech leads.</li>
              </ul>
            </div>
          </div>
        )

      case 'run-vs-submit':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Run vs. Submit (Coding &amp; SQL)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-subtle)] space-y-2">
                <div className="font-bold text-[var(--accent)] flex items-center gap-1.5">
                  <span>▶ Run Query / Test</span>
                </div>
                <ul className="space-y-1 text-[var(--text-secondary)] leading-relaxed">
                  <li>• Executes visible test cases only</li>
                  <li>• Instant output &amp; console logs</li>
                  <li>• Does NOT finalize submission</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl border border-[var(--success)]/30 bg-[var(--success-subtle)] space-y-2">
                <div className="font-bold text-[var(--success)] flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  <span>Submit Answer</span>
                </div>
                <ul className="space-y-1 text-[var(--text-secondary)] leading-relaxed">
                  <li>• Runs visible &amp; hidden evaluation suite</li>
                  <li>• Persists solution payload to session</li>
                  <li>• You can revise code after submitting</li>
                </ul>
              </div>
            </div>
          </div>
        )

      case 'practice':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Practice Question (Zero Stakes)</h2>
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-[var(--text-primary)]">
                Which HTTP status code indicates "Resource Not Found"?
              </legend>
              <div className="space-y-2">
                {[
                  { id: 'a', text: '200 OK' },
                  { id: 'b', text: '400 Bad Request' },
                  { id: 'c', text: '404 Not Found' },
                  { id: 'd', text: '500 Internal Server Error' },
                ].map(opt => (
                  <label
                    key={opt.id}
                    className={`
                      flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all text-xs
                      ${practiceAnswer === opt.id
                        ? opt.id === 'c'
                          ? 'border-[var(--success)] bg-[var(--success-subtle)] font-medium'
                          : 'border-[var(--critical)] bg-[var(--critical-subtle)] font-medium'
                        : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="practice"
                      checked={practiceAnswer === opt.id}
                      onChange={() => setPracticeAnswer(opt.id)}
                      className="w-4 h-4 text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <span className="text-[var(--text-primary)]">{opt.text}</span>
                  </label>
                ))}
              </div>
              {practiceAnswer && (
                <div className={`p-3 rounded-xl border text-xs font-medium ${practiceAnswer === 'c' ? 'border-[var(--success)]/30 bg-[var(--success-subtle)] text-[var(--success)]' : 'border-[var(--warning)]/30 bg-[var(--warning-subtle)] text-[var(--warning)]'}`}>
                  {practiceAnswer === 'c'
                    ? '✓ Correct! 404 Not Found is the standard response for non-existent endpoints.'
                    : '← Select 404 Not Found to test answer selection.'
                  }
                </div>
              )}
            </fieldset>
          </div>
        )

      case 'done':
        return (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-2xl bg-[var(--success-subtle)] text-[var(--success)] border border-[var(--success)]/20 flex items-center justify-center mx-auto shadow-[var(--shadow-sm)]">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">You're All Set!</h2>
              <p className="text-xs text-[var(--text-secondary)]">Continuing will enter the sandbox preheating waiting room for 1 minute before starting Module 1.</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen px-6 py-10 flex flex-col justify-center" role="main" aria-labelledby="tutorial-heading">
      <div className="w-full max-w-6xl mx-auto animate-cd-fade-in space-y-6">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              Tutorial
            </div>
            <h1 id="tutorial-heading" className="text-[28px] font-semibold tracking-tight mt-1 text-[var(--foreground)]">
              {mode === 'full' ? 'Before you start' : 'Quick Orientation'}
            </h1>
          </div>

          {countdown !== null && countdown <= 60 && (
            <StatusChip
              tone="warning"
              label={countdown === 0 ? 'STARTING NOW' : `STARTING IN ${countdown}S`}
              size="sm"
              loading
            />
          )}
        </div>

        {/* 2-Column Split Layout for steps before 'done' */}
        {currentStep !== 'done' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Persistent Workspace Preview Image (5 cols) */}
            <div className="lg:col-span-5 sticky top-6 flex items-center justify-center">
              <img
                src={workspaceIntroImg}
                alt="Workspace Layout Preview"
                className="w-full h-auto object-contain max-h-[420px]"
              />
            </div>

            {/* Right Column: Step Content Card & Navigation (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Progress Bar */}
              <div className="h-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] overflow-hidden" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemax={steps.length}>
                <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
              </div>

              <div className="card-base p-7 min-h-[380px] flex flex-col justify-between">
                <StepContent />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                  disabled={stepIndex === 0}
                  className="btn-secondary inline-flex items-center gap-1.5 text-xs cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>

                <button
                  onClick={handleNext}
                  className="btn-primary inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>{isLast ? 'Enter Waiting Room' : 'Next'}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Final Screen ('done'): Centered Card */
          <div className="max-w-xl mx-auto space-y-6">
            <div className="card-base p-8">
              <StepContent />
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                className="btn-secondary inline-flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>

              <button
                onClick={handleNext}
                className="btn-primary inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Enter Waiting Room</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
