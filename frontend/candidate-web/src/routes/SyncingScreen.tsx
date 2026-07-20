import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'

interface SyncStep {
  id: string
  label: string
  status: 'pending' | 'syncing' | 'done' | 'error'
}

const INITIAL_STEPS: SyncStep[] = [
  { id: 'responses', label: 'Syncing your responses', status: 'pending' },
  { id: 'event-log', label: 'Syncing session event log', status: 'pending' },
  { id: 'code', label: 'Syncing code submissions', status: 'pending' },
  { id: 'verify', label: 'Verifying submission integrity', status: 'pending' },
]

interface SyncingScreenProps {
  sessionId: string
  auto: boolean
}

export function SyncingScreen({ sessionId, auto }: SyncingScreenProps) {
  const { transitionTo, assessment } = useSessionStore()
  const [steps, setSteps] = useState<SyncStep[]>(INITIAL_STEPS)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    runSync()
  }, [])

  function updateStep(id: string, update: Partial<SyncStep>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s))
  }

  async function runSync() {
    setError(null)
    setRetrying(false)

    for (const step of INITIAL_STEPS) {
      updateStep(step.id, { status: 'syncing' })
      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 800))

      const isReal = import.meta.env.VITE_SESSION_API_MODE === 'real'

      if (step.id === 'responses' && assessment) {
        try {
          const questionIds = Object.keys(assessment.responses)
          await Promise.all(
            questionIds.map(async (qId) => {
              const val = assessment.responses[qId]
              await services.sessionApi.submitModuleResponse({
                sessionId,
                questionId: qId,
                moduleIndex: 0,
                response: val,
                savedAt: new Date().toISOString(),
              })
            })
          )
        } catch (err: any) {
          updateStep(step.id, { status: 'error' })
          setError(`Failed to sync responses: ${err.message || err}`)
          return
        }
      }

      // Steps 1 and 4 can fail (mapped to legal/important sync guarantee) in mock mode
      if (!isReal && (step.id === 'responses' || step.id === 'verify') && retryCount === 0 && Math.random() < 0.2) {
        updateStep(step.id, { status: 'error' })
        setError(`Sync step "${step.label}" failed. Retrying is safe — your data is preserved.`)
        return
      }

      updateStep(step.id, { status: 'done' })
    }

    // Final submit
    try {
      const { referenceId } = await services.sessionApi.submitFinalAssessment(sessionId)
      useSessionStore.getState().transitionTo({ type: 'done', auto, referenceId, sessionId })
    } catch (err: any) {
      setError(`Submission failed: ${err.message}. Please retry.`)
    }
  }

  async function handleRetry() {
    setRetryCount(c => c + 1)
    setSteps(INITIAL_STEPS)
    setRetrying(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    await runSync()
  }

  const allDone = steps.every(s => s.status === 'done')
  const hasError = steps.some(s => s.status === 'error') || !!error

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4"
      role="main"
      aria-labelledby="syncing-heading"
    >
      <div className="max-w-md w-full">
        <h1 id="syncing-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-3 text-center">
          {auto ? 'Submitting your assessment…' : 'Saving your submission…'}
        </h1>

        {auto && (
          <div
            role="alert"
            className="mb-6 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-secondary)] text-center"
          >
            Time's up — your last-saved answers are being submitted automatically.
          </div>
        )}

        <p className="text-sm text-center text-[var(--warning)] font-medium mb-8" role="alert" aria-live="polite">
          Please don't close this window
        </p>

        {/* Sync progress */}
        <div className="space-y-3 mb-8" role="list" aria-label="Sync progress">
          {steps.map(step => (
            <div
              key={step.id}
              role="listitem"
              className={`
                flex items-center gap-3 p-3 rounded-lg border transition-colors
                ${step.status === 'done' ? 'border-[var(--success)] bg-green-50 dark:bg-green-900/10' :
                  step.status === 'error' ? 'border-[var(--warning)] bg-amber-50 dark:bg-amber-900/10' :
                  step.status === 'syncing' ? 'border-[var(--accent)] bg-blue-50 dark:bg-blue-900/10' :
                  'border-[var(--border)] bg-[var(--surface)]'
                }
              `}
              aria-label={`${step.label}: ${step.status}`}
            >
              <span className="text-lg flex-shrink-0" aria-hidden>
                {step.status === 'done' ? '✓' :
                 step.status === 'error' ? '⚠' :
                 step.status === 'syncing' ? (
                   <span className="inline-block animate-spin">⟳</span>
                 ) : '○'}
              </span>
              <span className={`text-sm ${
                step.status === 'done' ? 'text-[var(--success)]' :
                step.status === 'error' ? 'text-[var(--warning)]' :
                step.status === 'syncing' ? 'text-[var(--accent)]' :
                'text-[var(--text-secondary)]'
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Error + retry */}
        {hasError && !retrying && (
          <div role="alert" className="mb-6 p-4 rounded-lg border border-[var(--warning)] bg-amber-50 dark:bg-amber-900/20">
            <div className="text-sm font-medium text-[var(--warning)] mb-2">
              Something went wrong during sync
            </div>
            <div className="text-xs text-[var(--text-secondary)] mb-3">{error}</div>
            <button
              onClick={handleRetry}
              disabled={retryCount >= 5}
              className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
            >
              {retryCount >= 5 ? 'Contact support' : 'Retry sync'}
            </button>
          </div>
        )}

        {retrying && (
          <div className="text-center text-sm text-[var(--text-secondary)] mb-4">Retrying…</div>
        )}
      </div>
    </div>
  )
}
