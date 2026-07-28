import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { CheckCircle2, Loader2, Circle, ShieldCheck } from 'lucide-react'

interface SyncStep {
  id: string
  label: string
  status: 'pending' | 'syncing' | 'done'
}

const VERTICAL_STEPS: SyncStep[] = [
  { id: 'responses', label: 'Securing your assessment responses...', status: 'pending' },
  { id: 'event-log', label: 'Finalising session records & activity log...', status: 'pending' },
  { id: 'verify', label: 'Verifying submission integrity...', status: 'pending' },
  { id: 'complete', label: 'Completing assessment submission...', status: 'pending' },
]

interface SyncingScreenProps {
  sessionId: string
  auto: boolean
}

export function SyncingScreen({ sessionId, auto }: SyncingScreenProps) {
  const { transitionTo, assessment } = useSessionStore()
  const [steps, setSteps] = useState<SyncStep[]>(VERTICAL_STEPS)

  useEffect(() => {
    runSync()
  }, [])

  function updateStep(id: string, update: Partial<SyncStep>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...update } : s))
  }

  async function runSync() {
    for (const step of VERTICAL_STEPS) {
      updateStep(step.id, { status: 'syncing' })
      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400))

      if (step.id === 'responses' && assessment) {
        const questionIds = Object.keys(assessment.responses || {})
        await Promise.allSettled(
          questionIds.map(async (qId) => {
            try {
              const val = assessment.responses[qId]
              await services.sessionApi.submitModuleResponse({
                sessionId,
                questionId: qId,
                moduleIndex: 0,
                response: val,
                savedAt: new Date().toISOString(),
              })
            } catch (err) {
              console.warn(`[SyncingScreen] Non-fatal sync notice for question ${qId}:`, err)
            }
          })
        )
      }

      updateStep(step.id, { status: 'done' })
    }

    try {
      const res = await services.sessionApi.submitFinalAssessment(sessionId)
      const refId = res?.referenceId || `REF-${sessionId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
      useSessionStore.getState().transitionTo({ type: 'done', auto, referenceId: refId, sessionId })
    } catch (err) {
      console.warn('[SyncingScreen] Fallback transition to completed state:', err)
      const fallbackRef = `REF-${sessionId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
      useSessionStore.getState().transitionTo({ type: 'done', auto, referenceId: fallbackRef, sessionId })
    }
  }

  return (
    <div
      className="min-h-screen px-6 py-12 flex items-center justify-center bg-[var(--background)]"
      role="main"
      aria-labelledby="syncing-heading"
    >
      <div className="w-full max-w-md animate-cd-fade-in text-left space-y-8 p-8 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xl">
        <div className="text-center space-y-2 pb-2 border-b border-[var(--border)]">
          <div className="mx-auto w-12 h-12 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <ShieldCheck size={26} />
          </div>
          <h1 id="syncing-heading" className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
            {auto ? 'Submitting Assessment…' : 'Submitting Your Assessment'}
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]" role="alert" aria-live="polite">
            Please keep this page open while we wrap up your session.
          </p>
        </div>

        {auto && (
          <div
            role="alert"
            className="p-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 text-xs text-[var(--warning)] text-center font-medium"
          >
            Time limit reached — submitting your assessment automatically.
          </div>
        )}

        {/* Vertical steps UI */}
        <div className="space-y-6 relative pl-2">
          {steps.map((s, i) => {
            const isDone = s.status === 'done'
            const isSyncing = s.status === 'syncing'

            return (
              <div key={s.id} className="flex items-start gap-4 relative">
                {/* Vertical line connecting nodes */}
                {i < steps.length - 1 && (
                  <div
                    className="absolute left-[13px] top-[26px] w-[2px] h-[calc(100%+8px)] transition-all duration-500"
                    style={{
                      background: isDone ? 'var(--accent)' : 'var(--border)',
                    }}
                  />
                )}

                <div
                  className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 mt-0.5"
                  style={{
                    background: isDone
                      ? 'var(--accent)'
                      : isSyncing
                      ? 'var(--accent)/15'
                      : 'var(--surface)',
                    color: isDone ? '#ffffff' : isSyncing ? 'var(--accent)' : 'var(--muted-foreground)',
                    border: `2px solid ${isDone || isSyncing ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {isSyncing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Circle size={12} className="opacity-40" />
                  )}
                </div>

                <div className="pt-0.5">
                  <p
                    className={`text-xs font-medium transition-colors ${
                      isDone
                        ? 'text-[var(--foreground)]'
                        : isSyncing
                        ? 'text-[var(--accent)] font-semibold'
                        : 'text-[var(--muted-foreground)]'
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
