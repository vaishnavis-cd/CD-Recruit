import React from 'react'
import { useSessionStore } from '../store/sessionMachine'

export function useModuleNavigation(moduleIndex: number, currentQuestionIndex: number, totalQuestionsInModule: number) {
  const assessment = useSessionStore((s) => s.assessment)
  const transitionTo = useSessionStore((s) => s.transitionTo)

  // Derive active modules dynamically from assigned questions
  const activeModulesCount = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return 5
    }
    const types: string[] = []
    for (const q of assessment.questions) {
      const type = q.moduleType as string
      const norm = type === 'CONTEXTUAL' ? 'SIMULATION' : type
      if (norm && !types.includes(norm)) {
        types.push(norm)
      }
    }
    return types.length > 0 ? types.length : 5
  }, [assessment?.questions])

  const isLastQuestionInModule = currentQuestionIndex >= totalQuestionsInModule - 1
  const isLastModule = moduleIndex >= activeModulesCount - 1

  const handleNext = (onAdvanceQuestion: () => void) => {
    if (!isLastQuestionInModule) {
      onAdvanceQuestion()
    } else {
      if (!isLastModule) {
        transitionTo({
          type: 'assessment',
          moduleIndex: moduleIndex + 1,
          sessionId: assessment?.sessionId ?? '',
        })
      } else {
        transitionTo({ type: 'pre-submit-review', sessionId: assessment?.sessionId ?? '' })
      }
    }
  }

  const nextButtonLabel = isLastQuestionInModule
    ? isLastModule
      ? 'Review & Submit →'
      : 'Next Module →'
    : 'Next →'

  return {
    isLastQuestionInModule,
    isLastModule,
    handleNext,
    nextButtonLabel,
  }
}
