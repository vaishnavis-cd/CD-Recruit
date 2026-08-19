import React, { useEffect } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { useAssessmentTimer } from '../components/Timer'
import { MCQModule } from '../modules/mcq/MCQModule'
import { SQLModule } from '../modules/sql/SQLModule'
import { CodingModule } from '../modules/coding/CodingModule'
import { DebuggingModule } from '../modules/debugging/DebuggingModule'
import { PromptingModule } from '../modules/prompting/PromptingModule'
import { ContextualModule } from '../modules/contextual/ContextualModule'
import { TestScenariosModule } from '../modules/test-scenarios/TestScenariosModule'
<<<<<<< HEAD
=======
import { NOSQLModule } from '../modules/nosql/NOSQLModule'
>>>>>>> origin/dev-phase2
import { getEffectiveModuleType } from '../utils/moduleType'

interface AssessmentScreenProps {
  moduleIndex: number
  sessionId: string
}

export function AssessmentScreen({ moduleIndex, sessionId }: AssessmentScreenProps) {
  const { setTimerStart, assessment } = useSessionStore()

  // Derive active modules dynamically from drive's assigned questions
  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
<<<<<<< HEAD
      return ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS']
=======
      return ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS', 'NOSQL']
>>>>>>> origin/dev-phase2
    }
    const types: string[] = []
    for (const q of assessment.questions) {
      const type = getEffectiveModuleType(q)
      if (type && !types.includes(type)) {
        types.push(type)
      }
    }
<<<<<<< HEAD
    return types.length > 0 ? types : ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS']
=======
    return types.length > 0 ? types : ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS', 'NOSQL']
>>>>>>> origin/dev-phase2
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
      return <CodingModule moduleIndex={moduleIndex} />
    case 'DEBUGGING':
      return <DebuggingModule moduleIndex={moduleIndex} />
    case 'AI_PROMPTING':
      return <PromptingModule moduleIndex={moduleIndex} />
<<<<<<< HEAD
=======
    case 'NOSQL':
      return <NOSQLModule moduleIndex={moduleIndex} />
>>>>>>> origin/dev-phase2
    case 'SIMULATION':
    case 'CONTEXTUAL':
      return <ContextualModule moduleIndex={moduleIndex} />
    case 'TEST_SCENARIOS':
      return <TestScenariosModule moduleIndex={moduleIndex} />
    default:
      return <MCQModule moduleIndex={moduleIndex} />
  }
}
