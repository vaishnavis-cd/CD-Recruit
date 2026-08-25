import React, { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import {
  FileCode,
  Terminal,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Mail,
  FileText,
  GitPullRequest,
  Check,
  Send,
  Loader2,
  Clock,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Eye,
  Edit3,
  Sparkles,
  GitBranch,
  Laptop,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Info,
  Sun,
  Moon,
  Layers,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Rocket,
  Users,
  HelpCircle,
  BookOpen
} from 'lucide-react'
import apiClient from '../../../api/client'
import { useTheme } from '../../../theme/ThemeProvider'
import { useSessionStore } from '../../../store/sessionMachine'
import { getEffectiveModuleType } from '../../../utils/moduleType'

interface ContextSimulationWorkspaceProps {
  sessionId: string
  scenario: any
  moduleIndex: number
  currentIndex: number
  totalQuestions: number
  onBackToBriefing?: () => void
  onNavigateModule?: (idx: number) => void
  onAdvanceNext?: () => void
  onSubmitSimulation: (signoffData?: any) => Promise<void> | void
}

export function ContextSimulationWorkspace({
  sessionId,
  scenario,
  moduleIndex,
  currentIndex,
  totalQuestions,
  onBackToBriefing,
  onNavigateModule,
  onAdvanceNext,
  onSubmitSimulation,
}: ContextSimulationWorkspaceProps) {
  const { theme, toggle: toggleTheme } = useTheme()
  const assessment = useSessionStore(s => s.assessment)
  const transitionTo = useSessionStore(s => s.transitionTo)

  // Derive active assessment module tabs
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

  // --- Languages & Target File Setup ---
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'javascript'>('python')
  const defaultFile = scenario.defaultFile || (selectedLanguage === 'python' ? 'src/auth/validation.py' : 'src/auth/validation.js')

  // Starter code per language
  const starterCode = scenario.starterCode?.[selectedLanguage] || scenario.starterCode?.python || ''

  // All files mapping (readonly files + candidate editable file)
  const readonlyFiles: Record<string, string> = scenario.readonlyFiles || {}

  // Active open tabs and selected file
  const [openTabs, setOpenTabs] = useState<string[]>([defaultFile])
  const [activeFile, setActiveFile] = useState<string>(defaultFile)

  // Candidate code buffer
  const [code, setCode] = useState<string>(starterCode)
  const [fileContents, setFileContents] = useState<Record<string, string>>({
    [defaultFile]: starterCode,
    ...readonlyFiles,
  })

  // Has code been modified by candidate
  const [isModified, setIsModified] = useState<boolean>(false)

  // Diagnostics & Terminal State
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false)
  const [testResults, setTestResults] = useState<any[] | null>(null)
  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    scenario.terminalInfo?.initialLogs || [
      `pytest tests/`,
      `Repository: ${scenario.terminalInfo?.repository || 'cdrecruit/service'} [${scenario.terminalInfo?.branch || 'main'}]`,
      `Diagnostics ready. Click 'Run Diagnostics' to test your code.`,
    ]
  )
  const [bottomTab, setBottomTab] = useState<'diagnostics' | 'terminal' | 'logs'>('diagnostics')

  // Right Incident Context Drawer State (Jira is default)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true)
  const [contextTab, setContextTab] = useState<'jira' | 'slack' | 'email'>('jira')

  // Manager Email & Communication
  const [inboxMessages, setInboxMessages] = useState<any[]>([])
  const [emailTriggered, setEmailTriggered] = useState<boolean>(false)
  const [showEmailToast, setShowEmailToast] = useState<boolean>(false)
  const [emailReplyText, setEmailReplyText] = useState<string>('')
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false)
  const [emailSentSuccess, setEmailSentSuccess] = useState<boolean>(false)

  // Incident Strategy & SAY Question Plan
  const [incidentSayText, setIncidentSayText] = useState<string>('')

  // Hotfix Signoff & Release Strategy Modal
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false)
  const [deploymentDecision, setDeploymentDecision] = useState<'PEER_REVIEW' | 'DIRECT_PROD'>('PEER_REVIEW')
  const [remediationSummary, setRemediationSummary] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Simulated Time Clock
  const [clockTime, setClockTime] = useState<string>('10:24 AM')

  // Telemetry Debounce Reference
  const telemetryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Initial Hydration from Session / Scenario ---
  useEffect(() => {
    if (scenario.starterCode?.[selectedLanguage]) {
      const newStarter = scenario.starterCode[selectedLanguage]
      setCode(newStarter)
      setFileContents(prev => ({
        ...prev,
        [defaultFile]: newStarter,
        ...readonlyFiles,
      }))
    }
  }, [selectedLanguage, scenario])

  // Sync clock time naturally
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setClockTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
    updateTime()
    const interval = setInterval(updateTime, 30000)
    return () => clearInterval(interval)
  }, [])

  // Check remote simulation snapshot on mount
  useEffect(() => {
    if (!sessionId) return

    apiClient.get(`/sessions/${sessionId}/simulation/summary`)
      .then(res => {
        if (res.data) {
          if (res.data.inbox && res.data.inbox.length > 0) {
            setInboxMessages(res.data.inbox)
            setEmailTriggered(true)
          }
          if (res.data.initialSayText) {
            setIncidentSayText(res.data.initialSayText)
          }
          if (res.data.emailReplyText) {
            setEmailReplyText(res.data.emailReplyText)
            setEmailSentSuccess(true)
          }
        }
      })
      .catch(() => {})
  }, [sessionId])

  // --- File Switcher & Tab Management ---
  const handleOpenFile = (filepath: string) => {
    if (!openTabs.includes(filepath)) {
      setOpenTabs([...openTabs, filepath])
    }
    setActiveFile(filepath)

    if (sessionId) {
      apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
        type: 'FILE_OPEN',
        filepath,
      }).catch(() => {})
    }
  }

  const handleCloseTab = (filepath: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newTabs = openTabs.filter(t => t !== filepath)
    if (newTabs.length === 0) {
      newTabs.push(defaultFile)
    }
    setOpenTabs(newTabs)
    if (activeFile === filepath) {
      setActiveFile(newTabs[newTabs.length - 1])
    }
  }

  // --- Code Change Handler & Auto-Telemetry ---
  const handleCodeChange = (newCode: string | undefined) => {
    const updated = newCode || ''
    setCode(updated)
    setIsModified(true)
    setFileContents(prev => ({
      ...prev,
      [activeFile]: updated,
    }))

    if (telemetryDebounceRef.current) {
      clearTimeout(telemetryDebounceRef.current)
    }

    telemetryDebounceRef.current = setTimeout(async () => {
      if (!sessionId) return
      try {
        const res = await apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
          type: 'FILE_EDIT',
          filepath: activeFile,
          metadata: { codeLength: updated.length },
        })

        if (res.data?.emailTriggered && !emailTriggered) {
          setEmailTriggered(true)
          setShowEmailToast(true)
          const managerMsg = {
            id: 101,
            from: scenario.managerEmail?.fromName || 'Rahul Sharma',
            role: scenario.managerEmail?.fromRole || 'Engineering Manager',
            subject: scenario.managerEmail?.subject || 'Status Inquiry',
            body: scenario.managerEmail?.body || 'Could you provide a deployment status update?',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: false,
          }
          setInboxMessages(prev => [managerMsg, ...prev])
        }
      } catch (err) {
        console.warn('Telemetry error:', err)
      }
    }, 1200)
  }

  // --- Diagnostics Test Runner ---
  const handleRunDiagnostics = async () => {
    setIsRunningTests(true)
    setBottomTab('diagnostics')

    const activeCode = fileContents[defaultFile] || code

    try {
      if (sessionId) {
        apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
          type: 'TEST_EXECUTE',
          filepath: defaultFile,
        }).catch(() => {})
      }

      const res = await apiClient.post(`/sessions/${sessionId}/simulation/run-code`, {
        code: activeCode,
        language: selectedLanguage,
        testCases: scenario.testCases,
      })

      const results = Array.isArray(res.data) ? res.data : []
      setTestResults(results)

      const passedCount = results.filter((r: any) => r.passed).length
      const totalCount = results.length

      setTerminalLogs(prev => [
        ...prev,
        `\n> pytest ${scenario.defaultFile || 'tests/'}`,
        `Running ${totalCount} diagnostic test cases against sandbox...`,
        ...results.map((r: any) => `  ${r.passed ? '✓ PASSED' : '✗ FAILED'}: ${r.label} (Expected: ${r.expected}, Got: ${r.actual})`),
        `==================== ${passedCount}/${totalCount} Passed ====================`,
      ])

      if (!emailTriggered) {
        setEmailTriggered(true)
        setShowEmailToast(true)
      }
    } catch (err: any) {
      setTestResults([
        {
          label: 'Syntax & Runtime Check',
          passed: false,
          actual: err.response?.data?.message || err.message || 'Execution failed',
          expected: 'true',
        },
      ])
    } finally {
      setIsRunningTests(false)
    }
  }

  // --- Manager Email Reply Submission ---
  const handleSendEmailReply = async () => {
    if (!emailReplyText.trim()) return
    setIsSendingEmail(true)

    try {
      if (sessionId) {
        await apiClient.post(`/sessions/${sessionId}/simulation/email-reply`, {
          reply: emailReplyText.trim(),
        })
      }
      setEmailSentSuccess(true)
      setShowEmailToast(false)
    } catch (err) {
      console.warn('Error sending email reply:', err)
    } finally {
      setIsSendingEmail(false)
    }
  }

  // --- Final Hotfix & Immediate Advance ---
  const handleConfirmSubmit = async () => {
    setIsSubmitting(true)
    const signoffData = {
      deploymentDecision,
      remediationSummary: remediationSummary.trim() || incidentSayText.trim() || 'Hotfix verified and deployed.',
      fixedCode: fileContents[defaultFile] || code,
      emailReplyText,
      initialSayText: incidentSayText,
      notes: incidentSayText,
      unitTestsPassed: testResults ? testResults.every(r => r.passed) : false,
      passedTests: testResults ? testResults.filter(r => r.passed).length : 0,
      totalTests: testResults ? testResults.length : 0,
    }

    try {
      setShowSubmitModal(false)
      await onSubmitSimulation(signoffData)
    } catch (err) {
      console.warn('Submission error:', err)
      setShowSubmitModal(false)
      await onSubmitSimulation(signoffData)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Determine Monaco editor syntax language
  const getEditorLanguage = (filepath: string) => {
    if (filepath.endsWith('.py')) return 'python'
    if (filepath.endsWith('.js') || filepath.endsWith('.ts')) return 'javascript'
    if (filepath.endsWith('.json')) return 'json'
    if (filepath.endsWith('.yaml') || filepath.endsWith('.yml')) return 'yaml'
    if (filepath.endsWith('.md')) return 'markdown'
    return 'plaintext'
  }

  const isCurrentFileEditable = activeFile === defaultFile
  const currentFileContent = fileContents[activeFile] ?? (activeFile === defaultFile ? code : '')
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'

  const isPrevModuleAvailable = moduleIndex > 0
  const isNextModuleAvailable = moduleIndex < activeModules.length - 1

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground font-sans overflow-hidden select-none transition-colors duration-200">
      
      {/* ────────────────── TOP SPACIOUS & CLEAN NAVIGATION BAR ────────────────── */}
      <header className="h-14 border-b border-border bg-surface px-4 flex items-center justify-between shrink-0 z-20 shadow-xs">
        
        {/* Left Section: Repo Breadcrumb, Briefing Button, Theme Toggle */}
        <div className="flex items-center gap-3">
          
          {/* Briefing Button */}
          {onBackToBriefing && (
            <button
              onClick={onBackToBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-surface transition-colors cursor-pointer"
              title="Review Incident Briefing & Instructions"
            >
              <BookOpen className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline">Briefing &amp; Plan</span>
            </button>
          )}

          {/* Repo & Branch Badge */}
          <div className="hidden md:flex items-center gap-2 bg-background px-2.5 py-1 rounded-md text-xs font-mono text-accent border border-border">
            <GitBranch className="w-3.5 h-3.5" />
            <span>{scenario.terminalInfo?.repository || 'cdrecruit/service'}</span>
            <span className="text-muted-foreground">@</span>
            <span className="text-foreground">{scenario.terminalInfo?.branch || 'fix/incident'}</span>
          </div>

          {/* Light / Dark Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-surface transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-warning" />}
          </button>
        </div>

        {/* Center Section: Clear Section Navigation (Prev / Next Buttons) */}
        <div className="flex items-center gap-2">
          {isPrevModuleAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev Section</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-accent/10 text-accent border border-accent/20 text-xs font-bold font-mono">
            <span>Section {moduleIndex + 1} of {activeModules.length}</span>
          </div>

          {onAdvanceNext && (
            <button
              onClick={onAdvanceNext}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">{isNextModuleAvailable ? 'Next Section' : 'Review'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Section: Language, Test Runner, Submit Hotfix, Drawer Toggle */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Language Selector */}
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value as 'python' | 'javascript')}
            className="bg-background text-foreground text-xs border border-border rounded-md px-2 py-1 outline-none focus:border-accent cursor-pointer"
          >
            <option value="python">Python 3.11</option>
            <option value="javascript">Node.js 20</option>
          </select>

          {/* Run Diagnostics Button */}
          <button
            onClick={handleRunDiagnostics}
            disabled={isRunningTests}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            title="Execute test suite (Ctrl+Enter)"
          >
            {isRunningTests ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Run Tests</span>
          </button>

          {/* Submit Hotfix Button */}
          <button
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent/90 text-white text-xs font-semibold px-3.5 py-1.5 rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Submit Hotfix</span>
          </button>

          {/* Toggle Incident Drawer Button */}
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`p-1.5 rounded-md border text-xs transition-colors cursor-pointer ${
              isDrawerOpen
                ? 'bg-surface text-accent border-border'
                : 'bg-transparent text-muted-foreground border-transparent hover:bg-surface'
            }`}
            title="Toggle Incident Drawer"
          >
            {isDrawerOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ────────────────── 3-COLUMN MAIN WORKSTATION ────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ─── LEFT COLUMN: FILE EXPLORER ─── */}
        <aside className="w-60 border-r border-border bg-surface flex flex-col shrink-0 select-none">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border flex items-center justify-between">
            <span>Explorer</span>
            <span className="text-[10px] text-accent font-mono">{Object.keys(fileContents).length} files</span>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-1 text-xs">
            {/* Target Fixable Workspace File */}
            <div className="mb-2">
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FolderOpen className="w-3 h-3 text-accent" />
                <span>Editable Target</span>
              </div>
              <button
                onClick={() => handleOpenFile(defaultFile)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                  activeFile === defaultFile
                    ? 'bg-accent/10 text-accent font-semibold border border-accent/30'
                    : 'text-foreground hover:bg-background'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span className="truncate font-mono">{defaultFile}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isModified && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono">
                    FIX
                  </span>
                </div>
              </button>
            </div>

            {/* Readonly Project Repository Files */}
            <div>
              <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Folder className="w-3 h-3 text-muted-foreground" />
                <span>Repository Files</span>
              </div>
              <div className="space-y-0.5">
                {Object.keys(readonlyFiles).map((filepath) => (
                  <button
                    key={filepath}
                    onClick={() => handleOpenFile(filepath)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                      activeFile === filepath
                        ? 'bg-background text-foreground font-medium border border-border'
                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate font-mono">{filepath}</span>
                    </div>
                    <span className="text-[9px] px-1 rounded bg-surface text-muted-foreground border border-border font-mono">
                      LOCK
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Left Footer: Incident Summary Badge */}
          <div className="p-2.5 border-t border-border bg-surface text-[11px] text-muted-foreground space-y-1">
            <div className="flex items-center justify-between font-mono">
              <span className="font-semibold text-foreground">{scenario.jiraTicket?.ticketId || 'INCIDENT-101'}</span>
              <span className="text-critical font-bold">{scenario.jiraTicket?.priority || 'HIGH'}</span>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2">
              {scenario.description}
            </p>
          </div>
        </aside>

        {/* ─── CENTER COLUMN: MONACO EDITOR + INTEGRATED TERMINAL ─── */}
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          
          {/* Editor Tabs Strip */}
          <div className="h-9 border-b border-border bg-surface flex items-center px-1 overflow-x-auto shrink-0 gap-1">
            {openTabs.map((tabPath) => {
              const isActive = activeFile === tabPath
              const isEditable = tabPath === defaultFile
              return (
                <div
                  key={tabPath}
                  onClick={() => setActiveFile(tabPath)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-t border-t-2 cursor-pointer transition-colors font-mono ${
                    isActive
                      ? 'bg-background text-foreground border-accent font-semibold'
                      : 'bg-transparent text-muted-foreground border-transparent hover:bg-background/60'
                  }`}
                >
                  <FileCode className={`w-3.5 h-3.5 ${isEditable ? 'text-accent' : 'text-muted-foreground'}`} />
                  <span>{tabPath.split('/').pop()}</span>
                  {tabPath === defaultFile && isModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                  {openTabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(tabPath, e)}
                      className="hover:text-critical rounded p-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Monaco Code Editor Area */}
          <div className="flex-1 relative overflow-hidden bg-background">
            {!isCurrentFileEditable && (
              <div className="absolute top-2 right-4 z-10 bg-surface/90 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-muted-foreground border border-border flex items-center gap-1.5 shadow-xs">
                <Eye className="w-3.5 h-3.5" />
                <span>Read-only reference file</span>
              </div>
            )}

            <Editor
              height="100%"
              theme={monacoTheme}
              language={getEditorLanguage(activeFile)}
              value={currentFileContent}
              onChange={isCurrentFileEditable ? handleCodeChange : undefined}
              options={{
                readOnly: !isCurrentFileEditable,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                renderLineHighlight: 'all',
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>

          {/* ─── BOTTOM INTEGRATED TERMINAL / DIAGNOSTICS ─── */}
          <div className="h-56 border-t border-border bg-surface flex flex-col shrink-0">
            
            {/* Terminal Tab Bar */}
            <div className="h-8 border-b border-border bg-surface px-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setBottomTab('diagnostics')}
                  className={`flex items-center gap-1.5 py-1 font-semibold transition-colors border-b-2 cursor-pointer ${
                    bottomTab === 'diagnostics'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Diagnostics</span>
                  {testResults && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-background text-foreground">
                      {testResults.filter(r => r.passed).length}/{testResults.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setBottomTab('terminal')}
                  className={`flex items-center gap-1.5 py-1 font-semibold transition-colors border-b-2 cursor-pointer ${
                    bottomTab === 'terminal'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Terminal Logs</span>
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                Press <kbd className="bg-background px-1 py-0.5 rounded border border-border text-foreground">Ctrl</kbd> + <kbd className="bg-background px-1 py-0.5 rounded border border-border text-foreground">Enter</kbd> to test
              </span>
            </div>

            {/* Terminal Body Content */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-foreground bg-background">
              {bottomTab === 'diagnostics' && (
                <div className="space-y-2">
                  {!testResults ? (
                    <div className="text-muted-foreground italic py-2 flex items-center gap-2">
                      <Info className="w-4 h-4 text-accent" />
                      <span>Click 'Run Tests' or press Ctrl+Enter to execute test assertions against your code.</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {testResults.map((tr, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border flex items-start justify-between ${
                            tr.passed
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {tr.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            )}
                            <span className="font-semibold">{tr.label || `Test Case #${idx + 1}`}</span>
                          </div>

                          <div className="text-[11px] font-mono text-muted-foreground">
                            <span>Expected: <span className="text-foreground font-semibold">{String(tr.expected)}</span></span>
                            <span className="mx-2">•</span>
                            <span>Got: <span className={tr.passed ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>{String(tr.actual)}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {bottomTab === 'terminal' && (
                <div className="space-y-1">
                  {terminalLogs.map((logLine, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                      {logLine}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ─── RIGHT COLUMN: COLLAPSIBLE INCIDENT CONTEXT DRAWER ─── */}
        {isDrawerOpen && (
          <aside className="w-96 border-l border-border bg-surface flex flex-col shrink-0 animate-in slide-in-from-right duration-200 shadow-sm">
            
            {/* Drawer Tab Headers */}
            <div className="h-10 border-b border-border bg-surface px-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 overflow-x-auto">
                <button
                  onClick={() => setContextTab('jira')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                    contextTab === 'jira'
                      ? 'bg-background text-accent font-semibold shadow-xs border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Jira Specs</span>
                </button>

                <button
                  onClick={() => setContextTab('slack')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                    contextTab === 'slack'
                      ? 'bg-background text-accent font-semibold shadow-xs border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Slack</span>
                </button>

                <button
                  onClick={() => setContextTab('email')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 relative cursor-pointer ${
                    contextTab === 'email'
                      ? 'bg-background text-accent font-semibold shadow-xs border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email</span>
                  {emailTriggered && !emailSentSuccess && (
                    <span className="w-2 h-2 rounded-full bg-critical animate-pulse" />
                  )}
                </button>
              </div>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto p-4 text-xs space-y-4">
              
              {/* TAB 1: JIRA TICKET */}
              {contextTab === 'jira' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-background border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-accent font-bold">
                        {scenario.jiraTicket?.ticketId || 'BUG-3124'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/30">
                        {scenario.jiraTicket?.priority || 'HIGH PRIORITY'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-foreground leading-snug">
                      {scenario.jiraTicket?.title || scenario.title}
                    </h3>

                    <p className="text-muted-foreground leading-relaxed">
                      {scenario.jiraTicket?.description || scenario.description}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-background border border-border space-y-2">
                    <h4 className="font-bold text-[11px] text-foreground uppercase tracking-wider">
                      Acceptance Criteria
                    </h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      <li>Identify root cause in target codebase.</li>
                      <li>Pass all diagnostic test assertions.</li>
                      <li>Respond to Manager's deployment timeline inquiry.</li>
                      <li>Submit verified hotfix with release signoff.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 2: SLACK WAR ROOM */}
              {contextTab === 'slack' && (
                <div className="space-y-3">
                  <div className="text-[11px] text-muted-foreground font-mono border-b border-border pb-2 flex items-center justify-between">
                    <span>#incident-war-room</span>
                    <span className="text-[10px]">3 active members</span>
                  </div>

                  <div className="space-y-3">
                    {(scenario.slackMessages || [
                      { sender: 'Sarah Jenkins (QA)', body: 'Issue is reproducible in staging build.' },
                      { sender: 'Rahul Sharma (EM)', body: 'Need ETA for today deployment update.' },
                    ]).map((msg: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl bg-background border border-border space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-accent">{msg.sender}</span>
                          <span className="text-[10px] text-muted-foreground">10:14 AM</span>
                        </div>
                        <p className="text-foreground leading-relaxed">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: MANAGER EMAIL */}
              {contextTab === 'email' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-background border border-border space-y-2">
                    <div className="flex items-center justify-between border-b border-border pb-2 text-[11px]">
                      <div>
                        <span className="font-bold text-foreground">
                          {scenario.managerEmail?.fromName || 'Rahul Sharma'}
                        </span>
                        <span className="text-muted-foreground ml-1">({scenario.managerEmail?.fromRole || 'Engineering Manager'})</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Just now</span>
                    </div>

                    <div className="font-bold text-xs text-accent">
                      Subject: {scenario.managerEmail?.subject || 'Status Inquiry'}
                    </div>

                    <div className="text-foreground whitespace-pre-line leading-relaxed text-[11px]">
                      {scenario.managerEmail?.body || 'Could you provide a deployment ETA and root cause update?'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="font-bold text-[11px] text-foreground flex items-center justify-between">
                      <span>Your Response to Manager</span>
                      {emailSentSuccess && (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Reply Sent
                        </span>
                      )}
                    </label>

                    <textarea
                      rows={4}
                      value={emailReplyText}
                      onChange={(e) => setEmailReplyText(e.target.value)}
                      placeholder="Outline your root cause findings, estimated fix time, and whether it is safe for today's deployment..."
                      className="w-full bg-background border border-border rounded-xl p-3 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-accent resize-none shadow-xs"
                    />

                    <button
                      onClick={handleSendEmailReply}
                      disabled={isSendingEmail || !emailReplyText.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
                    >
                      {isSendingEmail ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{emailSentSuccess ? 'Update Reply' : 'Send Reply to Manager'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ────────────────── MANAGER EMAIL INCOMING TOAST ────────────────── */}
      {showEmailToast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-surface border border-accent/50 rounded-xl p-3.5 shadow-2xl animate-in slide-in-from-bottom-5 duration-300 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-accent/15 text-accent shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-foreground">
                {scenario.managerEmail?.fromName || 'Rahul Sharma'} (EM)
              </span>
              <button
                onClick={() => setShowEmailToast(false)}
                className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
              >
                ×
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {scenario.managerEmail?.subject || 'Status update needed for stakeholders'}
            </p>
            <button
              onClick={() => {
                setIsDrawerOpen(true)
                setContextTab('email')
                setShowEmailToast(false)
              }}
              className="text-[11px] font-bold text-accent hover:underline pt-1 inline-block cursor-pointer"
            >
              Open Email & Reply →
            </button>
          </div>
        </div>
      )}

      {/* ────────────────── HOTFIX SIGNOFF & RELEASE STRATEGY MODAL ────────────────── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-foreground">
            
            {/* Modal Header */}
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Hotfix Sign-Off &amp; Release Strategy</h3>
                <p className="text-xs text-muted-foreground">Confirm automated verifications and select deployment strategy</p>
              </div>
            </div>

            {/* Verification Status Card */}
            <div className="p-3.5 rounded-xl bg-background border border-border space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Target Patch File:</span>
                <span className="font-mono font-bold text-accent">{defaultFile}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Automated Diagnostic Tests:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {testResults ? `${testResults.filter(r => r.passed).length}/${testResults.length} Passed` : 'Passed'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Strategy (SAY) Response:</span>
                <span className={incidentSayText.trim() ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-500'}>
                  {incidentSayText.trim() ? `${incidentSayText.length} characters` : 'Optional'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Manager Email Reply:</span>
                <span className={emailReplyText.trim() ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-500'}>
                  {emailReplyText.trim() ? 'Provided' : 'Optional (skipped)'}
                </span>
              </div>
            </div>

            {/* Candidate Deployment Decision (Confidence Assessment) */}
            <div className="space-y-2">
              <label className="block font-bold text-xs text-foreground">
                Deployment Strategy &amp; Confidence Sign-Off
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeploymentDecision('PEER_REVIEW')}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 cursor-pointer ${
                    deploymentDecision === 'PEER_REVIEW'
                      ? 'bg-accent/15 border-accent text-foreground ring-1 ring-accent'
                      : 'bg-background border-border text-muted-foreground hover:bg-surface hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Users className="w-4 h-4 text-accent" />
                    <span>Peer Review &amp; Staging</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Request Tech Lead review before production rollout. (Prudent)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDeploymentDecision('DIRECT_PROD')}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 cursor-pointer ${
                    deploymentDecision === 'DIRECT_PROD'
                      ? 'bg-emerald-500/15 border-emerald-500 text-foreground ring-1 ring-emerald-500'
                      : 'bg-background border-border text-muted-foreground hover:bg-surface hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Rocket className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Direct Hotfix to Prod</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Deploy patch directly to production immediately. (High Confidence)
                  </p>
                </button>
              </div>
            </div>

            {/* Remediation Summary */}
            <div className="space-y-1.5">
              <label className="block font-bold text-xs text-foreground">
                Handoff &amp; Remediation Notes
              </label>
              <textarea
                rows={3}
                value={remediationSummary}
                onChange={(e) => setRemediationSummary(e.target.value)}
                placeholder="Briefly state root cause, why the patch resolves it, and monitoring steps..."
                className="w-full bg-background border border-border rounded-xl p-3 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-accent resize-none shadow-xs"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background transition-colors cursor-pointer"
              >
                Back to Editor
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Authorize &amp; Finalize Hotfix</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
