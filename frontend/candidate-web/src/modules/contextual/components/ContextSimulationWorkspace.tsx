import React, { useState, useEffect, useRef } from 'react'
import { InFictionInbox } from '@/components/InFictionInbox'
import apiClient from '@/api/client'
import { useSessionStore } from '../../../store/sessionMachine'
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
  Folder,
  File,
  GitBranch,
  Search,
  MessageSquare,
  FileDiff,
  Layers,
  Sparkles,
  User,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
} from 'lucide-react'
import { CodeEditor } from '../../../components/common/CodeEditor'
import { IncidentResolutionModal, ResolutionData } from './IncidentResolutionModal'
import { IncidentDebriefView } from './IncidentDebriefView'
import { HotfixSignoffPanel } from './HotfixSignoffPanel'

interface ContextSimulationWorkspaceProps {
  sessionId: string
  scenario: {
    id: string
    title: string
    description: string
    starterCode: Record<string, string>
    testCases: Array<{ input: string; expectedOutput: string; isHidden?: boolean; label?: string }>
    readonlyFiles?: Record<string, string>
    checklist?: Array<{ id: string; label: string; detail: string; actionTab: string; channelTab?: string; selectedFile?: string }>
    slackMessages?: Array<{ sender: string; body: string }>
    jiraTicket?: {
      ticketId: string
      title: string
      priority: string
      status: string
      reporter: string
      assignee: string
      labels: string[]
      description: string
    }
    prComments?: Array<{
      sender: string
      role: string
      comment: string
      timeOffsetMinutes: number
      replies?: Array<{ sender: string; role: string; comment: string; timeOffsetMinutes: number }>
    }>
    defaultFile?: string
    terminalInfo?: {
      repository: string
      branch: string
      initialLogs: string[]
    }
    managerEmail?: {
      fromName: string
      fromRole: string
      fromEmail: string
      subject: string
      body: string
    }
  }
  onSubmitSimulation: () => void
}

const DEFAULT_READONLY_REPO_FILES: Record<string, string> = {
  'login/auth.py': `# auth.py - Core Authentication Handler\n\nfrom login_validation import validate_username\n\ndef authenticate_user(username: str, password_hash: str) -> dict:\n    if not validate_username(username):\n        raise ValueError("Invalid username format")\n    # Proceed with password verification against PostgreSQL database...\n    return {"status": "authenticated", "user": username}\n`,
  'login/middleware.py': `# middleware.py - Request Sanitation Middleware\n\nclass AuthenticationMiddleware:\n    def process_request(self, req):\n        # Pass username to validation service without modifying raw headers\n        pass\n`,
  'tests/test_validation.py': `# test_validation.py - QA Unit & Regression Test Suite\n\nimport pytest\nfrom login_validation import validate_username\n\ndef test_valid_username():\n    assert validate_username("valid_user") == True\n\ndef test_leading_space():\n    # QA REGRESSION BUG: Should reject leading spaces!\n    assert validate_username(" user_123") == False\n\ndef test_trailing_space():\n    # QA REGRESSION BUG: Should reject trailing spaces!\n    assert validate_username("user_123 ") == False\n`,
  'config/settings.yaml': `# settings.yaml\nenvironment: staging\nservice_name: login-service\nversion: 2.4.1\nauth_timeout_seconds: 300\n`,
  'utils/string_helpers.py': `# string_helpers.py\n\ndef is_alphanumeric_or_underscore(s: str) -> bool:\n    return all(c.isalnum() or c == '_' for c in s)\n`,
}

type TabType = 'workspace' | 'channels' | 'signoff' | 'debrief'

export function ContextSimulationWorkspace({
  sessionId,
  scenario,
  onSubmitSimulation,
}: ContextSimulationWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabType>('channels')
  const [activeWorkspaceSubTab, setActiveWorkspaceSubTab] = useState<'editor' | 'diff' | 'pr_discussion'>('editor')
  const [activeChannelTab, setActiveChannelTab] = useState<'slack' | 'jira' | 'pr' | 'email'>('slack')

  const readonlyFiles = scenario.readonlyFiles || DEFAULT_READONLY_REPO_FILES;
  const defaultFile = scenario.defaultFile || 'login/login_validation.py';

  // Selected file in repo tree & sidebar toggle
  const [selectedFile, setSelectedFile] = useState<string>(defaultFile)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // Language & Code State
  const [language, setLanguage] = useState<'python' | 'javascript'>('python')
  const [code, setCode] = useState(() => {
    return (scenario as any).code || scenario.starterCode?.python || scenario.starterCode?.javascript || ''
  })
  const initialStarterCode = useRef(code)

  useEffect(() => {
    if ((scenario as any).code) {
      setCode((scenario as any).code)
    } else if (scenario.starterCode?.python) {
      setCode(scenario.starterCode.python)
    }
  }, [scenario])

  // Resolution Modal, Submitting & Debrief State
  const [showResolutionModal, setShowResolutionModal] = useState(false)
  const [resolutionData, setResolutionData] = useState<ResolutionData | null>(null)
  const [isDebriefCompleted, setIsDebriefCompleted] = useState(false)
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false)

  // Quick Switcher Modal (Ctrl+P)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  const [quickSearchQuery, setQuickSearchQuery] = useState('')

  // Animated Diagnostics State
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [diagnosticProgressStep, setDiagnosticProgressStep] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Array<{ label: string; passed: boolean; actual: string; expected: string }> | null>(null)

  // Real-time Telemetry Action Stream from Backend Session
  const [actionHistory, setActionHistory] = useState<Array<{ timestamp: string; label: string; type: string }>>([])

  // Top Bar Countdown Timer & Rotating Watermark
  const [countdown, setCountdown] = useState(6120)
  const [watermarkIndex, setWatermarkIndex] = useState(0)
  const watermarks = ['INTERNAL', 'CONFIDENTIAL', 'ENGINEERING SANDBOX', 'CANDIDATE BUILD', 'CLOUDESTINATIONS']

  // Terminal Logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>(() => {
    if (scenario.terminalInfo?.initialLogs) {
      return scenario.terminalInfo.initialLogs;
    }
    return [
      '=========================================================================',
      ' 🚀 INCIDENT WAR ROOM DIAGNOSTIC TERMINAL READY',
      ' Target Repository: cdrecruit/login-service | Branch: feature/login-validation',
      ' Environment: Staging Candidate Sandbox | Pytest 7.4.0',
      '=========================================================================',
      'pytest',
      'collected 5 items',
      'tests/test_validation.py::test_valid_user PASSED',
      'tests/test_validation.py::test_leading_space_bug FAILED',
      'tests/test_validation.py::test_trailing_space_bug FAILED',
      'Coverage 96%',
      'System ready. Modify code and click Run Diagnostics to verify fix.',
    ];
  })

  // Hover Code Intelligence Tooltip State
  const [hoverSymbol, setHoverSymbol] = useState<{ symbol: string; refs: string[] } | null>(null)

  const editTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live Timer & Watermark Rotator
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    const wmTimer = setInterval(() => {
      setWatermarkIndex((prev) => (prev + 1) % watermarks.length)
    }, 8000)
    return () => {
      clearInterval(timer)
      clearInterval(wmTimer)
    }
  }, [])

  // Ctrl+P Keyboard Shortcut Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setShowQuickSwitcher((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const formatTimer = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Fetch action history stream from backend
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

  // Unread manager email state & toast banner
  const [hasUnreadManagerEmail, setHasUnreadManagerEmail] = useState(false)
  const [showEmailToast, setShowEmailToast] = useState(false)

  // Initial SAY plan reference banner state
  const [initialSayPlan, setInitialSayPlan] = useState<string>('')
  const [isPlanExpanded, setIsPlanExpanded] = useState(false)

  useEffect(() => {
    const storeResp = (useSessionStore.getState().assessment?.responses[scenario.id] as any)?.initialSayText
    if (storeResp) {
      setInitialSayPlan(storeResp)
    }
    if (sessionId) {
      apiClient
        .get(`/sessions/${sessionId}/simulation/scenario`)
        .then((res) => {
          if (res.data?.initialSayText) {
            setInitialSayPlan(res.data.initialSayText)
          }
        })
        .catch(() => {})
    }
  }, [sessionId, scenario.id])

  useEffect(() => {
    if (sessionId) {
      apiClient.get(`/sessions/${sessionId}/simulation/inbox`).then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          const hasUnread = res.data.some((m: any) => !m.read && !m.replyText)
          if (hasUnread) {
            setHasUnreadManagerEmail(true)
            setShowEmailToast(true)
          }
        }
      }).catch(() => {})
    }
  }, [sessionId])

  const emitTelemetry = async (type: 'FILE_OPEN' | 'FILE_EDIT' | 'TEST_EXECUTE', filepath?: string, metadata?: Record<string, any>) => {
    try {
      const res = await apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
        type,
        filepath: filepath || selectedFile,
        metadata: { timestamp: new Date().toISOString(), ...metadata },
      })
      if (res.data?.emailTriggered || (res.data as any)?.emailTriggered === true) {
        setHasUnreadManagerEmail(true)
        setShowEmailToast(true)
        setTimeout(() => setShowEmailToast(false), 12000)
      }
      fetchActionHistory()
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
      emitTelemetry('FILE_EDIT', selectedFile || `login_validation.${language === 'python' ? 'py' : 'js'}`)
    }, 1000)
  }

  // Animated Multi-Stage Diagnostics Run
  const handleRunDiagnostics = async () => {
    setIsRunningTests(true)

    const steps = [
      'Collecting logs & environment variables...',
      'Running unit test runner (pytest)...',
      'Executing regression test suite against reproduction cases...',
      'Checking authentication flow & space validation...',
      'Generating diagnostic report...',
    ]

    for (const stepMsg of steps) {
      setDiagnosticProgressStep(stepMsg)
      await new Promise((r) => setTimeout(r, 400))
    }

    try {
      const res = await apiClient.post(`/sessions/${sessionId}/simulation/run-code`, {
        code,
        language,
        testCases: scenario.testCases,
      })

      const results: Array<{ label: string; passed: boolean; actual: string; expected: string }> = res.data || []
      setTestResults(results)
      setIsRunningTests(false)
      setDiagnosticProgressStep(null)

      const passedCount = results.filter((r) => r.passed).length
      const total = results.length

      emitTelemetry('TEST_EXECUTE', selectedFile, { passCount: passedCount, totalCount: total })

      const newLogs = [
        `=========================================================================`,
        ` 🚀 INCIDENT DIAGNOSTIC RUN — ${new Date().toLocaleTimeString()} UTC`,
        `=========================================================================`,
        `pytest 5 tests collected`,
        ...results.map(
          (r) =>
            ` ${r.passed ? '✅ PASSED' : '❌ FAILED'} — ${r.label}: Expected ${r.expected}, Got ${r.actual}`
        ),
        `Coverage 96%`,
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
      setDiagnosticProgressStep(null)
    }
  }

  // Handle Resolution Submission from Stage 4 Modal
  const handleResolutionSubmit = async (data: ResolutionData) => {
    setIsSubmittingResolution(true)
    setResolutionData(data)
    setShowResolutionModal(false)
    const passedCount = testResults ? testResults.filter((r) => r.passed).length : 5
    const totalCount = testResults ? testResults.length : 5

    try {
      await apiClient.post(`/sessions/${sessionId}/simulation/submit`, {
        completed: true,
        code,
        testResults: {
          passedTests: passedCount,
          totalTests: totalCount,
          isCorrect: passedCount === totalCount,
        },
        resolutionData: data,
      })
      setIsDebriefCompleted(true)
      setActiveTab('debrief')
    } catch (err) {
      console.error('Submission failed:', err)
      setIsSubmittingResolution(false)
    }
  }

  // Calculate Git Diff lines
  const generateGitDiff = () => {
    const origLines = initialStarterCode.current.split('\n')
    const newLines = code.split('\n')
    const diff: Array<{ type: 'added' | 'removed' | 'same'; text: string }> = []

    let i = 0, j = 0
    while (i < origLines.length || j < newLines.length) {
      if (origLines[i] === newLines[j]) {
        if (origLines[i] !== undefined) diff.push({ type: 'same', text: origLines[i] })
        i++
        j++
      } else {
        if (origLines[i] !== undefined) {
          diff.push({ type: 'removed', text: origLines[i] })
          i++
        }
        if (newLines[j] !== undefined) {
          diff.push({ type: 'added', text: newLines[j] })
          j++
        }
      }
    }
    return diff
  }

  if (isSubmittingResolution) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[var(--background)] text-[var(--text-primary)] space-y-4 font-sans">
        <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin" />
        <p className="text-sm font-semibold tracking-tight">Authorizing Hotfix &amp; Generating Incident Debrief...</p>
      </div>
    )
  }

  if (activeTab === 'debrief' || isDebriefCompleted) {
    return <IncidentDebriefView resolutionData={resolutionData} actionHistory={actionHistory} />
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--background)] text-[var(--text-primary)] font-sans relative select-none">
      {/* Top Persistent Header */}
      <div className="px-6 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between z-10 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold font-mono">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>P1 INCIDENT</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-[var(--text-secondary)] bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
            <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{formatTimer(countdown)}</span>
          </div>

          <h1 className="text-xs font-bold tracking-wide text-[var(--text-primary)] truncate max-w-xs">
            {scenario.title}
          </h1>
        </div>

        {/* Center Tabs: War Room Navigation */}
        <div className="flex items-center bg-[var(--background)] p-1 rounded-xl border border-[var(--border)]">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Engineering Workspace</span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer relative ${
              activeTab === 'channels'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Communication Center</span>
            {hasUnreadManagerEmail && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse absolute -top-0.5 -right-0.5" />
            )}
          </button>
          {isDebriefCompleted && (
            <button
              onClick={() => setActiveTab('debrief')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${
                (activeTab as string) === 'debrief'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-500 hover:text-emerald-400 bg-emerald-500/10'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Debrief &amp; Review</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuickSwitcher(true)}
            className="px-2.5 py-1 rounded-lg bg-[var(--background)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Ctrl+P</span>
          </button>

          <button
            onClick={() => setActiveTab(isDebriefCompleted ? 'debrief' : 'signoff')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 ${
              isDebriefCompleted
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-[var(--accent)] hover:opacity-90 text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isDebriefCompleted ? '✓ Hotfix Submitted' : 'Resolve Incident'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Candidate Initial Plan Reference Banner */}
      {initialSayPlan && (
        <div className="px-6 py-2 bg-[var(--surface)] border-b border-[var(--border)] text-xs z-10 shrink-0 shadow-xs">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsPlanExpanded(!isPlanExpanded)}
              className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)] inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FileText className="w-4 h-4 text-[var(--accent)]" />
              <span>Your Submitted Debugging Plan</span>
              <span className="text-[10px] text-[var(--text-secondary)] font-mono font-normal">
                ({isPlanExpanded ? 'Click to collapse' : 'Click to expand & review'})
              </span>
              {isPlanExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {isPlanExpanded && (
            <div className="mt-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed shadow-inner">
              {initialSayPlan}
            </div>
          )}
        </div>
      )}

      {/* Main Content Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {(activeTab as string) === 'debrief' && (
          <div className="flex-1 overflow-y-auto bg-[var(--background)]">
            <IncidentDebriefView
              resolutionData={resolutionData}
              actionHistory={actionHistory}
              onCompleteModule={onSubmitSimulation}
            />
          </div>
        )}

        {activeTab === 'signoff' && (
          <HotfixSignoffPanel
            onSubmit={handleResolutionSubmit}
            onCancel={() => setActiveTab('workspace')}
          />
        )}

        {activeTab === 'workspace' && (
          <div className="flex-1 flex min-h-0">
            {/* Left Column: Guided Incident To-Do Checklist Sidebar */}
            {isSidebarOpen && (
              <div className="w-64 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shrink-0 font-sans">
                <div className="px-3 py-2.5 border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-wider font-mono text-[var(--text-primary)] flex items-center justify-between bg-[var(--background)]">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Incident Checklist</span>
                  </span>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-3 space-y-3 overflow-y-auto flex-1 text-xs">
                  <div className="p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] space-y-1">
                    <div className="font-bold text-[11px] text-[var(--accent)] font-mono uppercase">Incident Guide</div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      Follow the guided workflow steps below to investigate, communicate, patch, and deploy the P1 hotfix.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {(scenario.checklist || []).map((item) => {
                      let IconComponent = CheckCircle2;
                      let iconColor = 'text-blue-500';
                      if (item.actionTab === 'channels') {
                        if (item.channelTab === 'slack') {
                          IconComponent = MessageSquare;
                          iconColor = 'text-amber-500';
                        } else if (item.channelTab === 'jira') {
                          IconComponent = Bug;
                          iconColor = 'text-rose-500';
                        } else if (item.channelTab === 'email') {
                          IconComponent = Mail;
                          iconColor = 'text-purple-500';
                        }
                      } else if (item.actionTab === 'workspace') {
                        IconComponent = FileCode;
                        iconColor = 'text-emerald-500';
                      } else if (item.actionTab === 'signoff') {
                        IconComponent = CheckCircle2;
                        iconColor = 'text-blue-500';
                      }

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (item.actionTab) setActiveTab(item.actionTab as any);
                            if (item.channelTab) setActiveChannelTab(item.channelTab as any);
                            if (item.selectedFile) {
                              setSelectedFile(item.selectedFile);
                              emitTelemetry('FILE_OPEN', item.selectedFile);
                            }
                          }}
                          className="w-full text-left p-2.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] bg-[var(--background)] transition-all flex items-start gap-2 cursor-pointer group"
                        >
                          <IconComponent className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
                          <div>
                            <div className="font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] text-[11px]">{item.label}</div>
                            <div className="text-[10px] text-[var(--text-secondary)]">{item.detail}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          {/* Center Column: War Room Editor / Diff / PR Discussion */}
            <div className="flex-1 h-full flex flex-col bg-[var(--background)] min-w-0 border-r border-[var(--border)]">
              {/* Sub-Tab Bar: Editor, Diff, PR Discussion */}
              <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {!isSidebarOpen && (
                    <button
                      onClick={() => setIsSidebarOpen(true)}
                      className="p-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer mr-1"
                      title="Open Explorer Sidebar"
                    >
                      <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                    </button>
                  )}
                  <span className="text-xs font-bold text-[var(--text-primary)] font-mono flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-[#2F5CFF]" />
                    <span>{selectedFile}</span>
                  </span>
                  {selectedFile !== defaultFile && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      READ-ONLY
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-[var(--background)] p-0.5 rounded-lg border border-[var(--border)]">
                    <button
                      onClick={() => setActiveWorkspaceSubTab('editor')}
                      className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                        activeWorkspaceSubTab === 'editor' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      Code Editor
                    </button>
                    <button
                      onClick={() => setActiveWorkspaceSubTab('diff')}
                      className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                        activeWorkspaceSubTab === 'diff' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      Git Diff
                    </button>
                    <button
                      onClick={() => setActiveWorkspaceSubTab('pr_discussion')}
                      className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                        activeWorkspaceSubTab === 'pr_discussion' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      PR Context
                    </button>
                  </div>

                  <button
                    onClick={handleRunDiagnostics}
                    disabled={isRunningTests}
                    className="px-3.5 py-1 rounded-lg bg-[#2F5CFF] hover:bg-[#0037FF] text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>{isRunningTests ? 'Running Diagnostics...' : 'Run Diagnostics'}</span>
                  </button>
                </div>
              </div>

              {/* Sub-Tab Content */}
              <div className="flex-1 min-h-0 relative">
                {activeWorkspaceSubTab === 'editor' && (
                  <div className="w-full h-full">
                    {selectedFile === defaultFile ? (
                      <CodeEditor
                        height="100%"
                        language={language}
                        theme="dark"
                        value={code}
                        onChange={handleCodeChange}
                      />
                    ) : (
                      <CodeEditor
                        height="100%"
                        language={language}
                        theme="dark"
                        value={readonlyFiles[selectedFile] || '# Read-only file content'}
                        readOnly={true}
                      />
                    )}
                  </div>
                )}

                {activeWorkspaceSubTab === 'diff' && (
                  <div className="w-full h-full p-4 overflow-y-auto font-mono text-xs bg-[#0D1117] text-white space-y-0.5 leading-relaxed">
                    <div className="text-[var(--text-secondary)] pb-2 mb-2 border-b border-gray-800">
                      diff --git a/{defaultFile} b/{defaultFile}
                    </div>
                    {generateGitDiff().map((d, idx) => (
                       <div
                         key={idx}
                         className={
                           d.type === 'added'
                             ? 'bg-emerald-500/20 text-emerald-400 font-bold px-2 rounded-xs'
                             : d.type === 'removed'
                             ? 'bg-rose-500/20 text-rose-400 font-bold px-2 rounded-xs'
                             : 'text-gray-400 px-2'
                         }
                       >
                         <span className="inline-block w-4 text-gray-600">{d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '}</span>
                         <span>{d.text}</span>
                       </div>
                    ))}
                  </div>
                )}

                {activeWorkspaceSubTab === 'pr_discussion' && (
                  <div className="w-full h-full p-6 overflow-y-auto space-y-4 text-xs font-sans">
                    {(scenario.prComments || []).map((comment, idx) => (
                      <div key={idx} className="space-y-3">
                        <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-500 border border-purple-500/30 flex items-center justify-center font-mono font-bold">
                              {comment.sender.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <span className="font-bold text-[var(--text-primary)] block">{comment.sender} ({comment.role})</span>
                              <span className="text-[10px] text-[var(--text-secondary)]">Pull Request Comment • {comment.timeOffsetMinutes}m ago</span>
                            </div>
                          </div>
                          <p className="text-[var(--text-primary)] bg-[var(--background)] p-3 rounded-lg border border-[var(--border)] leading-relaxed">
                            "{comment.comment}"
                          </p>
                        </div>

                        {(comment.replies || []).map((reply, ridx) => (
                          <div key={ridx} className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3 pl-8 border-l-2 border-l-[var(--accent)]">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30 flex items-center justify-center font-mono font-bold">
                                {reply.sender.split(' ').map(n => n[0]).join('')}
                              </div>
                              <div>
                                <span className="font-bold text-[var(--text-primary)] block">{reply.sender} ({reply.role})</span>
                                <span className="text-[10px] text-[var(--text-secondary)]">Pull Request Author Reply • {reply.timeOffsetMinutes}m ago</span>
                              </div>
                            </div>
                            <p className="text-[var(--text-primary)] bg-[var(--background)] p-3 rounded-lg border border-[var(--border)] leading-relaxed">
                              "{reply.comment}"
                            </p>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Diagnostic Terminal & Reproduction Cases */}
            <div className="w-96 h-full flex flex-col bg-[var(--background)] shrink-0">
              {/* Test Cases Panel */}
              <div className="p-4 bg-[var(--surface)] border-b border-[var(--border)] space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span>Reproduction Test Suite</span>
                  </span>
                  {testResults && (
                    <span className="text-xs font-mono font-bold text-emerald-500">
                      {testResults.filter((r) => r.passed).length}/{testResults.length} Passed
                    </span>
                  )}
                </div>

                {diagnosticProgressStep && (
                  <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-500 font-mono text-[11px] flex items-center gap-2 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{diagnosticProgressStep}</span>
                  </div>
                )}

                <div className="space-y-2">
                  {scenario.testCases
                    .filter((tc) => !tc.isHidden)
                    .map((tc, idx) => {
                      const res = testResults ? testResults[idx] : null
                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border font-mono text-xs space-y-1 ${
                            res
                              ? res.passed
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                              : 'bg-[var(--background)] border-[var(--border)] text-[var(--text-primary)]'
                          }`}
                        >
                          <div className="flex justify-between items-center text-[11px] font-bold">
                            <span>{tc.label || `Case ${idx + 1}`}</span>
                            {res && <span>{res.passed ? '✓ PASSED' : '✕ FAILED'}</span>}
                          </div>
                          <div className="text-[10px] text-[var(--text-secondary)] truncate">Input: {tc.input}</div>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Console Logs Terminal */}
              <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)]">
                <div className="px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
                  <span className="flex items-center gap-2">
                    <TerminalIcon className="w-3.5 h-3.5 text-emerald-500" />
                    <span>War Room Console Log</span>
                  </span>
                </div>

                <div className="flex-1 p-3.5 font-mono text-[11px] text-[var(--text-primary)] overflow-y-auto space-y-1 leading-relaxed selection:bg-[#2F5CFF] selection:text-white">
                  {terminalLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.includes('PASSED') || log.includes('VERIFIED')
                          ? 'text-emerald-500 font-bold'
                          : log.includes('FAILED') || log.includes('REGRESSION')
                          ? 'text-rose-500 font-bold'
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

        {activeTab === 'channels' && (
          <div className="flex-1 flex flex-col bg-[var(--background)] overflow-hidden">
            {/* Multi-Channel Sub Nav */}
            <div className="px-6 py-2.5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center gap-4">
              <span className="text-xs font-bold font-mono text-[var(--text-secondary)] uppercase">Channels:</span>
              <div className="flex gap-2">
                {[
                  { id: 'slack', label: 'Slack (#incident-war-room)' },
                  { id: 'jira', label: `Jira (${scenario.jiraTicket?.ticketId || 'BUG-3124'})` },
                  { id: 'pr', label: 'PR Comments' },
                  { id: 'email', label: 'Email Threads' },
                ].map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setActiveChannelTab(ch.id as any)
                      if (ch.id === 'email') {
                        setHasUnreadManagerEmail(false)
                        setShowEmailToast(false)
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all relative ${
                      activeChannelTab === ch.id
                        ? 'bg-[var(--accent)] text-white shadow-xs'
                        : 'bg-[var(--background)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {ch.label}
                    {ch.id === 'email' && hasUnreadManagerEmail && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold animate-pulse">NEW</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {activeChannelTab === 'slack' && (
                <div className="max-w-3xl mx-auto space-y-4 font-sans text-xs">
                  <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                    <div className="flex items-center gap-2 font-bold text-amber-500 font-mono">
                      <span>#incident-war-room</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">• {scenario.slackMessages?.length || 0} members online</span>
                    </div>

                    <div className="space-y-3 pt-2">
                      {(scenario.slackMessages || []).map((msg, idx) => {
                        const colors = ['text-amber-500', 'text-purple-500', 'text-emerald-500', 'text-blue-500'];
                        const color = colors[idx % colors.length];
                        return (
                          <div key={idx} className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] space-y-1">
                            <span className={`font-bold ${color}`}>{msg.sender}:</span>
                            <p className="text-[var(--text-primary)]">"{msg.body}"</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeChannelTab === 'jira' && scenario.jiraTicket && (
                <div className="max-w-3xl mx-auto space-y-4 font-sans text-xs">
                  <div className="p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
                          {scenario.jiraTicket.ticketId}
                        </span>
                        <h2 className="text-base font-bold text-[var(--text-primary)] mt-1">{scenario.jiraTicket.title}</h2>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-500">{scenario.jiraTicket.priority}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--background)] font-mono text-[11px]">
                      <div><strong>Reporter:</strong> {scenario.jiraTicket.reporter}</div>
                      <div><strong>Assignee:</strong> {scenario.jiraTicket.assignee}</div>
                      <div><strong>Labels:</strong> {scenario.jiraTicket.labels.join(', ')}</div>
                      <div><strong>Status:</strong> {scenario.jiraTicket.status}</div>
                    </div>

                    <p className="text-[var(--text-primary)] bg-[var(--background)] p-4 rounded-lg border border-[var(--border)] leading-relaxed whitespace-pre-wrap">
                      {scenario.jiraTicket.description}
                    </p>
                  </div>
                </div>
              )}

              {activeChannelTab === 'email' && (
                <div className="h-full">
                  <InFictionInbox sessionId={sessionId} scenarioId={scenario.id} />
                </div>
              )}

              {activeChannelTab === 'pr' && (
                <div className="max-w-3xl mx-auto p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3 font-sans text-xs">
                  <h3 className="font-bold text-[var(--text-primary)]">Pull Request Code Review context</h3>
                  {(scenario.prComments || []).slice(0, 2).map((comment, idx) => (
                    <p key={idx} className="text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 mb-2">
                      <strong>{comment.sender} ({comment.role}) commented:</strong> "{comment.comment}"
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Switcher (Ctrl+P) Modal */}
      {showQuickSwitcher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl p-4 space-y-3 font-sans animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
              <Search className="w-4 h-4 text-[var(--accent)]" />
              <input
                type="text"
                autoFocus
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                placeholder="Type file name to open..."
                className="w-full bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono"
              />
              <button onClick={() => setShowQuickSwitcher(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
              {Array.from(new Set([defaultFile, ...Object.keys(readonlyFiles)]))
                .filter((f) => f.toLowerCase().includes(quickSearchQuery.toLowerCase()))
                .map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setSelectedFile(f)
                      setShowQuickSwitcher(false)
                      emitTelemetry('FILE_OPEN', f)
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-[var(--background)] text-[var(--text-primary)] flex items-center justify-between cursor-pointer"
                  >
                    <span>{f}</span>
                    {f === defaultFile && <span className="text-[10px] text-emerald-500 font-bold">EDITABLE</span>}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Manager Email Toast Notification Popup — Arise from Bottom Center */}
      {showEmailToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99999] p-5 bg-[#0F172A] border-2 border-rose-500 rounded-2xl shadow-[0_10px_40px_rgba(225,29,72,0.45)] flex items-start gap-4 max-w-lg w-[92vw] sm:w-[480px] font-sans animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 border border-rose-500/40 animate-pulse">
            <Mail className="w-6 h-6" />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <div className="text-sm font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2 text-rose-400 font-mono text-[12px] uppercase tracking-wide">
                <ShieldAlert className="w-4 h-4" /> URGENT MANAGER ESCALATION
              </span>
              <button
                onClick={() => setShowEmailToast(false)}
                className="text-slate-400 hover:text-white cursor-pointer p-1 rounded-md hover:bg-slate-800 transition-colors"
                title="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">
              <strong>{scenario.managerEmail?.fromName || 'Rahul Sharma'} ({scenario.managerEmail?.fromRole || 'Engineering Manager'})</strong> sent a high-priority email inquiry regarding status updates and incident mitigation.
            </p>
            <div className="pt-1 flex items-center justify-end">
              <button
                onClick={() => {
                  setActiveTab('channels')
                  setActiveChannelTab('email')
                  setHasUnreadManagerEmail(false)
                  setShowEmailToast(false)
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-md transition-all hover:scale-[1.02]"
              >
                <span>Read &amp; Reply to Manager Email</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
