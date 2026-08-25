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
import { getEffectiveModuleType } from '../utils/moduleType'
import { IdentityCaptureScheduler } from '../proctoring/identity-capture.scheduler'

interface AssessmentScreenProps {
  moduleIndex: number
  sessionId: string
}

export function AssessmentScreen({ moduleIndex, sessionId }: AssessmentScreenProps) {
  const { setTimerStart, assessment, session } = useSessionStore()

  // Derive active modules dynamically from drive's assigned questions
  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION']
    }
    const types: string[] = []
    for (const q of assessment.questions) {
      const type = getEffectiveModuleType(q)
      if (type && !types.includes(type)) {
        types.push(type)
      }
    }
    return types.length > 0 ? types : ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION']
  }, [assessment?.questions])

  // Start timer when Module 1 opens (never before)
  useEffect(() => {
    if (moduleIndex === 0) {
      const nowMs = services.time.getServerNow()
      setTimerStart(nowMs)
    }

    if (assessment?.sessionId || sessionId) {
      const activeSessionId = assessment?.sessionId || sessionId
      const durationMinutes = assessment?.totalSeconds
        ? Math.max(1, Math.round(assessment.totalSeconds / 60))
        : session?.durationMinutes || 15
      const startedAt = session?.startedAt || null

      console.log(`[AssessmentScreen] Initializing IdentityCaptureScheduler for session ${activeSessionId} (${durationMinutes} mins)...`)
      IdentityCaptureScheduler.getInstance().start(
        activeSessionId,
        durationMinutes,
        startedAt,
      )
    }
  }, [moduleIndex, sessionId, assessment?.sessionId, assessment?.totalSeconds, session?.durationMinutes, session?.startedAt])

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
    case 'SIMULATION':
    case 'CONTEXTUAL':
      return <ContextualModule moduleIndex={moduleIndex} />
    default:
      return <MCQModule moduleIndex={moduleIndex} />
  }
}
