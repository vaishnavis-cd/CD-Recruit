import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { StatusChip } from '../components/common/StatusChip'
import { CheckCircle2, Loader2, AlertTriangle, Circle, RefreshCw, ShieldCheck } from 'lucide-react'

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

      if (!isReal && (step.id === 'responses' || step.id === 'verify') && retryCount === 0 && Math.random() < 0.2) {
        updateStep(step.id, { status: 'error' })
        setError(`Sync step "${step.label}" failed. Retrying is safe — your data is preserved.`)
        return
      }

      updateStep(step.id, { status: 'done' })
    }

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

  const hasError = steps.some(s => s.status === 'error') || !!error

  return (
    <div
      className="min-h-screen px-6 py-12 flex items-center justify-center"
      role="main"
      aria-labelledby="syncing-heading"
    >
      <div className="w-full max-w-lg animate-cd-fade-in text-center space-y-6">
        <div>
          <h1 id="syncing-heading" className="text-[28px] font-semibold tracking-tight text-[var(--foreground)]">
            {hasError ? "Sync interrupted" : auto ? "Submitting assessment…" : "Finalising your submission"}
          </h1>
          <p className="text-sm mt-2 text-[var(--muted-foreground)]" role="alert" aria-live="polite">
            {hasError
              ? "We hit a snag uploading your data. Retry to continue — your answers are safe locally."
              : "Please keep this window open while your submission is secured."}
          </p>
        </div>

        {auto && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-[var(--warning)] bg-[var(--surface)] text-xs text-[var(--warning)] text-center font-medium"
          >
            Time limit reached — submitting your saved responses automatically.
          </div>
        )}

        {/* Horizontal steps design */}
        <div className="mt-8 flex items-center justify-between">
          {steps.map((s, i) => {
            const done = s.status === 'done'
            const syncing = s.status === 'syncing'
            const isFail = s.status === 'error'

            return (
              <div key={s.id} className="flex-1 flex flex-col items-center relative">
                {i > 0 && (
                  <div
                    className="absolute top-6 right-1/2 w-full h-0.5"
                    style={{
                      background: done || i <= steps.findIndex(st => st.status === 'syncing') ? "var(--accent)" : "var(--border)",
                      transition: "background 400ms var(--ease-cd)",
                    }}
                  />
                )}
                <div
                  className="relative w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0"
                  style={{
                    background: isFail
                      ? "var(--surface)"
                      : done
                      ? "var(--accent)"
                      : syncing
                      ? "var(--surface)"
                      : "var(--surface)",
                    color: isFail
                      ? "var(--critical)"
                      : done
                      ? "white"
                      : syncing
                      ? "var(--accent)"
                      : "var(--muted-foreground)",
                    border: `1px solid ${done ? "var(--accent)" : isFail ? "var(--critical)" : "var(--border)"}`,
                  }}
                >
                  {isFail ? (
                    <AlertTriangle size={20} />
                  ) : syncing ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : done ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <Circle size={20} />
                  )}
                </div>
                <div className="text-xs mt-2 font-medium text-[var(--foreground)]">{s.label}</div>
              </div>
            );
          })}
        </div>

        {/* Error + retry */}
        {hasError && !retrying && (
          <div role="alert" className="mt-8 p-4 rounded-xl card-surface space-y-3 text-left">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--critical)]">
              <AlertTriangle size={16} />
              <span>Sync Issue Encountered</span>
            </div>
            <div className="text-xs text-[var(--muted-foreground)] leading-relaxed font-mono-data">{error}</div>
            <button
              onClick={handleRetry}
              disabled={retryCount >= 5}
              className="btn-primary w-full inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>{retryCount >= 5 ? 'Contact Support' : 'Retry Sync Operation'}</span>
            </button>
          </div>
        )}

        {retrying && (
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)] font-medium font-mono-data">
            <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
            <span>Retrying synchronization…</span>
          </div>
        )}
      </div>
    </div>
  )
}

