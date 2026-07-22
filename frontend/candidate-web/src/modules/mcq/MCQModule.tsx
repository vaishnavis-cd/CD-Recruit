import React, { useEffect, useState } from 'react'
import type { MCQQuestion } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import apiClient from '../../api/client'

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
    if (!assessment?.questions || assessment.questions.length === 0) return []
    return assessment.questions.filter((q) => q.moduleType === 'MCQ')
  }, [assessment?.questions])

  const questions = assignedMcqQuestions
  const questionMetadata = questions[currentIndex]
  const questionId = questionMetadata?.questionId ?? ''

  const { handleNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, questions.length)

  const [questionData, setQuestionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Restore current question from persisted state
  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  // Fetch question details and responses from backend
  useEffect(() => {
    if (!assessment?.sessionId || !questionId) {
      setLoading(false)
      return
    }
    let isMounted = true
    setLoading(true)
    setError(null)
    apiClient.get(`/sessions/${assessment.sessionId}/questions/${questionId}`)
      .then(res => {
        if (isMounted) {
          setQuestionData(res.data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to load question details')
          setLoading(false)
        }
      })
    return () => { isMounted = false }
  }, [assessment?.sessionId, questionId])

  // Map to MCQQuestion structure
  const question = React.useMemo(() => {
    if (!questionData) return null
    const content = questionData.content || {}
    const rawOptions = content.options || []
    const options = rawOptions.map((opt: any, optIdx: number) => {
      if (typeof opt === 'string') return { id: `opt_${optIdx}`, text: opt }
      return { id: opt.id || `opt_${optIdx}`, text: opt.text || opt.label || `Option ${optIdx + 1}` }
    })
    return {
      id: questionId,
      moduleIndex,
      type: 'mcq' as const,
      text: content.prompt || content.text || content.question || content.title || 'MCQ Question',
      options,
      allowMultiple: Boolean(content.allowMultiple),
      correctIds: [],
    } as MCQQuestion
  }, [questionData, questionId, moduleIndex])

  // Sync DB response to store
  useEffect(() => {
    if (questionData && questionId) {
      const dbResponse = questionData.response?.responsePayload as { selectedOptions?: string[] } | undefined
      if (dbResponse?.selectedOptions && !assessment?.responses[questionId]) {
        setResponse(questionId, dbResponse.selectedOptions)
        setQuestionStatus(questionId, 'answered')
      }
    }
  }, [questionData, questionId])

  const currentSelection = (assessment?.responses[questionId] as string[] | undefined) || []

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
    setResponse(questionId, nextSelection)
    setQuestionStatus(questionId, 'answered')
  }

  function handleSkip() {
    if (!questionId) return
    if (!assessment?.questionStatus[questionId] || assessment?.questionStatus[questionId] === 'unvisited') {
      setQuestionStatus(questionId, 'skipped')
    }
    handleNext(() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1)))
  }

  const paletteItems = questions.map((q, i) => ({
    id: q.questionId,
    label: `Q${i + 1}`,
  }))

  if (loading) {
    return (
      <ModuleShell moduleIndex={moduleIndex} questions={paletteItems} currentQuestionIndex={currentIndex} onNavigate={setCurrentIndex}>
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <span className="text-[var(--text-secondary)] text-sm animate-pulse">Loading question…</span>
        </div>
      </ModuleShell>
    )
  }

  if (error || !question) {
    return (
      <ModuleShell moduleIndex={moduleIndex} questions={paletteItems} currentQuestionIndex={currentIndex} onNavigate={setCurrentIndex}>
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-2">
          <span className="text-[var(--warning)] text-sm">{error || 'No questions available for this module.'}</span>
        </div>
      </ModuleShell>
    )
  }

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
