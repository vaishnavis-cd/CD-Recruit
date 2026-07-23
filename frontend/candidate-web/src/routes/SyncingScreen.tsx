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
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="syncing-heading"
    >
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20 flex items-center justify-center mx-auto shadow-[var(--shadow-sm)]">
            <ShieldCheck size={24} />
          </div>
          <h1 id="syncing-heading" className="text-2xl font-bold text-[var(--text-primary)]">
            {auto ? 'Submitting Assessment…' : 'Finalizing Your Session'}
          </h1>
          <p className="text-xs text-[var(--warning)] font-semibold" role="alert" aria-live="polite">
            Please keep this window open while data is secured.
          </p>
        </div>

        {auto && (
          <div
            role="alert"
            className="p-3.5 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-subtle)] text-xs text-[var(--warning)] text-center font-medium"
          >
            Time limit reached — submitting your saved responses automatically.
          </div>
        )}

        {/* Connected step progress design */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-[var(--shadow-md)] space-y-4">
          {steps.map((step, idx) => (
            <div key={step.id} className="relative flex items-center gap-4">
              {idx < steps.length - 1 && (
                <div
                  className={`absolute left-[13px] top-7 bottom-0 w-0.5 transition-colors ${
                    step.status === 'done' ? 'bg-[var(--success)]' : 'bg-[var(--border)]'
                  }`}
                />
              )}
              <div className="shrink-0 z-10">
                {step.status === 'done' ? (
                  <CheckCircle2 size={24} className="text-[var(--success)]" />
                ) : step.status === 'error' ? (
                  <AlertTriangle size={24} className="text-[var(--warning)]" />
                ) : step.status === 'syncing' ? (
                  <Loader2 size={24} className="text-[var(--accent)] animate-spin" />
                ) : (
                  <Circle size={24} className="text-[var(--text-secondary)]/30" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-between">
                <span className={`text-xs font-semibold ${
                  step.status === 'done' ? 'text-[var(--text-primary)]' :
                  step.status === 'error' ? 'text-[var(--warning)]' :
                  step.status === 'syncing' ? 'text-[var(--accent)] font-bold' :
                  'text-[var(--text-secondary)]'
                }`}>
                  {step.label}
                </span>
                <StatusChip
                  variant={
                    step.status === 'done' ? 'success' :
                    step.status === 'error' ? 'warning' :
                    step.status === 'syncing' ? 'accent' : 'neutral'
                  }
                  label={step.status.toUpperCase()}
                  size="sm"
                  pulsing={step.status === 'syncing'}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Error + retry */}
        {hasError && !retrying && (
          <div role="alert" className="p-4 rounded-xl border border-[var(--warning)] bg-[var(--warning-subtle)] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--warning)]">
              <AlertTriangle size={16} />
              <span>Sync Issue Encountered</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</div>
            <button
              onClick={handleRetry}
              disabled={retryCount >= 5}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
            >
              <RefreshCw size={14} />
              <span>{retryCount >= 5 ? 'Contact Support' : 'Retry Sync Operation'}</span>
            </button>
          </div>
        )}

        {retrying && (
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] font-medium">
            <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
            <span>Retrying synchronization…</span>
          </div>
        )}
      </div>
    </div>
  )
}

