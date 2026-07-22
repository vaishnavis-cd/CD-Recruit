import React, { useEffect } from 'react'
import { CONTEXTUAL_QUESTIONS } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { InFictionInbox } from '../../components/InFictionInbox'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'

interface ContextualModuleProps {
  moduleIndex: number
}

export function ContextualModule({ moduleIndex }: ContextualModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const assignedSimQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return CONTEXTUAL_QUESTIONS
    }
    const filtered = assessment.questions.filter(
      (q) => q.moduleType === 'SIMULATION' || (q.moduleType as string) === 'CONTEXTUAL'
    )
    if (filtered.length === 0) return []

    return filtered.map((q, i) => {
      const content = q.content || {}
      return {
        id: q.questionId,
        moduleIndex,
        type: 'contextual' as const,
        title: content.title || `Scenario ${i + 1}`,
        instructions:
          content.description ||
          content.instructions ||
          content.prompt ||
          "You've just joined the on-call rotation. Respond to incoming messages as they arrive.",
        scenarioId: content.scenarioId || q.questionId || 'api-incident',
      }
    })
  }, [assessment?.questions, moduleIndex])

  const questions = assignedSimQuestions
  const question = questions[currentIndex]

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

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
            onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer shadow-sm"
          >
            {nextButtonLabel}
          </button>
        </div>
      </div>
    </ModuleShell>
  )
}
