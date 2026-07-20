import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES, TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'

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

  // Scheduled time for soft-interrupt countdown (Buffer mode only)
  const [scheduledMs] = useState(() => {
    // Load from localStorage (set by InviteResolver or dev panel)
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
        // T has arrived — soft interrupt, don't hard-cut
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
    // Create session if not yet created
    if (!session) {
      try {
        const selfieDataUrl = localStorage.getItem('cd-recruit-selfie-data')
        const newSession = await services.sessionApi.createSession(
          inviteToken,
          cvMode,
          mode,
          selfieDataUrl
        )
        setSession(newSession)
        const scheduledMs = parseInt(localStorage.getItem('cd-recruit-scheduled-ms') ?? '0')
        const nowMs = services.time.getServerNow()

        if (mode === 'full' && scheduledMs > nowMs) {
          // Still before T — go to waiting room
          transitionTo({ type: 'waiting-room', scheduledTimeMs: scheduledMs, inviteToken })
        } else {
          // Grace path or T arrived: start assessment immediately
          initAssessment(newSession.id, TOTAL_ASSESSMENT_MINUTES * 60)
          transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: newSession.id })
        }
      } catch (err) {
        console.error('Failed to create session:', err)
      }
    } else {
      initAssessment(session.id, TOTAL_ASSESSMENT_MINUTES * 60)
      transitionTo({ type: 'assessment', moduleIndex: 0, sessionId: session.id })
    }
  }

  const StepContent = () => {
    switch (currentStep) {
      case 'layout':
        return (
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Interface overview</h2>
            <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <div className="grid grid-cols-3 gap-3">
                {/* Mini mockup of the layout */}
                <div className="col-span-3 border border-[var(--border)] rounded-lg overflow-hidden" aria-label="Interface layout diagram">
                  <div className="bg-[var(--surface)] border-b border-[var(--border)] px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-primary)]">Module name</span>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-[var(--accent)]/20 text-[var(--accent)] font-mono">00:00</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--accent)] text-white">Review &amp; Submit</span>
                    </div>
                  </div>
                  <div className="flex">
                    <div className="w-20 border-r border-[var(--border)] bg-[var(--surface)] p-2">
                      <div className="text-xs text-[var(--text-secondary)] mb-2">Questions</div>
                      <div className="grid grid-cols-3 gap-1">
                        {[1,2,3,4,5,6].map(n => (
                          <div key={n} className={`w-5 h-5 rounded text-center text-xs flex items-center justify-center border ${n === 1 ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)]'}`}>{n}</div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 p-3 text-xs text-[var(--text-secondary)]">Question content area</div>
                  </div>
                </div>
              </div>
              <p>The left sidebar shows all questions in the current module. The top bar has your timer and navigation.</p>
              <p>You can switch between modules freely using the numbered tabs at the top — this is a soft-budget model. The timer shows your total remaining time, and suggested allocations per module are shown as guidance only.</p>
            </div>
          </div>
        )

      case 'timer':
        return (
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Timer and time management</h2>
            <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="text-3xl font-mono font-bold text-[var(--text-primary)] tabular-nums">45:22</div>
                <div>
                  <div className="text-[var(--text-primary)] font-medium mb-1">Total remaining time</div>
                  <div className="text-xs">Shifts to amber at 10 and 5 minutes remaining</div>
                </div>
              </div>
              <p>The timer is <strong>server-authoritative</strong> — it continues running even if your connection drops briefly. Your work is saved automatically every time you make a change.</p>
              <p>Total assessment time is <strong>{TOTAL_ASSESSMENT_MINUTES} minutes</strong>. Per-module suggestions:</p>
              <ul className="space-y-1">
                {MODULES.map(m => (
                  <li key={m.index} className="flex justify-between">
                    <span>{m.name}</span>
                    <span className="font-medium text-[var(--text-primary)]">~{m.suggestedMinutes} min</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs">These are suggestions only — you control how you allocate your time.</p>
            </div>
          </div>
        )

      case 'palette':
        return (
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Question palette</h2>
            <div className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>Each question number in the palette has a color indicating its status:</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { status: 'Unvisited', style: 'bg-[var(--surface)] border-[var(--border)]', note: 'Not opened yet' },
                  { status: 'Answered', style: 'bg-[var(--success)]/20 border-[var(--success)]', note: 'Response saved' },
                  { status: 'Skipped', style: 'bg-[var(--text-secondary)]/15 border-[var(--text-secondary)]', note: 'Marked to return to' },
                  { status: 'Flagged', style: 'bg-amber-100 dark:bg-amber-900/30 border-[var(--warning)]', note: 'Flagged for review' },
                ].map(({ status, style, note }) => (
                  <div key={status} className={`flex items-start gap-3 p-3 rounded-lg border ${style}`}>
                    <div className={`w-7 h-7 rounded text-center text-xs flex items-center justify-center border font-medium ${style} flex-shrink-0`}>3</div>
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{status}</div>
                      <div className="text-xs">{note}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p>Press <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] font-mono text-xs">F</kbd> on any question to flag or unflag it for review.</p>
              <p>You can navigate freely — coming back to a question won't reset your previous answer.</p>
            </div>
          </div>
        )

      case 'run-vs-submit':
        return (
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Run vs Submit (coding and SQL)</h2>
            <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/5">
                  <div className="font-semibold text-[var(--text-primary)] mb-2">Run</div>
                  <ul className="space-y-1 text-xs">
                    <li>• Executes visible test cases only</li>
                    <li>• Shows pass/fail for each visible case</li>
                    <li>• Use as often as you like</li>
                    <li>• Doesn't "count" as your submission</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg border border-[var(--success)] bg-[var(--success)]/5">
                  <div className="font-semibold text-[var(--text-primary)] mb-2">Submit</div>
                  <ul className="space-y-1 text-xs">
                    <li>• Runs visible AND hidden test cases</li>
                    <li>• Hidden case results are never shown</li>
                    <li>• Records your answer for evaluation</li>
                    <li>• You can still change your code after</li>
                  </ul>
                </div>
              </div>
              <p>The "Review &amp; Submit" button at the top right submits your <em>entire assessment</em> — that's different from the per-question Submit button in coding/SQL modules.</p>
            </div>
          </div>
        )

      case 'module5-preview':
        return (
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Module 5: Contextual Simulation</h2>
            <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <p>Module 5 is different from the others. Instead of isolated questions, you'll receive a series of realistic messages (emails, Slack messages, and support tickets) that arrive over time during the module.</p>
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="bg-[var(--surface)] px-3 py-2 border-b border-[var(--border)] text-xs font-medium text-[var(--text-secondary)]">
                  Preview: what the inbox looks like
                </div>
                <div className="flex">
                  <div className="w-48 border-r border-[var(--border)] p-3 bg-[var(--surface)]">
                    <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Inbox</div>
                    {[
                      { from: 'priya@fictionalco.com', subject: 'Quick question...', read: true },
                      { from: '#eng-oncall', subject: 'Alert: latency spike', read: false },
                    ].map((m, i) => (
                      <div key={i} className={`p-2 rounded text-xs mb-1 ${!m.read ? 'font-medium bg-[var(--bg)]' : 'text-[var(--text-secondary)]'}`}>
                        <div className="truncate">{m.from}</div>
                        <div className="truncate text-[var(--text-secondary)]">{m.subject}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 p-3 text-xs text-[var(--text-secondary)]">
                    Message content appears here. You can scroll back through earlier messages while replying to new ones.
                  </div>
                </div>
              </div>
              <p>Messages arrive in real-time during the module. Reply where indicated. Earlier messages stay visible so you can reference them — scroll up in the inbox at any time.</p>
            </div>
          </div>
        )

      case 'practice':
        return (
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">Practice question (zero stakes)</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">This doesn't count toward your assessment. It's just to check the interface works as you'd expect.</p>
            <fieldset>
              <legend className="text-sm font-medium text-[var(--text-primary)] mb-3">
                Which of the following is the correct HTTP status code for "resource not found"?
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
                    htmlFor={`practice-${opt.id}`}
                    className={`
                      flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                      ${practiceAnswer === opt.id
                        ? opt.id === 'c'
                          ? 'border-[var(--success)] bg-[var(--success)]/10'
                          : 'border-[var(--critical)] bg-[var(--critical)]/10'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
                      }
                    `}
                  >
                    <input
                      id={`practice-${opt.id}`}
                      type="radio"
                      name="practice"
                      checked={practiceAnswer === opt.id}
                      onChange={() => setPracticeAnswer(opt.id)}
                      className="w-4 h-4 text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--text-primary)]">{opt.text}</span>
                  </label>
                ))}
              </div>
              {practiceAnswer && (
                <p className={`mt-3 text-sm font-medium ${practiceAnswer === 'c' ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                  {practiceAnswer === 'c'
                    ? '✓ Correct! 404 Not Found is the standard response when a resource doesn\'t exist.'
                    : '← Try a different answer — instant feedback like this only appears during the tutorial.'
                  }
                </p>
              )}
            </fieldset>
          </div>
        )

      case 'done':
        return (
          <div className="text-center">
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">You're ready</h2>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Your {TOTAL_ASSESSMENT_MINUTES}-minute timer starts when Module 1 opens — not now.
            </p>
            <p className="text-[var(--text-secondary)] text-sm">
              Good luck.
            </p>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="tutorial-heading">
      <div className="max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 id="tutorial-heading" className="text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wide">
              {mode === 'full' ? 'Tutorial' : 'Quick orientation'}
            </h1>
            <div className="text-xs text-[var(--text-secondary)] mt-0.5">
              Step {stepIndex + 1} of {steps.length}
            </div>
          </div>

          {/* Soft-interrupt countdown */}
          {countdown !== null && countdown <= 60 && (
            <div
              role="alert"
              aria-live="polite"
              className="px-3 py-2 rounded-lg border border-[var(--warning)] bg-amber-50 dark:bg-amber-900/20 text-sm text-[var(--warning)] font-medium"
            >
              {countdown === 0 ? 'Assessment starting now' : `Starting in ${countdown}s`}
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="h-1 rounded-full bg-[var(--border)] mb-8 overflow-hidden" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemax={steps.length}>
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-8 mb-8">
          <StepContent />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStepIndex(i => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            ← Back
          </button>

          <button
            onClick={handleNext}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          >
            {isLast ? (countdown === 0 ? 'Start assessment →' : 'Continue to assessment →') : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
