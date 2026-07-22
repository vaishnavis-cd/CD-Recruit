import React, { useEffect } from 'react'
import { MCQ_QUESTIONS } from '../../fixtures/questions'
import type { MCQQuestion } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'

interface MCQModuleProps {
  moduleIndex: number
}

export function MCQModule({ moduleIndex }: MCQModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const assignedMcqQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return MCQ_QUESTIONS
    const filtered = assessment.questions.filter((q) => q.moduleType === 'MCQ')
    if (filtered.length === 0) return []
    return filtered.map((q, i) => {
      const content = q.content || {}
      const rawOptions = content.options || ['Option A', 'Option B', 'Option C', 'Option D']
      const options = rawOptions.map((opt: any, optIdx: number) => {
        if (typeof opt === 'string') return { id: `opt_${optIdx}`, text: opt }
        return { id: opt.id || `opt_${optIdx}`, text: opt.text || opt.label || `Option ${optIdx + 1}` }
      })
      return {
        id: q.questionId,
        moduleIndex,
        type: 'mcq' as const,
        text: content.prompt || content.text || content.question || content.title || `MCQ Question ${i + 1}`,
        options,
        allowMultiple: Boolean(content.allowMultiple),
        correctIds: [],
      } as MCQQuestion
    })
  }, [assessment?.questions, moduleIndex])

  const questions = assignedMcqQuestions
  const question = questions[currentIndex] as MCQQuestion

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

  // Restore current question from persisted state
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  const currentSelection = (assessment?.responses[question?.id] as string[] | undefined) || []

  function handleOptionSelect(optionId: string) {
    if (!question) return
    let nextSelection: string[]
    if (question.allowMultiple) {
      nextSelection = currentSelection.includes(optionId)
        ? currentSelection.filter(id => id !== optionId)
        : [...currentSelection, optionId]
    } else {
      nextSelection = [optionId]
    }
    setResponse(question.id, nextSelection)
    setQuestionStatus(question.id, 'answered')
  }

  function handleSkip() {
    if (!question) return
    if (!assessment?.questionStatus[question.id] || assessment?.questionStatus[question.id] === 'unvisited') {
      setQuestionStatus(question.id, 'skipped')
    }
    handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))
  }

  const paletteItems = questions.map((q, i) => ({
    id: q.id,
    label: `Q${i + 1}`,
  }))

  if (!question) return null

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="max-w-3xl mx-auto py-8 px-6">
        {/* Question Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs font-semibold tracking-wider uppercase text-[var(--accent)] font-mono">
            Question {currentIndex + 1} of {questions.length}
          </span>
          {question?.allowMultiple && (
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
              Multiple select
            </span>
          )}
        </div>

        {/* Question Text */}
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-6 leading-relaxed">
          {question?.text}
        </h2>

        {/* Options */}
        <fieldset aria-label={`Question ${currentIndex + 1} options`}>
          <legend className="sr-only">Options</legend>
          <div className="space-y-3">
            {question?.options.map(option => {
              const isSelected = currentSelection.includes(option.id)
              const inputType = question.allowMultiple ? 'checkbox' : 'radio'

              return (
                <label
                  key={option.id}
                  className={`
                    flex items-center gap-4 p-4 rounded-lg border text-sm transition-all cursor-pointer
                    ${isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--text-primary)] font-medium'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }
                  `}
                >
                  <input
                    type={inputType}
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => handleOptionSelect(option.id)}
                    className="sr-only"
                  />

                  {/* Custom Indicator */}
                  <span
                    aria-hidden
                    className={`
                      w-5 h-5 rounded flex items-center justify-center border text-xs font-bold transition-colors shrink-0
                      ${question.allowMultiple ? 'rounded-md' : 'rounded-full'}
                      ${isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                      }
                    `}
                  >
                    {isSelected ? '✓' : option.id.toUpperCase()}
                  </span>

                  <span className="flex-1">{option.text}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--border)]">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
            aria-label="Previous question"
          >
            ← Previous
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              className="px-4 py-2 rounded text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
              aria-label="Skip this question"
            >
              Skip
            </button>
            <button
              onClick={() => handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))}
              className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer shadow-sm"
              aria-label={nextButtonLabel}
            >
              {nextButtonLabel}
            </button>
          </div>
        </div>
      </div>
    </ModuleShell>
  )
}
