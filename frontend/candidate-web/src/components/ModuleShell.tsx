import React, { useEffect, useCallback } from 'react'
import { Timer, TimerWarningBanner } from './Timer'
import { QuestionPalette } from './QuestionPalette'
import { ProctoringIndicator } from './ProctoringIndicator'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { MODULES } from '../fixtures/questions'
import { useTheme } from '../theme/ThemeProvider'
import { ProctoringModule } from '../proctoring/proctoring.module'
import { Moon, Sun } from 'lucide-react'

interface ModuleShellProps {
  moduleIndex: number
  questions: Array<{ id: string; label: string }>
  currentQuestionIndex: number
  onNavigate: (index: number) => void
  children: React.ReactNode
}

// Two distinct named functions for silent vs visible integrity signaling (spec rule)
function reportSilentSignal(kind: 'tab-switch' | 'window-blur' | 'paste-anomaly') {
  services.sessionApi.reportIntegritySignal({
    kind,
    category: 'silent',
    timestamp: new Date(services.time.getServerNow()).toISOString(),
  }).catch(() => {}) // fire-and-forget, never show to candidate
}

// Moved to its own file to satisfy React Fast Refresh (no mixed hook+component exports)
function useFunctionalNudge() {
  const [fullscreenExited, setFullscreenExited] = React.useState(false)

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setFullscreenExited(true)
        services.sessionApi.reportIntegritySignal({
          kind: 'fullscreen-exit',
          category: 'functional',
          timestamp: new Date(services.time.getServerNow()).toISOString(),
        }).catch(() => {})
      } else {
        setFullscreenExited(false)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  return { fullscreenExited, setFullscreenExited }
}

export function ModuleShell({ moduleIndex, questions, currentQuestionIndex, onNavigate, children }: ModuleShellProps) {
  const cvMode = useSessionStore(s => s.cvMode)
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const assessment = useSessionStore(s => s.assessment)
  const transitionTo = useSessionStore(s => s.transitionTo)
  const { theme, toggle } = useTheme()
  const { fullscreenExited, setFullscreenExited } = useFunctionalNudge()
  const [networkDisconnected, setNetworkDisconnected] = React.useState(false)

  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return MODULES
    }
    const MODULE_NAME_MAP: Record<string, { id: string; name: string }> = {
      MCQ: { id: 'mcq', name: 'MCQ' },
      SQL: { id: 'sql', name: 'SQL' },
      CODING: { id: 'coding', name: 'Coding' },
      AI_PROMPTING: { id: 'prompting', name: 'AI Prompting' },
      SIMULATION: { id: 'simulation', name: 'Contextual Simulation' },
      CONTEXTUAL: { id: 'simulation', name: 'Contextual Simulation' },
    }
    const types: string[] = []
    for (const q of assessment.questions) {
      const type = q.moduleType as string
      if (type && !types.includes(type)) {
        types.push(type)
      }
    }
    if (types.length === 0) return MODULES
    return types.map((t) => MODULE_NAME_MAP[t] || { id: t.toLowerCase(), name: t })
  }, [assessment?.questions])

  const currentModule = activeModules[moduleIndex] || activeModules[0]
  const currentQuestion = questions[currentQuestionIndex]

  // STEP 1: Start ProctoringModule when assessment session is active
  useEffect(() => {
    const sessionId = assessment?.sessionId
    if (!sessionId) {
      console.warn('[ModuleShell] STEP 1: sessionId is undefined, skipping ProctoringModule.start()')
      return
    }

    console.log(`[ModuleShell] STEP 1: Active assessment session detected: ${sessionId}. Starting ProctoringModule...`)
    ProctoringModule.getInstance()
      .start(sessionId)
      .then((started) => {
        console.log(`[ModuleShell] STEP 1: ProctoringModule.start() returned: ${started}`)
      })
      .catch((err) => {
        console.error('[ModuleShell] STEP 1: Exception thrown in ProctoringModule.start():', err)
      })

    // ProctoringModule is a global singleton for the assessment session.
    // Switching question tabs within the same session must NOT tear down the camera/proctoring pipeline.
  }, [assessment?.sessionId])

  // Silent integrity signals — no UI reaction per spec
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) reportSilentSignal('tab-switch')
    }
    function onBlur() {
      reportSilentSignal('window-blur')
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Keyboard: F to flag/unflag
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') {
        if (!currentQuestion) return
        const activeEl = document.activeElement
        // Don't fire when typing in a textarea/input/monaco
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || (activeEl as HTMLElement).contentEditable === 'true')) return

        const current = assessment?.questionStatus[currentQuestion.id] ?? 'unvisited'
        setQuestionStatus(currentQuestion.id, current === 'flagged' ? 'answered' : 'flagged')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [currentQuestion, assessment, setQuestionStatus])

  const handleSubmitAssessment = useCallback(() => {
    if (!assessment) return
    transitionTo({ type: 'pre-submit-review', sessionId: assessment.sessionId })
  }, [assessment, transitionTo])

  return (
    <div className="flex flex-col h-screen bg-[var(--bg)] overflow-hidden">
      {/* Timer warning banners — amber, never red */}
      <TimerWarningBanner />

      {/* Network disconnect nudge — functional, allowed to be visible */}
      {networkDisconnected && (
        <div
          role="alert"
          className="w-full bg-amber-50 dark:bg-amber-900/30 border-b border-[var(--warning)] text-[var(--warning)] text-center text-sm font-medium py-2 px-4"
        >
          Reconnecting… Your timer is still running. Work is saved locally.
        </div>
      )}

      {/* Fullscreen exit nudge — functional, NOT an accusation */}
      {fullscreenExited && (
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-3"
        >
          <span>Please return to fullscreen to continue</span>
          <button
            onClick={() => {
              document.documentElement.requestFullscreen?.().then(() => setFullscreenExited(false)).catch(() => {})
            }}
            className="underline font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
          >
            Re-enter fullscreen
          </button>
        </div>
      )}

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-sm text-[var(--text-primary)]">
            {currentModule?.name ?? `Module ${moduleIndex + 1}`}
          </div>
          {currentModule && (
            <span className="text-xs text-[var(--text-secondary)] hidden sm:block">
              Q{currentQuestionIndex + 1} of {questions.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ProctoringIndicator cvMode={cvMode} />
          <Timer />

          {/* Module navigation tabs — only show active modules assigned to drive */}
          <nav aria-label="Module navigation" className="hidden md:flex items-center gap-1">
            {activeModules.map((mod, i) => (
              <button
                key={i}
                onClick={() => transitionTo({ type: 'assessment', moduleIndex: i, sessionId: assessment?.sessionId ?? '' })}
                aria-label={`Go to ${mod.name}`}
                aria-current={i === moduleIndex ? 'page' : undefined}
                className={`
                  px-2.5 py-1 rounded text-xs font-medium transition-colors
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1
                  ${i === moduleIndex
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg)]'
                  }
                `}
              >
                {mod.name}
              </button>
            ))}
          </nav>

          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          <button
            onClick={handleSubmitAssessment}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
            aria-label="Review and submit assessment"
          >
            Review &amp; Submit
          </button>
        </div>
      </header>

      {/* Main content + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Question palette */}
        <aside
          className="w-56 flex-shrink-0 border-r border-[var(--border)] bg-[var(--surface)] overflow-y-auto hidden lg:block"
          aria-label="Question navigation sidebar"
        >
          <QuestionPalette
            questions={questions}
            moduleIndex={moduleIndex}
            currentQuestionIndex={currentQuestionIndex}
            onNavigate={onNavigate}
          />
        </aside>

        {/* Question content */}
        <main className="flex-1 overflow-y-auto" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
