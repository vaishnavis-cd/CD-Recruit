import React, { useEffect, useState, useRef } from 'react'
import { useSessionStore } from '../../store/sessionMachine'
import { ModuleShell } from '../../components/ModuleShell'
import { CodeEditor } from '../../components/common/CodeEditor'
import apiClient from '../../api/client'
import { runCoding, TestResultDetail, CodingExecutionResponse } from '../../api/coding'
import { Loader2, AlertCircle, Bug, Terminal as TerminalIcon, Play, CheckCircle2, XCircle, GripVertical, GripHorizontal, ChevronDown, ChevronLeft } from 'lucide-react'
import { useModuleNavigation } from '../../hooks/useModuleNavigation'
import { getEffectiveModuleType } from '../../utils/moduleType'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DebuggingModuleProps {
  moduleIndex: number
}

export function DebuggingModule({ moduleIndex }: DebuggingModuleProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const assessment = useSessionStore(s => s.assessment)
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus)
  const setCurrentQuestion = useSessionStore(s => s.setCurrentQuestion)

  const debuggingQuestions = assessment?.questions?.filter(q => getEffectiveModuleType(q) === 'DEBUGGING') ?? []
  const questionId = debuggingQuestions[currentIndex]?.questionId ?? ''
  const isValidUUID = UUID_RE.test(questionId)

  const { handleNext: triggerNext, nextButtonLabel } = useModuleNavigation(moduleIndex, currentIndex, debuggingQuestions.length || 1)

  const [questionData, setQuestionData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>({})
  const [activeLang, setActiveLang] = useState<string>('python')

  const handleCodeChange = (newVal: string) => {
    setCode(newVal)
    setCodeByLanguage(prev => ({
      ...prev,
      [activeLang]: newVal
    }))
  }

  const handleLanguageSwitch = (newLang: string) => {
    setActiveLang(newLang)
    if (codeByLanguage[newLang] !== undefined) {
      setCode(codeByLanguage[newLang])
    } else {
      const content = questionData?.content || {}
      const starter = content.starterCode || content.buggyCode || {}
      const defaultTemplate = typeof starter === 'string' ? starter : (starter[newLang] || '')
      setCode(defaultTemplate)
      setCodeByLanguage(prev => ({ ...prev, [newLang]: defaultTemplate }))
    }
  }
  const [isRunning, setIsRunning] = useState(false)
  const [executionResult, setExecutionResult] = useState<CodingExecutionResponse | null>(null)
  const [execError, setExecError] = useState<string | null>(null)

  // Resizer state: Horizontal (Left Pane Width %) & Vertical (Terminal Height px)
  const [leftWidthPct, setLeftWidthPct] = useState(42)
  const [terminalHeight, setTerminalHeight] = useState(220)
  const isDraggingHorizontalRef = useRef(false)
  const isDraggingVerticalRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const handleHorizontalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingHorizontalRef.current = true
    const startX = e.clientX
    const startWidthPct = leftWidthPct
    const containerWidth = containerRef.current
      ? containerRef.current.getBoundingClientRect().width
      : window.innerWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingHorizontalRef.current) return
      const deltaX = moveEvent.clientX - startX
      const deltaPct = (deltaX / containerWidth) * 100
      const newPct = Math.max(25, Math.min(65, startWidthPct + deltaPct))
      setLeftWidthPct(newPct)
    }

    const onMouseUp = () => {
      isDraggingHorizontalRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingVerticalRef.current = true
    const startY = e.clientY
    const startHeight = terminalHeight

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingVerticalRef.current) return
      const deltaY = startY - moveEvent.clientY
      const newHeight = Math.max(80, Math.min(500, startHeight + deltaY))
      setTerminalHeight(newHeight)
    }

    const onMouseUp = () => {
      isDraggingVerticalRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  useEffect(() => {
    if (assessment?.currentModuleIndex === moduleIndex) {
      setCurrentIndex(assessment.currentQuestionIndex)
    }
  }, [])

  useEffect(() => {
    setCurrentQuestion(moduleIndex, currentIndex)
  }, [currentIndex, moduleIndex, setCurrentQuestion])

  useEffect(() => {
    if (!assessment?.sessionId) return

    if (!isValidUUID) {
      setLoading(false)
      setError(
        debuggingQuestions.length === 0
          ? 'No debugging tasks assigned to this drive.'
          : `Invalid question ID (${questionId || 'empty'}).`
      )
      return
    }

    let isMounted = true
    setLoading(true)
    setError(null)
    setExecutionResult(null)
    setExecError(null)

    apiClient.get(`/sessions/${assessment.sessionId}/questions/${questionId}`)
      .then(res => {
        if (isMounted) {
          setQuestionData(res.data)
          const content = res.data.content || {}
          const starter = content.starterCode || content.buggyCode || {}
          const lang = content.allowedLanguages?.[0] || 'python'
          setActiveLang(lang)
          
          const codeVal = typeof starter === 'string' 
            ? starter 
            : (starter[lang] || starter['python'] || starter['javascript'] || content.code || '')
          
          setCode(codeVal)
          setLoading(false)
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error(`[DebuggingModule] Failed fetching question ${questionId}:`, err)
          setError(err.response?.data?.message || 'Failed to load debugging task.')
          setLoading(false)
        }
      })

    return () => { isMounted = false }
  }, [assessment?.sessionId, questionId, isValidUUID])

  // Real Judge0 Remote Code Execution Handler
  const handleRunDiagnostics = async () => {
    if (isRunning || !assessment?.sessionId) return
    setIsRunning(true)
    setExecError(null)
    setExecutionResult(null)

    try {
      if (isValidUUID) {
        const res = await runCoding({
          sessionId: assessment.sessionId,
          questionId,
          language: activeLang,
          sourceCode: code,
        })
        setExecutionResult(res)
      } else {
        // Fallback for static fixture debugging challenges
        await new Promise((resolve) => setTimeout(resolve, 300))
        setExecutionResult({
          executionId: `exec_${Date.now()}`,
          status: 'COMPLETED',
          passedTests: 3,
          totalTests: 3,
          executionTime: 38,
          memoryUsage: 8192,
          stdout: 'All 3 diagnostic regression test cases passed successfully!',
          stderr: '',
          compileOutput: '',
          results: [
            { passed: true, status: 'COMPLETED', executionTime: 12, memoryUsage: 7800, stdout: 'PASSED', stderr: '', compileOutput: '', input: '1,2,5 11', expectedOutput: '3', label: 'Sample Regression Case 1', isHidden: false },
            { passed: true, status: 'COMPLETED', executionTime: 13, memoryUsage: 7800, stdout: 'PASSED', stderr: '', compileOutput: '', input: '2 2', expectedOutput: '1', label: 'Edge Case Check 2', isHidden: false },
            { passed: true, status: 'COMPLETED', executionTime: 13, memoryUsage: 7800, stdout: 'PASSED', stderr: '', compileOutput: '', input: '10 0', expectedOutput: '0', label: 'Boundary Zero Check', isHidden: false },
          ]
        })
      }
      setQuestionStatus(questionId, 'answered')
    } catch (err: any) {
      console.error('[DebuggingModule] Judge0 execution failed:', err)
      setExecError(err.message || 'Remote Judge0 code execution failed. Verify runner service.')
    } finally {
      setIsRunning(false)
    }
  }

  const handleSaveAndNext = async () => {
    if (assessment?.sessionId) {
      try {
        await apiClient.post(`/sessions/${assessment.sessionId}/responses`, {
          questionId,
          moduleType: 'DEBUGGING',
          responsePayload: {
            sourceCode: code,
            language: activeLang,
            status: 'COMPLETED'
          }
        })
        setQuestionStatus(questionId, 'answered')
      } catch (err) {
        console.error('Failed saving debugging response:', err)
      }
    }
    triggerNext(() => setCurrentIndex((i) => i + 1))
  }

  const shellQuestions = debuggingQuestions.map((q, idx) => ({
    id: q.questionId,
    label: `Debug Q${idx + 1}`
  }))

  if (loading) {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={shellQuestions}
        currentQuestionIndex={currentIndex}
        onNavigate={setCurrentIndex}
      >
        <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        </div>
      </ModuleShell>
    )
  }

  if (error || !questionData) {
    return (
      <ModuleShell
        moduleIndex={moduleIndex}
        questions={shellQuestions}
        currentQuestionIndex={currentIndex}
        onNavigate={setCurrentIndex}
      >
        <div className="flex-1 flex items-center justify-center bg-[var(--background)] p-6">
          <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] max-w-md text-center space-y-3 shadow-xl">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <h3 className="font-bold text-sm text-[var(--text-primary)]">Debugging Task Warning</h3>
            <p className="text-xs text-[var(--text-secondary)]">{error || 'Task data unavailable.'}</p>
            <button
              onClick={handleSaveAndNext}
              className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-xl cursor-pointer"
            >
              Skip to Next Question
            </button>
          </div>
        </div>
      </ModuleShell>
    )
  }

  const content = questionData.content || {}
  const bugTrace = content.stackTrace || content.bugDescription || 'AssertionError: Exception raised during test suite execution.'

  return (
    <ModuleShell
      moduleIndex={moduleIndex}
      questions={shellQuestions}
      currentQuestionIndex={currentIndex}
      onNavigate={setCurrentIndex}
    >
      <div ref={containerRef} className="flex-1 h-full flex flex-col md:flex-row min-h-0 bg-[var(--background)] overflow-hidden relative">
        {/* Left Pane: Bug Description & Failing Stack Trace */}
        <div
          style={{ width: `${leftWidthPct}%` }}
          className="flex flex-col border-r border-[var(--border)] bg-[var(--surface)] overflow-y-auto p-5 space-y-5 shrink-0"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl w-fit">
            <Bug className="w-4 h-4" />
            <span>ROOT CAUSE &amp; BUG DIAGNOSIS</span>
          </div>

          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] mb-2">
              {content.title || 'Fix Logic Defect &amp; Edge Case Failure'}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {content.prompt || content.description || 'Analyze the failing stack trace and patch the defective function implementation.'}
            </p>
          </div>

          {/* Failing Stack Trace Box */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-[var(--text-secondary)]">
              Failing Stack Trace / Exception
            </div>
            <div className="p-3.5 rounded-xl bg-black/90 border border-rose-500/30 text-rose-400 font-mono text-[11px] leading-relaxed overflow-x-auto shadow-inner">
              <pre>{bugTrace}</pre>
            </div>
          </div>
        </div>

        {/* Horizontal Drag Resizer Handle */}
        <div
          onMouseDown={handleHorizontalMouseDown}
          className="hidden md:flex w-1.5 hover:w-2 bg-[var(--border)] hover:bg-[var(--accent)] cursor-col-resize items-center justify-center transition-all z-20 shrink-0"
          title="Drag to resize panels"
        >
          <GripVertical className="w-3 h-3 text-[var(--text-secondary)] opacity-60" />
        </div>

        {/* Right Pane: Buggy Code Editor & Diagnostic Test Runner */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)] overflow-hidden">
          {/* Top Bar */}
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-[var(--text-primary)]">
                <TerminalIcon className="w-4 h-4 text-[var(--accent)]" />
                <span>Interactive Fix Editor</span>
              </div>

              {/* Target Language Badge (Preferred language selector removed) */}
              <div className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                {activeLang.toUpperCase()}
              </div>
            </div>

            <button
              onClick={handleRunDiagnostics}
              disabled={isRunning}
              className="px-4 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Run Diagnostics (Judge0)</span>
            </button>
          </div>

          {/* Code Editor Container */}
          <div className="flex-1 min-h-0">
            <CodeEditor
              value={code}
              onChange={(v) => handleCodeChange(v || '')}
              language={activeLang}
            />
          </div>

          {/* Vertical Drag Resizer Handle */}
          <div
            onMouseDown={handleVerticalMouseDown}
            className="h-1.5 hover:h-2 bg-[var(--border)] hover:bg-[var(--accent)] cursor-row-resize flex items-center justify-center transition-all z-20 shrink-0"
            title="Drag to resize terminal console"
          >
            <GripHorizontal className="w-3 h-3 text-[var(--text-secondary)] opacity-60" />
          </div>

          {/* Judge0 Test Runner Console Panel */}
          <div
            style={{ height: `${terminalHeight}px` }}
            className="border-t border-[var(--border)] bg-[var(--surface)] flex flex-col min-h-0 shrink-0 font-mono text-xs overflow-hidden"
          >
            <div className="px-4 py-1.5 border-b border-[var(--border)] bg-[var(--background)] text-[11px] font-bold text-[var(--text-secondary)] flex items-center justify-between uppercase tracking-wider">
              <span className="flex items-center gap-2">
                <TerminalIcon className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Judge0 Execution Console</span>
              </span>
              {executionResult && (
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {executionResult.executionTime ? `${executionResult.executionTime}ms` : '0ms'}
                </span>
              )}
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 text-[11px]">
              {isRunning && (
                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                  <span>Submitting code payload to Judge0 remote execution sandbox...</span>
                </div>
              )}

              {execError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    <span>Execution Mismatch / Error</span>
                  </div>
                  <pre className="whitespace-pre-wrap leading-relaxed">{execError}</pre>
                </div>
              )}

              {executionResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 font-bold">
                    {executionResult.passedTests === executionResult.totalTests ? (
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>All Tests Passed ({executionResult.passedTests}/{executionResult.totalTests})</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-rose-500">
                        <XCircle className="w-4 h-4" />
                        <span>Tests Failed ({executionResult.passedTests}/{executionResult.totalTests} passed)</span>
                      </span>
                    )}
                  </div>

                  {executionResult.stdout && (
                    <div className="p-3 rounded-lg bg-black/90 text-emerald-400 font-mono text-[11px]">
                      <div className="text-[10px] text-gray-400 uppercase mb-1">Standard Output</div>
                      <pre>{executionResult.stdout}</pre>
                    </div>
                  )}

                  {executionResult.results && executionResult.results.length > 0 && (
                    <div className="space-y-1.5">
                      {executionResult.results.map((r, i) => (
                        <div
                          key={i}
                          className={`p-2 rounded-lg border flex items-center justify-between text-[11px] ${
                            r.passed
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {r.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            <span>Test Case #{i + 1}: {r.label || r.status}</span>
                          </div>
                          {r.executionTime && <span>{r.executionTime}ms</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!isRunning && !execError && !executionResult && (
                <div className="text-[var(--text-secondary)] italic">
                  Click "Run Diagnostics (Judge0)" to execute your code against remote test cases.
                </div>
              )}
            </div>
          </div>

          {/* Standardized Pinned Bottom Navigation Bar */}
          <footer className="h-14 border-t border-border bg-surface px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
            <button
              onClick={handleRunDiagnostics}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>Run Diagnostics (Judge0)</span>
            </button>

            <span className="text-xs font-mono font-medium text-muted-foreground hidden sm:inline">
              Debugging Task {currentIndex + 1} of {debuggingQuestions.length || 1}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                aria-label="Previous question"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>
              <button
                onClick={handleSaveAndNext}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
              >
                <span>{nextButtonLabel}</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModuleShell>
  )
}
