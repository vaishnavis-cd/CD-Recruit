import React from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { MODULES } from '../fixtures/questions'
import { Timer } from '../components/Timer'
import type { QuestionStatus } from '../store/sessionMachine'

interface DynamicModuleSummary {
  moduleType: string
  name: string
  index: number
  questionIds: string[]
}

const MODULE_NAMES: Record<string, string> = {
  MCQ: 'Multiple Choice Questions',
  SQL: 'SQL Database Queries',
  CODING: 'Coding Challenges',
  AI_PROMPTING: 'AI Prompt Engineering',
  SIMULATION: 'Interactive System Outage Scenario',
  CONTEXTUAL: 'Interactive System Outage Scenario',
}

function deriveModules(assessmentQuestions?: any[]): DynamicModuleSummary[] {
  if (!assessmentQuestions || assessmentQuestions.length === 0) {
    return MODULES.map(m => ({
      moduleType: m.type,
      name: m.name,
      index: m.index,
      questionIds: m.questionIds,
    }))
  }

  const map = new Map<string, string[]>()
  for (const q of assessmentQuestions) {
    const type = q.moduleType || 'MCQ'
    if (!map.has(type)) {
      map.set(type, [])
    }
    map.get(type)!.push(q.questionId)
  }

  const result: DynamicModuleSummary[] = []
  let index = 0
  for (const [type, questionIds] of map.entries()) {
    result.push({
      moduleType: type,
      name: MODULE_NAMES[type] || type,
      index: index++,
      questionIds,
    })
  }
  return result
}

export function PreSubmitReview() {
  const { screen, transitionTo, assessment } = useSessionStore()

  if (screen.type !== 'pre-submit-review' || !assessment) return null

  const { sessionId } = screen
  const activeModules = deriveModules(assessment.questions)

  function countStatus(mod: DynamicModuleSummary, status: QuestionStatus): number {
    return mod.questionIds.filter(id => (assessment!.questionStatus[id] ?? 'unvisited') === status).length
  }

  function countUnanswered(mod: DynamicModuleSummary): number {
    return mod.questionIds.filter(id => {
      const s = assessment!.questionStatus[id] ?? 'unvisited'
      const hasResponse = assessment!.responses[id] !== undefined && assessment!.responses[id] !== null && assessment!.responses[id] !== ''
      return !hasResponse && (s === 'unvisited' || s === 'skipped')
    }).length
  }

  function handleSubmit() {
    transitionTo({ type: 'syncing', sessionId, auto: false })
  }

  function handleGoBack() {
    transitionTo({ type: 'assessment', moduleIndex: assessment!.currentModuleIndex, sessionId })
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="review-heading"
    >
      <div className="max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 id="review-heading" className="text-2xl font-semibold text-[var(--text-primary)]">
            Review your assessment
          </h1>
          <Timer />
        </div>

        <p className="text-[var(--text-secondary)] text-sm mb-8">
          Check your completion status below before submitting. You can go back to any module to review or change your answers.
        </p>

        {/* Per-module completion summary */}
        <div className="space-y-3 mb-8">
          {activeModules.map(mod => {
            const answered = countStatus(mod, 'answered')
            const flagged = countStatus(mod, 'flagged')
            const unanswered = countUnanswered(mod)
            const total = mod.questionIds.length

            return (
              <div
                key={mod.index}
                className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--bg)] border border-[var(--border)] text-xs flex items-center justify-center text-[var(--text-secondary)] font-medium">
                      {mod.index + 1}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{mod.name}</span>
                  </div>
                  <button
                    onClick={() => transitionTo({ type: 'assessment', moduleIndex: mod.index, sessionId })}
                    className="text-xs text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded cursor-pointer"
                    aria-label={`Go back to ${mod.name}`}
                  >
                    Return to module →
                  </button>
                </div>

                <div className="flex gap-4 text-xs">
                  <span className="text-[var(--success)] font-medium">{answered} answered</span>
                  {flagged > 0 && (
                    <span className="text-[var(--warning)] font-medium">{flagged} flagged</span>
                  )}
                  {unanswered > 0 && (
                    <span className="text-[var(--text-secondary)]">{unanswered} unanswered</span>
                  )}
                  <span className="text-[var(--text-secondary)] ml-auto">{total} total</span>
                </div>

                {/* Completion bar */}
                <div
                  className="mt-2 h-1.5 rounded-full bg-[var(--border)] overflow-hidden"
                  role="progressbar"
                  aria-valuenow={answered}
                  aria-valuemax={total}
                  aria-label={`${mod.name}: ${answered} of ${total} answered`}
                >
                  <div
                    className="h-full rounded-full bg-[var(--success)] transition-all"
                    style={{ width: `${total > 0 ? (answered / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Unanswered warning */}
        {activeModules.some(m => countUnanswered(m) > 0) && (
          <div
            role="note"
            className="mb-6 p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-700 dark:text-amber-300"
          >
            Some questions have not been answered. You can still submit — unanswered questions will receive no score. If you want to complete them, use the "Return to module" links above.
          </div>
        )}

        {/* Submit / back */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleGoBack}
            className="flex-1 py-3 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
          >
            ← Return to assessment
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer"
            aria-label="Submit final assessment — this action cannot be undone"
          >
            Submit Final Assessment →
          </button>
        </div>

        <p className="text-xs text-center text-[var(--text-secondary)] mt-3">
          This action cannot be undone. Your responses are already saved locally.
        </p>
      </div>
    </div>
  )
}
