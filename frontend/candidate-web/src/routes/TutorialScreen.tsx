import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES, TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'
import { IllustrationContainer } from '../components/common/IllustrationContainer'
import { StatusChip } from '../components/common/StatusChip'
import { HelpCircle, CheckCircle2, ArrowRight, ArrowLeft, Clock, Inbox, Sparkles, AlertTriangle } from 'lucide-react'

interface TutorialScreenProps {
  mode: 'full' | 'condensed'
  inviteToken: string
}

type TutorialStep =
  | 'layout'
  | 'timer'
  | 'palette'
  | 'run-vs-submit'
  | 'module5-preview'
  | 'practice'
  | 'done'

const FULL_STEPS: TutorialStep[] = ['layout', 'timer', 'palette', 'run-vs-submit', 'module5-preview', 'practice', 'done']
const CONDENSED_STEPS: TutorialStep[] = ['layout', 'timer', 'palette', 'done']

export function TutorialScreen({ mode, inviteToken }: TutorialScreenProps) {
  const { transitionTo, session, cvMode, initAssessment, setSession } = useSessionStore()
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
    const scheduledMs = parseInt(localStorage.getItem('cd-recruit-scheduled-ms') ?? '0')
    const nowMs = services.time.getServerNow()

    try {
      const selfieDataUrl = localStorage.getItem('cd-recruit-selfie-data')
      const newSession = await services.sessionApi.createSession(
        inviteToken,
        cvMode,
        mode,
        selfieDataUrl
      )
      setSession(newSession)

      if (mode === 'full' && scheduledMs > nowMs) {
        transitionTo({ type: 'waiting-room', scheduledTimeMs: scheduledMs, inviteToken })
      } else {
        initAssessment(newSession.id, TOTAL_ASSESSMENT_MINUTES * 60, newSession.questions)
        transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: newSession.id })
      }
    } catch (err: any) {
      const code = err?.response?.data?.code ?? err?.response?.data?.error
      console.error('[TutorialScreen] Failed to create session:', code, err)

      const currentSession = session || useSessionStore.getState().session
      if (currentSession?.id) {
        if (scheduledMs > nowMs) {
          transitionTo({ type: 'waiting-room', scheduledTimeMs: scheduledMs || Date.now(), inviteToken })
        } else {
          initAssessment(currentSession.id, TOTAL_ASSESSMENT_MINUTES * 60, currentSession.questions)
          transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: currentSession.id })
        }
        return
      }
    }
  }

  const StepContent = () => {
    switch (currentStep) {
      case 'layout':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Interface Overview</h2>
            
            {/* Step 1 Illustration with graceful fallback */}
            <IllustrationContainer
              src="/src/assets/illustrations/workspace-intro.svg"
              alt="Workspace Layout Diagram"
              fallbackIcon={HelpCircle}
              aspectRatio="aspect-[21/9]"
            />

            <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>The top bar displays your total remaining timer, integrity indicator, module navigation tabs, and the Review &amp; Submit trigger.</p>
              <p>The left sidebar contains the question navigation palette for jumping directly to any item within the active module. You can switch between modules at any time — suggested time budgets are provided as guidance only.</p>
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
                <div className="text-xl font-mono font-bold text-[var(--text-primary)] tracking-tight">45:00</div>
                <div className="text-xs text-[var(--text-secondary)]">Server-authoritative timer. Progress autosaves continuously.</div>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Total assessment time budget is <strong>{TOTAL_ASSESSMENT_MINUTES} minutes</strong>. Suggested per-module allocations:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {MODULES.map(m => (
                <div key={m.index} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] flex justify-between items-center">
                  <span className="font-medium text-[var(--text-primary)]">{m.name}</span>
                  <span className="text-[var(--accent)] font-mono font-semibold">~{m.suggestedMinutes}m</span>
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

      case 'module5-preview':
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Contextual Simulation Preview</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              In Module 5, realistic incoming on-call tickets and team messages arrive dynamically.
            </p>
            {/* Step 5 DOM-built mockup styling updated with design token system */}
            <div className="border border-[var(--border)] rounded-xl overflow-hidden shadow-[var(--shadow-sm)]">
              <div className="bg-[var(--surface)] px-3 py-2 border-b border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Inbox size={14} className="text-[var(--accent)]" />
                <span>Simulated Incident Inbox</span>
              </div>
              <div className="flex text-xs">
                <div className="w-48 border-r border-[var(--border)] p-2.5 bg-[var(--bg)] space-y-1.5">
                  <div className="p-2 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent)]/20 font-medium text-[var(--text-primary)]">
                    <div className="truncate font-semibold">#eng-oncall</div>
                    <div className="truncate text-[10px] text-[var(--text-secondary)]">API Latency Spike Alert</div>
                  </div>
                </div>
                <div className="flex-1 p-3 text-[11px] text-[var(--text-secondary)] bg-[var(--surface)]">
                  Messages stream in real-time. Select a thread to compose your reply.
                </div>
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
              <p className="text-xs text-[var(--text-secondary)]">Your timer starts when Module 1 initializes.</p>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="tutorial-heading">
      <div className="max-w-2xl w-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 id="tutorial-heading" className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
              {mode === 'full' ? 'Platform Tutorial' : 'Quick Orientation'}
            </h1>
            <div className="text-xs text-[var(--text-secondary)]">
              Step {stepIndex + 1} of {steps.length}
            </div>
          </div>

          {countdown !== null && countdown <= 60 && (
            <StatusChip
              variant="warning"
              label={countdown === 0 ? 'STARTING NOW' : `STARTING IN ${countdown}S`}
              size="sm"
              pulsing
            />
          )}
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] overflow-hidden" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemax={steps.length}>
          <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-300" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6 shadow-[var(--shadow-md)]">
          <StepContent />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStepIndex(i => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>

          <button
            onClick={handleNext}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
          >
            <span>{isLast ? (countdown === 0 ? 'Start Assessment' : 'Continue to Assessment') : 'Next'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

