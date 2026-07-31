import React, { useState, useEffect, useRef } from 'react'
import { InFictionInbox } from '@/components/InFictionInbox'
import apiClient from '@/api/client'
import {
  Mail,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Terminal as TerminalIcon,
  FileCode,
  Activity,
  Play,
  Send,
  Check,
  ShieldAlert,
  Clock,
  Code2,
  Bug,
  RefreshCw,
} from 'lucide-react'
import { CodeEditor } from '../../../components/common/CodeEditor'

interface ContextSimulationWorkspaceProps {
  sessionId: string
  scenario: {
    id: string
    title: string
    description: string
    starterCode: Record<string, string>
    testCases: Array<{ input: string; expectedOutput: string; isHidden?: boolean; label?: string }>
  }
  onSubmitSimulation: () => void
}

export function ContextSimulationWorkspace({
  sessionId,
  scenario,
  onSubmitSimulation,
}: ContextSimulationWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'brief' | 'workspace' | 'inbox'>('workspace')
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasNewEmailPulse, setHasNewEmailPulse] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Language & Code State
  const [language, setLanguage] = useState<'python' | 'javascript'>('python')
  const [code, setCode] = useState(() => {
    return scenario.starterCode?.python || scenario.starterCode?.javascript || ''
  })

  // Diagnostic Terminal & Test Execution State
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '=========================================================================',
    ' 🚀 INCIDENT WAR ROOM DIAGNOSTIC TERMINAL READY',
    ' Target Repository: cdrecruit/login-service',
    ' Environment: Staging Candidate Sandbox',
    '=========================================================================',
    'System ready. Modify code and run diagnostics to verify incident fix.',
  ])
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [testResults, setTestResults] = useState<Array<{ label: string; passed: boolean; actual: string; expected: string }> | null>(null)

  // Real-time Telemetry Action Stream from Backend Session
  const [actionHistory, setActionHistory] = useState<Array<{ timestamp: string; label: string; type: string }>>([])

  const editTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch real action history stream from backend DB
  const fetchActionHistory = async () => {
    try {
      const res = await apiClient.get(`/sessions/${sessionId}/simulation/actions`)
      if (Array.isArray(res.data)) {
        setActionHistory(res.data)
      }
    } catch (err) {
      console.warn('[Telemetry] Error fetching action history:', err)
    }
  }

  // Ingest raw telemetry event to backend
  const emitTelemetry = async (type: 'FILE_OPEN' | 'FILE_EDIT' | 'TEST_EXECUTE', filepath?: string) => {
    try {
      const res = await apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
        type,
        filepath: filepath || `login_validation.${language === 'python' ? 'py' : 'js'}`,
        metadata: { timestamp: new Date().toISOString() },
      })

      fetchActionHistory()

      // Check if backend email was triggered
      if (res.data?.emailTriggered) {
        fetchInbox()
      }
    } catch (err) {
      console.warn('[Telemetry] Error posting event:', err)
    }
  }

  const handleCodeChange = (val: string | undefined) => {
    const newCode = val || ''
    setCode(newCode)

    if (editTimeoutRef.current) {
      clearTimeout(editTimeoutRef.current)
    }
    editTimeoutRef.current = setTimeout(() => {
      emitTelemetry('FILE_EDIT', `login_validation.${language === 'python' ? 'py' : 'js'}`)
    }, 1000)
  }

  // Fetch inbox messages from backend
  const fetchInbox = async () => {
    try {
      const res = await apiClient.get(`/sessions/${sessionId}/simulation/inbox`)
      const messages = res.data || []
      const unread = messages.filter((m: any) => !m.read && !m.replyText).length

      if (activeTab === 'inbox') {
        setUnreadCount(0)
        setHasNewEmailPulse(false)
      } else {
        if (unread > unreadCount) {
          setHasNewEmailPulse(true)
        }
        setUnreadCount(unread)
      }
    } catch (err) {
      console.warn('[Inbox] Error fetching inbox:', err)
    }
  }

  const handleOpenInboxTab = async () => {
    setActiveTab('inbox')
    setUnreadCount(0)
    setHasNewEmailPulse(false)
    try {
      await apiClient.post(`/sessions/${sessionId}/simulation/inbox/read`)
    } catch (err) {
      console.warn('[Inbox] Error marking inbox read:', err)
    }
  }

  // Poll inbox and backend actions stream
  useEffect(() => {
    fetchInbox()
    fetchActionHistory()
    const interval = setInterval(() => {
      fetchInbox()
      fetchActionHistory()
    }, 3000)
    return () => clearInterval(interval)
  }, [sessionId, unreadCount])

  // Emit FILE_OPEN on workspace mount
  useEffect(() => {
    emitTelemetry('FILE_OPEN', `login_validation.${language === 'python' ? 'py' : 'js'}`)
  }, [sessionId])

  // Native Sandbox Code Execution Logic via Backend Run-Code API
  const handleRunDiagnostics = async () => {
    setIsRunningTests(true)
    emitTelemetry('TEST_EXECUTE')

    try {
      const res = await apiClient.post(`/sessions/${sessionId}/simulation/run-code`, {
        code,
        language,
        testCases: scenario.testCases,
      })

      const results: Array<{ label: string; passed: boolean; actual: string; expected: string }> = res.data || []
      setTestResults(results)
      setIsRunningTests(false)

      const passedCount = results.filter((r) => r.passed).length
      const total = results.length

      const newLogs = [
        `=========================================================================`,
        ` 🚀 INCIDENT WAR ROOM DIAGNOSTIC RUN - ${new Date().toLocaleTimeString()}`,
        `=========================================================================`,
        ...results.map(
          (r) =>
            ` ${r.passed ? '✅ PASS' : '❌ FAIL'} - ${r.label}: Expected ${r.expected}, Got ${r.actual}`
        ),
        `-------------------------------------------------------------------------`,
        passedCount === total
          ? `🎉 INCIDENT FIX VERIFIED: All ${passedCount}/${total} test cases passed successfully!`
          : `⚠️ REGRESSION DETECTED: ${total - passedCount} test cases failing. Fix username space validation.`,
        `=========================================================================`,
      ]
      setTerminalLogs(newLogs)
    } catch (err: any) {
      console.warn('[Diagnostics] Sandbox execution error:', err)
      setIsRunningTests(false)
    }
  }

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    const passedCount = testResults ? testResults.filter((r) => r.passed).length : 5
    const totalCount = testResults ? testResults.length : 5
    try {
      await apiClient.post(`/sessions/${sessionId}/simulation/submit`, {
        testResults: {
          passedTests: passedCount,
          totalTests: totalCount,
          isCorrect: passedCount === totalCount,
        },
      })
      onSubmitSimulation()
    } catch (err) {
      console.error('Submission failed:', err)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--background)] text-[var(--text-primary)] font-sans">
      {/* Top Incident War Room Header */}
      <div className="px-6 py-3 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold font-mono">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>ACTIVE INCIDENT WAR ROOM</span>
          </div>

          <h1 className="text-sm font-bold tracking-wide text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>{scenario.title}</span>
          </h1>
        </div>

        {/* Center Tabs: War Room Navigation */}
        <div className="flex items-center bg-[var(--background)] p-1 rounded-xl border border-[var(--border)]">
          <button
            onClick={() => setActiveTab('brief')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'brief'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Incident Brief & Real Log</span>
          </button>

          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>War Room Editor & Diagnostics</span>
          </button>

          <button
            onClick={handleOpenInboxTab}
            className={`relative px-4 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'inbox'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            } ${hasNewEmailPulse ? 'ring-2 ring-[#2F5CFF] animate-pulse' : ''}`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500 text-white font-mono">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={handleFinalSubmit}
          disabled={submitting}
          className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm hover:shadow-emerald-600/20 active:scale-95"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{submitting ? 'Evaluating Solution...' : 'Resolve Incident & Submit'}</span>
        </button>
      </div>

      {/* Main War Room Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeTab === 'brief' && (
          <div className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="px-2.5 py-1 rounded border border-rose-500/30 bg-rose-500/10 text-rose-500 text-[10px] font-bold uppercase font-mono">
                    High Priority Ticket #QA-2026
                  </span>
                  <h2 className="text-xl font-bold text-[var(--text-primary)] mt-2">{scenario.title}</h2>
                </div>
                <span className="text-xs text-[var(--text-secondary)] font-mono">Session ID: {sessionId.slice(0, 18)}...</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-sans whitespace-pre-wrap">
                {scenario.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider font-mono">
                  Reproduction & Validation Constraints
                </h3>
                <ul className="list-disc pl-4 text-xs text-[var(--text-secondary)] space-y-2 font-mono">
                  <li>Username must be 3–20 characters long</li>
                  <li>Must NOT accept leading or trailing spaces (e.g. " user ")</li>
                  <li>Only alphanumeric characters & underscores allowed</li>
                </ul>
              </div>

              {/* Real Backend Session Telemetry Log Feed */}
              <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#2F5CFF] uppercase tracking-wider font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#2F5CFF]" />
                    <span>Real Candidate Session Action Log</span>
                  </h3>
                  <button
                    onClick={fetchActionHistory}
                    className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    title="Refresh action log from database"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-[11px] pr-1">
                  {actionHistory.length > 0 ? (
                    actionHistory.map((act, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--text-primary)]">
                        <span className="truncate pr-2">{act.label}</span>
                        <span className="text-[10px] text-[var(--text-secondary)] shrink-0">{act.timestamp}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[var(--text-secondary)] py-4 text-center italic">
                      No session telemetry events logged yet. Actions in War Room Editor will appear here in real time.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'workspace' && (
          <div className="flex-1 flex min-h-0">
            {/* Left: Code Editor */}
            <div className="w-1/2 h-full border-r border-[var(--border)] flex flex-col bg-[var(--background)]">
              <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <FileCode className="w-4 h-4 text-[#2F5CFF]" />
                  <span className="text-xs font-bold text-[var(--text-primary)] font-mono">
                    login_validation.{language === 'python' ? 'py' : 'js'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={language}
                    onChange={(e) => {
                      const l = e.target.value as 'python' | 'javascript'
                      setLanguage(l)
                      setCode(scenario.starterCode?.[l] || '')
                    }}
                    className="bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-primary)] rounded-lg px-2.5 py-1 font-mono focus:outline-none"
                  >
                    <option value="python">Python 3</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                  </select>

                  <button
                    onClick={handleRunDiagnostics}
                    disabled={isRunningTests}
                    className="px-3 py-1 rounded-lg bg-[#2F5CFF] hover:bg-[#0037FF] text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{isRunningTests ? 'Running...' : 'Run Diagnostics'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <CodeEditor
                  height="100%"
                  language={language}
                  theme="dark"
                  value={code}
                  onChange={handleCodeChange}
                />
              </div>
            </div>

            {/* Right: Diagnostic Terminal & Test Suite */}
            <div className="w-1/2 h-full flex flex-col bg-[var(--background)]">
              {/* Test Cases Panel */}
              <div className="p-4 bg-[var(--surface)] border-b border-[var(--border)] space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span>Incident Reproduction Test Cases</span>
                  </span>
                  {testResults && (
                    <span className="text-xs font-mono font-bold text-emerald-500">
                      {testResults.filter((r) => r.passed).length}/{testResults.length} Passed
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {scenario.testCases
                    .filter((tc) => !tc.isHidden)
                    .map((tc, idx) => {
                      const res = testResults ? testResults[idx] : null
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border font-mono text-xs space-y-1 ${
                            res
                              ? res.passed
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                              : 'bg-[var(--background)] border-[var(--border)] text-[var(--text-primary)]'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[11px] font-bold">
                            <span>{tc.label || `Case ${idx + 1}`}</span>
                            {res && (
                              <span>{res.passed ? '✓ PASSED' : '✕ FAILED'}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--text-secondary)] truncate">Input: {tc.input}</div>
                          <div className="text-[10px] text-[var(--text-secondary)]">Expected: {tc.expectedOutput}</div>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Terminal Logs */}
              <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)]">
                <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
                  <span className="flex items-center gap-2">
                    <TerminalIcon className="w-3.5 h-3.5 text-emerald-500" />
                    <span>War Room Console Log</span>
                  </span>
                </div>

                <div className="flex-1 p-4 font-mono text-xs text-[var(--text-primary)] overflow-y-auto space-y-1.5 leading-relaxed selection:bg-[#2F5CFF] selection:text-white">
                  {terminalLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.includes('PASSED') || log.includes('VERIFIED')
                          ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                          : log.includes('FAILED') || log.includes('REGRESSION')
                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                          : log.includes('🚀') || log.includes('===')
                          ? 'text-[#2F5CFF] font-bold'
                          : 'text-[var(--text-primary)]'
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inbox' && (
          <div className="flex-1 p-6 bg-[var(--background)] overflow-hidden">
            <InFictionInbox sessionId={sessionId} scenarioId={scenario.id} />
          </div>
        )}
      </div>
    </div>
  )
}
