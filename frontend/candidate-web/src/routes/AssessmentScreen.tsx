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
  const { initAssessment, setTimerStart, assessment, transitionTo } = useSessionStore()

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

  switch (moduleIndex) {
    case 0: return <MCQModule moduleIndex={0} />
    case 1: return <SQLModule moduleIndex={1} />
    case 2: return <CodingModule moduleIndex={2} />
    case 3: return <PromptingModule moduleIndex={3} />
    case 4: return <ContextualModule moduleIndex={4} />
    default: return null
  }
}
