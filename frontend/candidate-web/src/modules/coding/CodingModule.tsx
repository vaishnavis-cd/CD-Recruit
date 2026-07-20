import React, { useEffect, useState, useRef } from 'react'
import Editor from '@monaco-editor/react'
import type * as MonacoType from 'monaco-editor'
import { CODING_QUESTIONS } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { useTheme } from '../../theme/ThemeProvider'
import { cdRecruitLightTheme, cdRecruitDarkTheme } from '../../theme/monacoTheme'
import { services } from '../../services'
import type { ExecutionResult } from '../../services/execution/port'

interface CodingModuleProps {
  moduleIndex: number
}

type RunState = 'idle' | 'running' | 'done' | 'infra-error'

export function CodingModule({ moduleIndex }: CodingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setResponse = useSessionStore(s => s.setResponse)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)
  const { theme } = useTheme()

  const questions = CODING_QUESTIONS
  const question = questions[currentIndex]

  const [code, setCode] = useState(question?.starterCode ?? '')
  const [runState, setRunState] = useState<RunState>('idle')
  const [runResult, setRunResult] = useState<ExecutionResult | null>(null)
  const [lastMode, setLastMode] = useState<'run' | 'submit' | null>(null)
  const [infraError, setInfraError] = useState<string | null>(null)
  const retryCount = useRef(0)

  // Restore saved code
  useEffect(() => {
    const saved = assessment?.responses[question?.id]
    setCode(typeof saved === 'string' ? saved : question?.starterCode ?? '')
    setRunResult(null)
    setRunState('idle')
    setInfraError(null)
    retryCount.current = 0
  }, [currentIndex])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex])

  function handleCodeChange(value: string | undefined) {
    const val = value ?? ''
    setCode(val)
    setResponse(question.id, val)
  }

  async function handleExecute(mode: 'run' | 'submit') {
    setRunState('running')
    setInfraError(null)
    setLastMode(mode)
    try {
      const result = await services.execution.runTests(code, question.id, mode)
      setRunResult(result)
      setRunState('done')
      retryCount.current = 0
    } catch (err: any) {
      if (err?.type === 'infra-failure') {
        // Visually distinct from "your code failed" per spec
        setRunState('infra-error')
        setInfraError(err.message)
      } else {
        setRunState('infra-error')
        setInfraError('Something went wrong on our end — not a code error. Try again.')
      }
    }
  }

  async function handleRetry() {
    if (retryCount.current >= 3) return
    retryCount.current++
    if (lastMode) await handleExecute(lastMode)
  }

  function handleEditorMount(_editor: MonacoType.editor.IStandaloneCodeEditor, monaco: typeof MonacoType) {
    monaco.editor.defineTheme('cd-recruit-light', cdRecruitLightTheme)
    monaco.editor.defineTheme('cd-recruit-dark', cdRecruitDarkTheme)
    monaco.editor.setTheme(theme === 'dark' ? 'cd-recruit-dark' : 'cd-recruit-light')
  }

  const paletteItems = questions.map((q, i) => ({ id: q.id, label: q.title }))

  if (!question) return null

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={paletteItems}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div className="flex flex-col h-full">
        {/* Problem statement */}
        <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
              Problem {currentIndex + 1} of {questions.length}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono">
              {question.language}
            </span>
          </div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">{question.title}</h2>
          <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-[inherit]">
            {question.description}
          </div>

          {/* Visible test cases */}
          <div className="mt-4">
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wide">
              Example test cases (visible)
            </div>
            <div className="space-y-2">
              {question.visibleTestCases.map((tc, i) => (
                <div key={i} className="text-xs font-mono bg-[var(--bg)] rounded p-2.5 border border-[var(--border)]">
                  <span className="text-[var(--text-secondary)] font-sans text-xs mr-2">{tc.label}:</span>
                  <span className="text-[var(--text-primary)]">Input: {tc.input}</span>
                  <span className="text-[var(--text-secondary)] mx-2">→</span>
                  <span className="text-[var(--success)]">Expected: {tc.expectedOutput}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-2 italic">
              Note: Submit also runs hidden test cases. Hidden-case results are not shown.
            </p>
          </div>
        </div>

        {/* Code editor */}
        <div className="flex-1 min-h-0" style={{ minHeight: '250px' }}>
          <Editor
            height="100%"
            language={question.language}
            value={code}
            onChange={handleCodeChange}
            onMount={handleEditorMount}
            theme={theme === 'dark' ? 'cd-recruit-dark' : 'cd-recruit-light'}
            options={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              tabSize: 4,
              insertSpaces: true,
              padding: { top: 16, bottom: 16 },
              renderLineHighlight: 'line',
            }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]">
          <button
            onClick={() => handleExecute('run')}
            disabled={runState === 'running'}
            aria-label="Run code against visible test cases only"
            className="px-4 py-2 rounded text-sm font-medium border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {runState === 'running' && lastMode === 'run' ? 'Running…' : 'Run'}
          </button>
          <button
            onClick={() => handleExecute('submit')}
            disabled={runState === 'running'}
            aria-label="Submit code — runs visible and hidden test cases"
            className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          >
            {runState === 'running' && lastMode === 'submit' ? 'Submitting…' : 'Submit'}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 border border-[var(--border)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            ← Prev
          </button>
          <button
            onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
            disabled={currentIndex === questions.length - 1}
            className="px-3 py-1.5 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          >
            Next →
          </button>
        </div>

        {/* Execution results */}
        {(runState === 'done' || runState === 'infra-error') && (
          <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 max-h-56 overflow-auto">
            {runState === 'infra-error' ? (
              // Visually distinct from "code failed" — amber not red per spec
              <div role="alert" className="rounded-lg border border-[var(--warning)] bg-amber-50 dark:bg-amber-900/20 p-3">
                <div className="flex items-start gap-2">
                  <span className="text-[var(--warning)] text-lg" aria-hidden>⚠</span>
                  <div>
                    <div className="text-sm font-medium text-[var(--warning)]">
                      Something went wrong on our end — not a code error
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">{infraError}</div>
                    <button
                      onClick={handleRetry}
                      disabled={retryCount.current >= 3}
                      className="mt-2 text-xs text-[var(--accent)] underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded disabled:opacity-40"
                    >
                      {retryCount.current >= 3 ? 'Max retries reached' : 'Retry'}
                    </button>
                  </div>
                </div>
              </div>
            ) : runResult ? (
              <div>
                {runResult.compilationError && (
                  <div role="alert" className="text-sm font-mono text-[var(--critical)] mb-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-[var(--critical)]">
                    {runResult.compilationError}
                  </div>
                )}
                <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                  Visible test results
                </div>
                <div className="space-y-1.5">
                  {runResult.visibleResults.map((tc, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs p-2 rounded ${
                        tc.passed
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      }`}
                    >
                      <span aria-hidden>{tc.passed ? '✓' : '✗'}</span>
                      <span className={tc.passed ? 'text-[var(--success)]' : 'text-[var(--critical)]'}>
                        {tc.label}
                      </span>
                      {!tc.passed && (
                        <span className="text-[var(--text-secondary)] font-mono ml-2">
                          Got: {tc.actualOutput}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {runResult.mode === 'submit' && (
                  <p className="text-xs text-[var(--text-secondary)] mt-2 italic">
                    Hidden test case results are not shown — your submission has been recorded.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </ModuleShell>
  )
}
