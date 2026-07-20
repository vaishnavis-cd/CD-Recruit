import React, { useEffect } from 'react'
import { CONTEXTUAL_QUESTIONS } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { InFictionInbox } from '../../components/InFictionInbox'

interface ContextualModuleProps {
  moduleIndex: number
}

export function ContextualModule({ moduleIndex }: ContextualModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const questions = CONTEXTUAL_QUESTIONS
  const question = questions[currentIndex]

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex])

  const paletteItems = questions.map((q, i) => ({ id: q.id, label: `Scenario ${i + 1}` }))

  if (!question || !assessment) return null

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="flex flex-col h-full">
        {/* Instructions */}
        <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
          <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">
            Scenario {currentIndex + 1} of {questions.length}
          </div>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">
            {question.instructions}
          </p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Messages will arrive in real-time below. Read each one and reply where indicated.
          </p>
        </div>

        {/* Inbox */}
        <div className="flex-1 min-h-0 p-4">
          <InFictionInbox
            sessionId={assessment.sessionId}
            scenarioId={question.scenarioId}
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            ← Previous scenario
          </button>
          <button
            onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
            disabled={currentIndex === questions.length - 1}
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          >
            Next scenario →
          </button>
        </div>
      </div>
    </ModuleShell>
  )
}
