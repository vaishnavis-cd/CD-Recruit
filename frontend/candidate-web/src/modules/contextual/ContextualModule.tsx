import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { InitialSayStep } from './components/InitialSayStep'
import { ContextSimulationWorkspace } from './components/ContextSimulationWorkspace'
import apiClient from '../../api/client'
import { Loader2, CheckCircle } from 'lucide-react'

interface ContextualModuleProps {
  moduleIndex: number
}

const DEFAULT_QA_BUG_SCENARIO = {
  id: 'qa-bug-login-validation',
  title: 'QA Bug Report: Login Validation Error',
  description:
    'During regression testing, QA discovered that login validation incorrectly accepts usernames with leading or trailing spaces. The issue has been reproduced consistently and marked as High Priority. Investigate the issue, implement a fix and verify that existing functionality is not affected.',
  starterCode: {
    python: `# login_validation.py\n\ndef validate_username(username: str) -> bool:\n    """\n    Validates a username for login.\n    Requirements:\n    - Must be between 3 and 20 characters long.\n    - Must NOT contain leading or trailing spaces.\n    - Must only contain alphanumeric characters or underscores.\n    """\n    if not username:\n        return False\n    \n    # QA BUG: Missing leading/trailing space validation!\n    if len(username) < 3 or len(username) > 20:\n        return False\n        \n    return all(c.isalnum() or c == '_' or c == ' ' for c in username)\n`,
    javascript: `// login_validation.js\n\nfunction validateUsername(username) {\n  if (!username || typeof username !== 'string') {\n    return false;\n  }\n\n  // QA BUG: Missing leading/trailing space check!\n  if (username.length < 3 || username.length > 20) {\n    return false;\n  }\n\n  return /^[a-zA-Z0-9_ ]+$/.test(username);\n}\n\nmodule.exports = { validateUsername };\n`,
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
  const assessment = useSessionStore(s => s.assessment)
  const sessionId = assessment?.sessionId || ''

  const [step, setStep] = useState<'LOADING' | 'INITIAL_SAY' | 'WORKSPACE' | 'COMPLETED'>('LOADING')
  const [scenario, setScenario] = useState(DEFAULT_QA_BUG_SCENARIO)

  // Fetch Scenario Config & restore step state from session store / backend DB
  useEffect(() => {
    const savedResponse = assessment?.responses[scenario.id] as { initialSayText?: string; completed?: boolean } | undefined

    if (savedResponse?.completed) {
      setStep('COMPLETED')
    } else if (savedResponse?.initialSayText) {
      setStep('WORKSPACE')
    }

    if (!sessionId) {
      if (!savedResponse?.initialSayText && !savedResponse?.completed) {
        setStep('INITIAL_SAY')
      }
      return
    }

    apiClient.get(`/sessions/${sessionId}/simulation/scenario`)
      .then(res => {
        if (res.data) {
          setScenario({
            ...DEFAULT_QA_BUG_SCENARIO,
            ...res.data,
          })
          const isCompleted = res.data.completed || savedResponse?.completed
          const hasSay = res.data.hasInitialSay || !!res.data.initialSayText || !!savedResponse?.initialSayText
          if (isCompleted) {
            setStep('COMPLETED')
          } else if (hasSay) {
            setStep('WORKSPACE')
          } else if (!savedResponse?.completed && !savedResponse?.initialSayText) {
            setStep('INITIAL_SAY')
          }
        }
      })
      .catch(err => {
        console.warn('[ContextualModule] Could not fetch remote scenario config, using default QA Bug scenario:', err)
        if (!savedResponse?.initialSayText && !savedResponse?.completed) {
          setStep('INITIAL_SAY')
        }
      })
  }, [sessionId, scenario.id])

  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const setResponse = useSessionStore(s => s.setResponse)

  // Handle Initial SAY submission
  const handleInitialSaySubmit = async (initialSayText: string) => {
    if (sessionId) {
      await apiClient.post(`/sessions/${sessionId}/simulation/initial-say`, {
        text: initialSayText,
      })
    }
    const currentResp = (assessment?.responses[scenario.id] as any) || {}
    setQuestionStatus(scenario.id, 'answered')
    setResponse(scenario.id, { ...currentResp, initialSayText, completed: false })
    setStep('WORKSPACE')
  }

  // Handle final simulation submit
  const handleSimulationSubmit = async () => {
    if (sessionId) {
      await apiClient.post(`/sessions/${sessionId}/simulation/submit`, {
        completed: true,
      }).catch(() => {})
    }
    const currentResp = (assessment?.responses[scenario.id] as any) || {}
    setQuestionStatus(scenario.id, 'answered')
    setResponse(scenario.id, { ...currentResp, completed: true })
    setStep('COMPLETED')
  }

  const paletteItems = [{ id: scenario.id, label: 'QA Bug Scenario' }]

  if (step === 'LOADING') {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={paletteItems}
        currentQuestionIndex={0}
        onNavigate={() => {}}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          <span className="text-sm font-medium text-[var(--text-secondary)]">Loading Context Simulation scenario...</span>
        </div>
      </ModuleShell>
    )
  }

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={0}
      onNavigate={() => {}}
    >
      <div className="h-full w-full overflow-y-auto bg-[var(--background)]">
        {step === 'INITIAL_SAY' && (
          <InitialSayStep
            scenarioTitle={scenario.title}
            scenarioDescription={scenario.description}
            prompt="What would you do to solve this issue?"
            onSubmit={handleInitialSaySubmit}
          />
        )}

        {step === 'WORKSPACE' && (
          <ContextSimulationWorkspace
            sessionId={sessionId}
            scenario={scenario}
            onSubmitSimulation={handleSimulationSubmit}
          />
        )}

        {step === 'COMPLETED' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Context Simulation Complete</h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-md">
              Your Initial SAY plan, DO workspace telemetry, manager email reply, and technical fix have been successfully evaluated.
            </p>
          </div>
        )}
      </div>
    </ModuleShell>
  )
}
