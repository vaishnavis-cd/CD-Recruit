import React from 'react'
import type { QuestionStatus } from '../store/sessionMachine'
import { useSessionStore } from '../store/sessionMachine'
import { Flag } from 'lucide-react'

interface QuestionPaletteProps {
  questions: Array<{ id: string; label: string }>
  moduleIndex: number
  currentQuestionIndex: number
  onNavigate: (index: number) => void
}

const STATUS_ITEMS: Array<{ status: QuestionStatus; dotColor: string; label: string }> = [
  { status: 'unvisited', dotColor: 'bg-[#94A3B8]', label: 'Not yet visited' },
  { status: 'answered', dotColor: 'bg-[#10B981]', label: 'Answered' },
  { status: 'skipped', dotColor: 'bg-[#F59E0B]', label: 'Skipped' },
  { status: 'flagged', dotColor: 'bg-[#8B5CF6]', label: 'Flagged for review' },
]

export function QuestionPalette({ questions, moduleIndex, currentQuestionIndex, onNavigate }: QuestionPaletteProps) {
  const questionStatus = useSessionStore(s => s.assessment?.questionStatus ?? {})

  return (
    <nav aria-label="Question palette" className="p-6 flex flex-col justify-between h-full bg-white dark:bg-[var(--surface)] select-none">
      <div>
        <div className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mb-4">
          QUESTIONS
        </div>

        {/* Question grid */}
        <div className="flex flex-wrap gap-2.5 mb-6" role="list">
          {questions.map((q, index) => {
            const status: QuestionStatus = questionStatus[q.id] ?? 'unvisited'
            const isCurrent = index === currentQuestionIndex

            let styleClass = 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] hover:border-[#2F65F6] hover:text-[#2F65F6]'
            if (isCurrent) {
              styleClass = 'bg-[#EFF6FF] border-2 border-[#2F65F6] text-[#2F65F6] font-bold shadow-2xs'
            } else if (status === 'answered') {
              styleClass = 'bg-emerald-50 border border-emerald-300 text-emerald-600 font-semibold'
            } else if (status === 'flagged') {
              styleClass = 'bg-purple-50 border border-purple-300 text-purple-600 font-semibold'
            } else if (status === 'skipped') {
              styleClass = 'bg-amber-50 border border-amber-300 text-amber-600 font-semibold'
            }

            return (
              <button
                key={q.id}
                role="listitem"
                onClick={() => onNavigate(index)}
                aria-label={`Question ${index + 1}${isCurrent ? ', currently viewing' : ''}`}
                aria-current={isCurrent ? 'true' : undefined}
                className={`
                  w-[38px] h-[38px] rounded-[7px] text-xs font-mono font-bold transition-all cursor-pointer flex items-center justify-center
                  ${styleClass}
                `}
              >
                {index + 1}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-[#E2E8F0] my-5" />

        {/* Legend */}
        <div className="space-y-3">
          {STATUS_ITEMS.map((item) => (
            <div key={item.status} className="flex items-center gap-2.5 text-xs text-[#475569] dark:text-slate-300">
              <span className={`w-2 h-2 rounded-full ${item.dotColor} flex-shrink-0`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flag instruction box */}
      <div className="bg-[#F8FAFC] dark:bg-[var(--background)] border border-[#E2E8F0] dark:border-[var(--border)] rounded-[8px] p-3 flex items-center gap-2.5 mt-8 text-xs text-[#475569] dark:text-slate-300 font-medium">
        <Flag size={14} className="text-[#475569] dark:text-slate-400 flex-shrink-0" />
        <span>Press F to flag question</span>
      </div>
    </nav>
  )
}
