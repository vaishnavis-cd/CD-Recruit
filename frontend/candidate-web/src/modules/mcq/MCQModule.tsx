import React, { useEffect } from 'react'
import { MCQ_QUESTIONS } from '../../fixtures/questions'
import type { MCQQuestion } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'

interface MCQModuleProps {
  moduleIndex: number
}

export function MCQModule({ moduleIndex }: MCQModuleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const questions = MCQ_QUESTIONS
  const question = questions[currentIndex] as MCQQuestion

  // Restore current question from persisted state
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  const paletteItems = questions.map((q, i) => ({
    id: q.id,
    label: `Question ${i + 1}`,
  }))

  const currentAnswer = (assessment?.responses[question?.id] ?? []) as string[]

  function handleOptionToggle(optionId: string) {
    if (!question) return
    let next: string[]
    if (question.allowMultiple) {
      next = currentAnswer.includes(optionId)
        ? currentAnswer.filter(id => id !== optionId)
        : [...currentAnswer, optionId]
    } else {
      next = [optionId]
    }
    setResponse(question.id, next)
    if (next.length > 0 && (assessment?.questionStatus[question.id] !== 'flagged')) {
      setQuestionStatus(question.id, 'answered')
    }
  }

  function handleSkip() {
    setQuestionStatus(question.id, 'skipped')
    if (currentIndex < questions.length - 1) setCurrentIndex(i => i + 1)
  }

  if (!question) return null

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-2 text-sm font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Question {currentIndex + 1} of {questions.length}
        </div>

        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1 leading-relaxed">
          {question.text}
        </h2>

        {question.allowMultiple && (
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Select all that apply.
          </p>
        )}

        <fieldset className="mt-6" aria-label={`Options for question ${currentIndex + 1}`}>
          <legend className="sr-only">{question.text}</legend>
          <div className="space-y-3">
            {question.options.map(opt => {
              const selected = currentAnswer.includes(opt.id)
              const inputType = question.allowMultiple ? 'checkbox' : 'radio'
              const inputId = `opt-${question.id}-${opt.id}`

              return (
                <label
                  key={opt.id}
                  htmlFor={inputId}
                  className={`
                    flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                    hover:border-[var(--accent)] hover:bg-[var(--accent)]/5
                    focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-1
                    ${selected
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] bg-[var(--surface)]'
                    }
                  `}
                >
                  <input
                    id={inputId}
                    type={inputType}
                    name={question.allowMultiple ? `mcq-${question.id}-${opt.id}` : `mcq-${question.id}`}
                    checked={selected}
                    onChange={() => handleOptionToggle(opt.id)}
                    className="mt-0.5 w-4 h-4 text-[var(--accent)] border-[var(--border)] focus:ring-[var(--accent)] flex-shrink-0"
                  />
                  <span className="text-[var(--text-primary)] text-sm leading-relaxed">{opt.text}</span>
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
            className="px-4 py-2 rounded text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            aria-label="Previous question"
          >
            ← Previous
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              className="px-4 py-2 rounded text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              aria-label="Skip this question"
            >
              Skip
            </button>
            <button
              onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
              disabled={currentIndex === questions.length - 1}
              className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
              aria-label="Next question"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </ModuleShell>
  )
}
