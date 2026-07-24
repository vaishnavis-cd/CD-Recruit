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
    <nav aria-label="Question palette" className="p-4">
      <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
        Questions
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-xs text-[var(--muted-foreground)]">
        {(Object.entries(STATUS_STYLES) as [QuestionStatus, typeof STATUS_STYLES[QuestionStatus]][]).map(([status, style]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${style.bg} ${style.border} flex-shrink-0`} />
            <span className="text-[11px]">{style.label}</span>
          </div>
        ))}
      </div>

      {/* Question grid */}
      <div className="flex flex-wrap gap-2" role="list">
        {questions.map((q, index) => {
          const status: QuestionStatus = questionStatus[q.id] ?? 'unvisited'
          const style = STATUS_STYLES[status]
          const isCurrent = index === currentQuestionIndex

          return (
            <button
              key={q.id}
              role="listitem"
              onClick={() => onNavigate(index)}
              aria-label={`Question ${index + 1} — ${style.label}${isCurrent ? ', currently viewing' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              className={`
                w-9 h-9 rounded-lg text-xs font-mono-data font-medium border transition-all cursor-pointer flex items-center justify-center
                ${style.bg} ${style.border}
                ${isCurrent
                  ? 'ring-2 ring-[var(--accent)] font-bold text-[var(--accent)] bg-[var(--surface)]'
                  : 'text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                }
              `}
            >
              {index + 1}
            </button>
          )
        })}
      </div>

      {/* Flag toggle helper */}
      <div className="mt-6 pt-4 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 font-mono-data">
        <kbd className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[11px]">F</kbd>
        <span>to flag question</span>
      </div>
    </nav>
  )
}
