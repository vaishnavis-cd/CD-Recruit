import React, { useEffect } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { useAssessmentTimer } from '../components/Timer'
import { MCQModule } from '../modules/mcq/MCQModule'
import { SQLModule } from '../modules/sql/SQLModule'
import { CodingModule } from '../modules/coding/CodingModule'
import { PromptingModule } from '../modules/prompting/PromptingModule'
import { ContextualModule } from '../modules/contextual/ContextualModule'

interface AssessmentScreenProps {
  moduleIndex: number
  sessionId: string
}

export function AssessmentScreen({ moduleIndex, sessionId }: AssessmentScreenProps) {
  const { setTimerStart, assessment } = useSessionStore()

  // Derive active modules dynamically from drive's assigned questions
  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return ['MCQ', 'SQL', 'CODING', 'AI_PROMPTING', 'SIMULATION']
    }
    const types: string[] = []
    for (const q of assessment.questions) {
      const type = q.moduleType as string
      if (type && !types.includes(type)) {
        types.push(type)
      }
    }
    return types.length > 0 ? types : ['MCQ', 'SQL', 'CODING', 'AI_PROMPTING', 'SIMULATION']
  }, [assessment?.questions])

  // Start timer when Module 1 opens (never before)
  useEffect(() => {
    if (moduleIndex === 0) {
      const nowMs = services.time.getServerNow()
      setTimerStart(nowMs)
    }
  }, [moduleIndex, sessionId])

  // The timer hook handles auto-submit on expiry
  useAssessmentTimer()

  if (!assessment) return null

  const currentModuleType = activeModules[moduleIndex] || activeModules[0]

  switch (currentModuleType) {
    case 'MCQ':
      return <MCQModule moduleIndex={moduleIndex} />
    case 'SQL':
      return <SQLModule moduleIndex={moduleIndex} />
    case 'CODING':
    case 'DEBUGGING':
      return <CodingModule moduleIndex={moduleIndex} />
    case 'AI_PROMPTING':
      return <PromptingModule moduleIndex={moduleIndex} />
    case 'SIMULATION':
    case 'CONTEXTUAL':
      return <ContextualModule moduleIndex={moduleIndex} />
    default:
      return <MCQModule moduleIndex={moduleIndex} />
  }
}
