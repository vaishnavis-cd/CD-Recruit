import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessionMachine'
import { ContextSimulationWorkspace } from './components/ContextSimulationWorkspace'
import { InitialSayStep } from './components/InitialSayStep'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import { getEffectiveModuleType } from '../../utils/moduleType'
import apiClient from '../../api/client'
import { Loader2 } from 'lucide-react'

interface ContextualModuleProps {
  moduleIndex: number
}

const DEFAULT_SCENARIO = {
  id: 'qa-bug-login-validation',
  title: 'QA Bug Report: Login Validation Error',
  description:
    'During regression testing, QA discovered that login validation incorrectly accepts usernames with leading or trailing spaces. The issue has been reproduced consistently and marked as High Priority. Investigate the issue, implement a fix and verify that existing functionality is not affected.',
  initialSayPrompt: 'What would you do to solve this issue?',
  starterCode: {
    python: `# validation.py\n\ndef validate_username(username: str) -> bool:\n    """\n    Validates a username for login.\n    Requirements:\n    - Must be between 3 and 20 characters long.\n    - Must NOT contain leading or trailing spaces.\n    - Must only contain alphanumeric characters or underscores.\n    """\n    if not username:\n        return False\n    \n    # QA BUG: Missing leading/trailing space validation!\n    if len(username) < 3 or len(username) > 20:\n        return False\n        \n    return all(c.isalnum() or c == '_' or c == ' ' for c in username)\n`,
    javascript: `// validation.js\n\nfunction validateUsername(username) {\n  if (!username || typeof username !== 'string') {\n    return false;\n  }\n\n  // QA BUG: Missing leading/trailing space check!\n  if (username.length < 3 || username.length > 20) {\n    return false;\n  }\n\n  return /^[a-zA-Z0-9_ ]+$/.test(username);\n}\n\nmodule.exports = { validateUsername };\n`,
  },
  testCases: [
    { input: '"valid_user"', expectedOutput: 'true', label: 'Sample Valid Username', isHidden: false },
    { input: '" user_123"', expectedOutput: 'false', label: 'Leading Space Bug Check', isHidden: false },
    { input: '"user_123 "', expectedOutput: 'false', label: 'Trailing Space Bug Check', isHidden: false },
    { input: '" user_123 "', expectedOutput: 'false', label: 'Hidden Both Spaces Test', isHidden: true },
    { input: '"ab"', expectedOutput: 'false', label: 'Hidden Length Short Test', isHidden: true },
  ],
}

export function ContextualModule({ moduleIndex }: ContextualModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const transitionTo = useSessionStore(s => s.transitionTo)
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const setResponse = useSessionStore(s => s.setResponse)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const sessionId = assessment?.sessionId || ''

  // Active module tabs
  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return ['SIMULATION']
    }
    const types: string[] = []
    for (const q of assessment.questions) {
      const type = getEffectiveModuleType(q)
      if (type && !types.includes(type)) {
        types.push(type)
      }
    }
    return types.length > 0 ? types : ['SIMULATION']
  }, [assessment?.questions])

  const assignedSimQuestions = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) return [{ questionId: 'qa-bug-login-validation' }]
    const list = assessment.questions.filter((q) => {
      const t = getEffectiveModuleType(q)
      return t === 'SIMULATION' || t === 'CONTEXTUAL'
    })
    return list.length > 0 ? list : [{ questionId: 'qa-bug-login-validation' }]
  }, [assessment?.questions])

  const { handleNext } = useModuleNavigation(moduleIndex, currentIndex, assignedSimQuestions.length)

  const [step, setStep] = useState<'LOADING' | 'BRIEFING' | 'WORKSPACE'>('LOADING')
  const [scenario, setScenario] = useState<any>(DEFAULT_SCENARIO)

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  // Fetch Scenario Config from backend & restore step
  useEffect(() => {
    const savedResponse = (assessment?.responses && scenario?.id ? assessment.responses[scenario.id] : undefined) as { initialSayText?: string; completed?: boolean } | undefined

    if (savedResponse?.initialSayText) {
      setStep('WORKSPACE')
    }

    if (!sessionId) {
      if (!savedResponse?.initialSayText) {
        setStep('BRIEFING')
      }
      return
    }

    apiClient.get(`/sessions/${sessionId}/simulation/scenario`)
      .then(res => {
        if (res.data) {
          setScenario({
            ...DEFAULT_SCENARIO,
            ...res.data,
          })
          const hasSay = res.data.hasInitialSay || !!res.data.initialSayText || !!savedResponse?.initialSayText
          if (hasSay) {
            setStep('WORKSPACE')
          } else {
            setStep('BRIEFING')
          }
        }
      })
      .catch(err => {
        console.warn('[ContextualModule] Using default scenario:', err)
        if (!savedResponse?.initialSayText) {
          setStep('BRIEFING')
        }
      })
      .finally(() => {
        if (step === 'LOADING') {
          setStep(savedResponse?.initialSayText ? 'WORKSPACE' : 'BRIEFING')
        }
      })
  }, [sessionId, currentIndex])

  // Handle Initial SAY submit from Briefing
  const handleInitialSaySubmit = async (initialSayText: string) => {
    if (sessionId) {
      try {
        await apiClient.post(`/sessions/${sessionId}/simulation/initial-say`, {
          text: initialSayText,
        })
      } catch (err) {
        console.warn('Error saving initial say:', err)
      }
    }

    const questionId = scenario?.id || 'simulation-question'
    const currentResp = (assessment?.responses && questionId ? assessment.responses[questionId] : {}) || {}
    setQuestionStatus(questionId, 'answered')
    setResponse(questionId, { ...currentResp, initialSayText, completed: false })

    // Transition directly into live workstation!
    setStep('WORKSPACE')
  }

  // Handle final simulation submit & immediately advance to next question / module
  const handleSimulationSubmit = async (signoffData?: any) => {
    if (sessionId) {
      try {
        await apiClient.post(`/sessions/${sessionId}/simulation/submit`, {
          completed: true,
          ...signoffData,
        })
      } catch (err) {
        console.warn('Simulation submit error:', err)
      }
    }

    const questionId = scenario?.id || 'simulation-question'
    const currentResp = (assessment?.responses && questionId ? assessment.responses[questionId] : {}) || {}
    setQuestionStatus(questionId, 'answered')
    setResponse(questionId, { ...currentResp, completed: true, ...signoffData })

    // Seamless instant advancement
    handleNext(() => setCurrentIndex(i => i + 1))
  }

  const handleNavigateModule = (idx: number) => {
    if (sessionId) {
      transitionTo({ type: 'assessment', moduleIndex: idx, sessionId })
    }
  }

  if (step === 'LOADING') {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-white dark:bg-[#0d1117] text-slate-800 dark:text-[#c9d1d9] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-[#58a6ff]" />
        <span className="text-sm font-medium text-slate-500 dark:text-[#8b949e]">Connecting to Developer Incident Workstation...</span>
      </div>
    )
  }

  if (step === 'BRIEFING') {
    return (
      <InitialSayStep
        scenario={scenario}
        moduleIndex={moduleIndex}
        activeModules={activeModules}
        onNavigateModule={handleNavigateModule}
        onSubmit={handleInitialSaySubmit}
      />
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#0d1117]">
      <ContextSimulationWorkspace
        sessionId={sessionId}
        scenario={scenario}
        moduleIndex={moduleIndex}
        currentIndex={currentIndex}
        totalQuestions={assignedSimQuestions.length}
        onBackToBriefing={() => setStep('BRIEFING')}
        onNavigateModule={handleNavigateModule}
        onAdvanceNext={() => handleNext(() => setCurrentIndex(i => i + 1))}
        onSubmitSimulation={handleSimulationSubmit}
      />
    </div>
  )
}
