import React from 'react'
import { Flag } from 'lucide-react'
import type { QuestionStatus } from '../store/sessionMachine'
import { useSessionStore } from '../store/sessionMachine'

interface QuestionPaletteProps {
  questions: Array<{ id: string; label: string }>
  moduleIndex: number
  currentQuestionIndex: number
  onNavigate: (index: number) => void
}

export function QuestionPalette({ questions, currentQuestionIndex, onNavigate }: QuestionPaletteProps) {
  const assessment = useSessionStore(s => s.assessment)
  const questionStatus = assessment?.questionStatus ?? {}
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const currentQuestion = questions[currentQuestionIndex]

  const handleToggleFlag = () => {
    if (!currentQuestion) return
    const current = questionStatus[currentQuestion.id] ?? 'unvisited'
    setQuestionStatus(currentQuestion.id, current === 'flagged' ? 'answered' : 'flagged')
  }

  return (
    <nav aria-label="Question palette" className="p-5 select-none bg-white dark:bg-[#111827]">
      <div className="text-2xs font-bold text-ink-dim dark:text-slate-400 uppercase tracking-wider mb-3">
        QUESTIONS
      </div>

      {/* Question grid */}
      <div className="flex flex-wrap gap-2.5" role="list">
        {questions.map((q, index) => {
          const status: QuestionStatus = questionStatus[q.id] ?? 'unvisited'
          const isCurrent = index === currentQuestionIndex

          let statusClass = 'border-line dark:border-slate-700 text-ink-secondary dark:text-slate-300 bg-white dark:bg-slate-800/80 hover:border-brand/50 hover:text-brand'
          if (isCurrent) {
            statusClass = 'border-2 border-brand text-brand bg-brand-subtle dark:bg-blue-950/60 font-bold shadow-xs'
          } else if (status === 'answered') {
            statusClass = 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
          } else if (status === 'skipped') {
            statusClass = 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-bold'
          } else if (status === 'flagged') {
            statusClass = 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 font-bold'
          }

          return (
            <button
              key={q.id}
              role="listitem"
              onClick={() => onNavigate(index)}
              aria-label={`Question ${index + 1} — ${status}${isCurrent ? ', currently viewing' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              className={`w-9 h-9 rounded-lg text-sm font-mono font-bold border transition-all cursor-pointer flex items-center justify-center ${statusClass}`}
            >
              {index + 1}
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="border-b border-line dark:border-slate-800 my-5" />

      {/* Vertical Status Legend */}
      <div className="space-y-2 text-xs text-ink-muted dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
          <span>Not yet visited</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
          <span>Answered</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
          <span>Skipped</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
          <span>Flagged for review</span>
        </div>
      </div>

      {/* Flag toggle action button */}
      <button
        type="button"
        onClick={handleToggleFlag}
        className="mt-6 w-full p-2.5 rounded-lg bg-surface dark:bg-slate-800/80 hover:bg-slate-100/80 dark:hover:bg-slate-700/80 border border-line dark:border-slate-700 text-xs text-ink-muted dark:text-slate-300 hover:text-ink dark:hover:text-white flex items-center gap-2 cursor-pointer transition-colors text-left"
        title="Toggle Flag on current question"
      >
        <Flag size={13} className="text-ink-secondary dark:text-slate-400 shrink-0" />
        <span>Press <strong className="font-bold text-ink dark:text-white">F</strong> to flag question</span>
      </button>
    </nav>
  )
}
