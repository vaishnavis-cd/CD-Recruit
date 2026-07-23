import React from 'react'
import type { QuestionStatus } from '../store/sessionMachine'
import { useSessionStore } from '../store/sessionMachine'

interface QuestionPaletteProps {
  questions: Array<{ id: string; label: string }>
  moduleIndex: number
  currentQuestionIndex: number
  onNavigate: (index: number) => void
}

const STATUS_STYLES: Record<QuestionStatus, { bg: string; border: string; label: string }> = {
  unvisited:  { bg: 'bg-[var(--surface)]',          border: 'border-[var(--border)]',           label: 'Not yet visited' },
  answered:   { bg: 'bg-[var(--success-subtle)]',    border: 'border-[var(--success)]/40',       label: 'Answered' },
  skipped:    { bg: 'bg-[var(--surface)]',          border: 'border-[var(--text-secondary)]/40',label: 'Skipped' },
  flagged:    { bg: 'bg-[var(--warning-subtle)]',    border: 'border-[var(--warning)]/40',       label: 'Flagged for review' },
}

export function QuestionPalette({ questions, moduleIndex, currentQuestionIndex, onNavigate }: QuestionPaletteProps) {
  const questionStatus = useSessionStore(s => s.assessment?.questionStatus ?? {})

  return (
    <nav aria-label="Question palette" className="p-3">
      <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-3">
        Questions
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1 mb-4 text-xs text-[var(--text-secondary)]">
        {(Object.entries(STATUS_STYLES) as [QuestionStatus, typeof STATUS_STYLES[QuestionStatus]][]).map(([status, style]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm border ${style.bg} ${style.border} flex-shrink-0`} />
            <span>{style.label}</span>
          </div>
        ))}
      </div>

      {/* Question grid */}
      <div className="flex flex-wrap gap-1.5" role="list">
        {questions.map((q, index) => {
          const status: QuestionStatus = questionStatus[q.id] ?? 'unvisited'
          const style = STATUS_STYLES[status]
          const isCurrent = index === currentQuestionIndex
          const isCurrentModule = true // palette always shows current module

          return (
            <button
              key={q.id}
              role="listitem"
              onClick={() => onNavigate(index)}
              aria-label={`Question ${index + 1} — ${style.label}${isCurrent ? ', currently viewing' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              className={`
                w-8 h-8 rounded text-xs font-medium border transition-all
                ${style.bg} ${style.border}
                ${isCurrent
                  ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)] font-bold text-[var(--accent)]'
                  : 'text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                }
                focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1
              `}
            >
              {index + 1}
            </button>
          )
        })}
      </div>

      {/* Flag toggle helper */}
      <div className="mt-4 text-xs text-[var(--text-secondary)]">
        <kbd className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] font-mono text-xs">F</kbd>
        {' '}to flag/unflag current question
      </div>
    </nav>
  )
}
