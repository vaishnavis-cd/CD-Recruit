import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
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
  BookOpen,
} from 'lucide-react';
import apiClient from '../../../api/client';
import { useTheme } from '../../../theme/ThemeProvider';
import { useSessionStore } from '../../../store/sessionMachine';
import { getEffectiveModuleType } from '../../../utils/moduleType';

interface ContextSimulationWorkspaceProps {
  sessionId: string;
  scenario: any;
  moduleIndex: number;
  currentIndex: number;
  totalQuestions: number;
  onBackToBriefing?: () => void;
  onNavigateModule?: (idx: number) => void;
  onAdvanceNext?: () => void;
  onSubmitSimulation: (signoffData?: any) => Promise<void> | void;
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
  const { theme, toggle: toggleTheme } = useTheme();
  const assessment = useSessionStore(s => s.assessment);
  const transitionTo = useSessionStore(s => s.transitionTo);

  // Derive active assessment module tabs
  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return ['SIMULATION'];
    }
    const types: string[] = [];
    for (const q of assessment.questions) {
      const type = getEffectiveModuleType(q);
      if (type && !types.includes(type)) {
        types.push(type);
      }
    }
    return types.length > 0 ? types : ['SIMULATION'];
  }, [assessment?.questions]);

  // --- Languages & Target File Setup ---
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'javascript'>('python');
  const defaultFile = scenario.defaultFile || (selectedLanguage === 'python' ? 'src/auth/validation.py' : 'src/auth/validation.js');

  // Starter code per language
  const starterCode = scenario.starterCode?.[selectedLanguage] || scenario.starterCode?.python || '';

  // All files mapping (readonly files + candidate editable file)
  const readonlyFiles: Record<string, string> = scenario.readonlyFiles || {
    'login/auth.py': `# auth.py - Core Authentication Handler\n\nfrom login_validation import validate_username\n\ndef authenticate_user(username: str, password_hash: str) -> dict:\n    if not validate_username(username):\n        raise ValueError("Invalid username format")\n    # Proceed with password verification against PostgreSQL database...\n    return {"status": "authenticated", "user": username}\n`,
    'login/middleware.py': `# middleware.py - Request Sanitation Middleware\n\nclass AuthenticationMiddleware:\n    def process_request(self, req):\n        # Pass username to validation service without modifying raw headers\n        pass\n`,
    'tests/test_validation.py': `# test_validation.py - QA Unit & Regression Test Suite\n\nimport pytest\nfrom login_validation import validate_username\n\ndef test_valid_username():\n    assert validate_username("valid_user") == True\n\ndef test_leading_space():\n    # QA REGRESSION BUG: Should reject leading spaces!\n    assert validate_username(" user_123") == False\n\ndef test_trailing_space():\n    # QA REGRESSION BUG: Should reject trailing spaces!\n    assert validate_username("user_123 ") == False\n`,
    'config/settings.yaml': `# settings.yaml\nenvironment: staging\nservice_name: login-service\nversion: 2.4.1\nauth_timeout_seconds: 300\n`,
    'utils/string_helpers.py': `# string_helpers.py\n\ndef is_alphanumeric_or_underscore(s: str) -> bool:\n    return all(c.isalnum() or c == '_' for c in s)\n`,
  };

  // Active open tabs and selected file
  const [openTabs, setOpenTabs] = useState<string[]>([defaultFile]);
  const [activeFile, setActiveFile] = useState<string>(defaultFile);

  // Candidate code buffer
  const [code, setCode] = useState<string>(starterCode);
  const [fileContents, setFileContents] = useState<Record<string, string>>({
    [defaultFile]: starterCode,
    ...readonlyFiles,
  });

  // Has code been modified by candidate
  const [isModified, setIsModified] = useState<boolean>(false);

  // Diagnostics & Terminal State
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    scenario.terminalInfo?.initialLogs || [
      `pytest tests/`,
      `Repository: ${scenario.terminalInfo?.repository || 'cdrecruit/service'} [${scenario.terminalInfo?.branch || 'main'}]`,
      `Diagnostics ready. Click 'Run Diagnostics' to test your code.`,
    ]
  );
  const [bottomTab, setBottomTab] = useState<'diagnostics' | 'terminal' | 'logs'>('diagnostics');

  // Right Incident Context Drawer State (Jira is default)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);
  const [contextTab, setContextTab] = useState<'jira' | 'slack' | 'email'>('jira');

  // Manager Email & Communication
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [emailTriggered, setEmailTriggered] = useState<boolean>(false);
  const [showEmailToast, setShowEmailToast] = useState<boolean>(false);
  const [emailReplyText, setEmailReplyText] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState<boolean>(false);

  // Incident Strategy & SAY Question Plan
  const [incidentSayText, setIncidentSayText] = useState<string>('');

  // Hotfix Signoff & Release Strategy Modal
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [deploymentDecision, setDeploymentDecision] = useState<'PEER_REVIEW' | 'DIRECT_PROD'>('PEER_REVIEW');
  const [remediationSummary, setRemediationSummary] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Telemetry Debounce Reference & Language Loaded Ref
  const telemetryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedLanguageRef = useRef<string | null>(null);

  // --- Initial Hydration from Session / Scenario ---
  useEffect(() => {
    if (loadedLanguageRef.current !== selectedLanguage) {
      loadedLanguageRef.current = selectedLanguage;
      const newStarter = scenario.starterCode?.[selectedLanguage] || scenario.starterCode?.python || '';
      setCode(newStarter);
      setFileContents(prev => ({
        ...readonlyFiles,
        ...prev,
        [defaultFile]: newStarter,
      }));
    }
  }, [selectedLanguage]);

  // Check remote simulation snapshot on mount
  useEffect(() => {
    if (!sessionId) return;

    apiClient.get(`/sessions/${sessionId}/simulation/summary`)
      .then(res => {
        if (res.data) {
          if (res.data.inbox && res.data.inbox.length > 0) {
            setInboxMessages(res.data.inbox);
            setEmailTriggered(true);
          }
          if (res.data.initialSayText) {
            setIncidentSayText(res.data.initialSayText);
          }
          if (res.data.emailReplyText) {
            setEmailReplyText(res.data.emailReplyText);
            setEmailSentSuccess(true);
          }
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // --- File Switcher & Tab Management ---
  const handleOpenFile = (filepath: string) => {
    if (!openTabs.includes(filepath)) {
      setOpenTabs([...openTabs, filepath]);
    }
    setActiveFile(filepath);

    if (sessionId) {
      apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
        type: 'FILE_OPEN',
        filepath,
      }).catch(() => {});
    }
  };

  const handleCloseTab = (filepath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter(t => t !== filepath);
    if (newTabs.length === 0) {
      newTabs.push(defaultFile);
    }
    setOpenTabs(newTabs);
    if (activeFile === filepath) {
      setActiveFile(newTabs[newTabs.length - 1]);
    }
  };

  // --- Code Change Handler & Auto-Telemetry ---
  const handleCodeChange = (newCode: string | undefined) => {
    const updated = newCode || '';
    if (activeFile === defaultFile) {
      setCode(updated);
      setIsModified(true);
    }
    setFileContents(prev => ({
      ...prev,
      [activeFile]: updated,
    }));

    if (telemetryDebounceRef.current) {
      clearTimeout(telemetryDebounceRef.current);
    }

    telemetryDebounceRef.current = setTimeout(async () => {
      if (!sessionId) return;
      try {
        const res = await apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
          type: 'FILE_EDIT',
          filepath: activeFile,
          metadata: { codeLength: updated.length },
        });

        if (res.data?.emailTriggered && !emailTriggered) {
          setEmailTriggered(true);
          setShowEmailToast(true);
          const managerMsg = {
            id: 101,
            from: scenario.managerEmail?.fromName || 'Rahul Sharma',
            role: scenario.managerEmail?.fromRole || 'Engineering Manager',
            subject: scenario.managerEmail?.subject || 'Status Inquiry',
            body: scenario.managerEmail?.body || 'Could you provide a deployment status update?',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: false,
          };
          setInboxMessages(prev => [managerMsg, ...prev]);
        }
      } catch (err) {
        console.warn('Telemetry error:', err);
      }
    }, 1200);
  };

  // --- Diagnostics Test Runner ---
  const handleRunDiagnostics = async () => {
    setIsRunningTests(true);
    setBottomTab('diagnostics');

    const activeCode = fileContents[defaultFile] || code;

    try {
      if (sessionId) {
        apiClient.post(`/sessions/${sessionId}/simulation/telemetry`, {
          type: 'TEST_EXECUTE',
          filepath: defaultFile,
        }).catch(() => {});
      }

      const res = await apiClient.post(`/sessions/${sessionId}/simulation/run-code`, {
        code: activeCode,
        language: selectedLanguage,
        testCases: scenario.testCases,
      });

      const results = Array.isArray(res.data) ? res.data : [];
      setTestResults(results);

      const passedCount = results.filter((r: any) => r.passed).length;
      const totalCount = results.length;

      setTerminalLogs(prev => [
        ...prev,
        `\n> pytest ${scenario.defaultFile || 'tests/'}`,
        `Running ${totalCount} diagnostic test cases against sandbox...`,
        ...results.map((r: any) => `  ${r.passed ? '✓ PASSED' : '✗ FAILED'}: ${r.label} (Expected: ${r.expected}, Got: ${r.actual})`),
        `==================== ${passedCount}/${totalCount} Passed ====================`,
      ]);

      if (!emailTriggered) {
        setEmailTriggered(true);
        setShowEmailToast(true);
      }
    } catch (err: any) {
      setTestResults([
        {
          label: 'Syntax & Runtime Check',
          passed: false,
          actual: err.response?.data?.message || err.message || 'Execution failed',
          expected: 'true',
        },
      ]);
    } finally {
      setIsRunningTests(false);
    }
  };

  // --- Manager Email Reply Submission ---
  const handleSendEmailReply = async () => {
    if (!emailReplyText.trim()) return;
    setIsSendingEmail(true);

    try {
      if (sessionId) {
        await apiClient.post(`/sessions/${sessionId}/simulation/email-reply`, {
          reply: emailReplyText.trim(),
        });
      }
      setEmailSentSuccess(true);
      setShowEmailToast(false);
    } catch (err) {
      console.warn('Error sending email reply:', err);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // --- Final Hotfix & Immediate Advance ---
  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
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
    };

    try {
      setShowSubmitModal(false);
      await onSubmitSimulation(signoffData);
    } catch (err) {
      console.warn('Submission error:', err);
      setShowSubmitModal(false);
      await onSubmitSimulation(signoffData);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEditorLanguage = (filepath: string) => {
    if (filepath.endsWith('.py')) return 'python';
    if (filepath.endsWith('.js') || filepath.endsWith('.ts')) return 'javascript';
    if (filepath.endsWith('.json')) return 'json';
    if (filepath.endsWith('.yaml') || filepath.endsWith('.yml')) return 'yaml';
    if (filepath.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  const isCurrentFileEditable = activeFile === defaultFile;
  const currentFileContent =
    fileContents[activeFile] !== undefined
      ? fileContents[activeFile]
      : (readonlyFiles[activeFile] ?? (activeFile === defaultFile ? code : ''));
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  const isPrevModuleAvailable = moduleIndex > 0;
  const isNextModuleAvailable = moduleIndex < activeModules.length - 1;

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden select-none transition-colors duration-200">
      {/* ────────────────── TOP NAVIGATION BAR ────────────────── */}
      <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] px-4 flex items-center justify-between shrink-0 z-20 shadow-xs">
        {/* Left Section */}
        <div className="flex items-center gap-3">
          {onBackToBriefing && (
            <button
              onClick={onBackToBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
              title="Review Incident Briefing & Instructions"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="hidden sm:inline">Briefing &amp; Plan</span>
            </button>
          )}

          <div className="hidden md:flex items-center gap-2 bg-[var(--background)] px-2.5 py-1 rounded-md text-xs font-mono text-[var(--accent)] border border-[var(--border)]">
            <GitBranch className="w-3.5 h-3.5" />
            <span>{scenario.terminalInfo?.repository || 'cdrecruit/service'}</span>
            <span className="text-[var(--muted-foreground)]">@</span>
            <span className="text-[var(--foreground)]">{scenario.terminalInfo?.branch || 'fix/incident'}</span>
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-warning" />}
          </button>
        </div>

        {/* Center Section: Navigation */}
        <div className="flex items-center gap-2">
          {isPrevModuleAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev Section</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 text-xs font-bold font-mono">
            <span>Section {moduleIndex + 1} of {activeModules.length}</span>
          </div>

          {onAdvanceNext && (
            <button
              onClick={onAdvanceNext}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">{isNextModuleAvailable ? 'Next Section' : 'Review'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value as 'python' | 'javascript')}
            className="bg-[var(--background)] text-[var(--foreground)] text-xs border border-[var(--border)] rounded-md px-2 py-1 outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="python">Python 3.11</option>
            <option value="javascript">Node.js 20</option>
          </select>

          <button
            onClick={handleRunDiagnostics}
            disabled={isRunningTests}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            title="Execute test suite"
          >
            {isRunningTests ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Run Tests</span>
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-semibold px-3.5 py-1.5 rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Submit Hotfix</span>
          </button>

          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`p-1.5 rounded-md border text-xs transition-colors cursor-pointer ${
              isDrawerOpen
                ? 'bg-[var(--surface)] text-[var(--accent)] border-[var(--border)]'
                : 'bg-transparent text-[var(--muted-foreground)] border-transparent hover:bg-[var(--surface)]'
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
        <aside className="w-60 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 select-none">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] flex items-center justify-between">
            <span>Explorer</span>
            <span className="text-[10px] text-[var(--accent)] font-mono">{Object.keys(fileContents).length} files</span>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-1 text-xs">
            {/* Target Fixable Workspace File */}
            <div className="mb-2">
              <div className="px-2 py-1 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1">
                <FolderOpen className="w-3 h-3 text-[var(--accent)]" />
                <span>Editable Target</span>
              </div>
              <button
                onClick={() => handleOpenFile(defaultFile)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                  activeFile === defaultFile
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)] font-semibold border border-[var(--accent)]/30'
                    : 'text-[var(--foreground)] hover:bg-[var(--background)]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="truncate font-mono">{defaultFile}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isModified && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
                  <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono">
                    FIX
                  </span>
                </div>
              </button>
            </div>

            {/* Readonly Project Repository Files */}
            <div>
              <div className="px-2 py-1 text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1">
                <Folder className="w-3 h-3 text-[var(--muted-foreground)]" />
                <span>Repository Files</span>
              </div>
              <div className="space-y-0.5">
                {Object.keys(readonlyFiles).map((filepath) => (
                  <button
                    key={filepath}
                    onClick={() => handleOpenFile(filepath)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                      activeFile === filepath
                        ? 'bg-[var(--background)] text-[var(--foreground)] font-medium border border-[var(--border)]'
                        : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]/60 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
                      <span className="truncate font-mono">{filepath}</span>
                    </div>
                    <span className="text-[9px] px-1 rounded bg-[var(--surface)] text-[var(--muted-foreground)] border border-[var(--border)] font-mono">
                      LOCK
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── CENTER COLUMN: MONACO EDITOR & INTEGRATED BOTTOM TERMINAL ─── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--background)]">
          {/* File Tabs Bar */}
          <div className="h-9 border-b border-[var(--border)] bg-[var(--surface)] px-2 flex items-center overflow-x-auto shrink-0 gap-1">
            {openTabs.map((tabPath) => {
              const isActive = activeFile === tabPath;
              const isEditable = tabPath === defaultFile;
              return (
                <div
                  key={tabPath}
                  onClick={() => setActiveFile(tabPath)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-t border-t-2 cursor-pointer transition-colors font-mono ${
                    isActive
                      ? 'bg-[var(--background)] text-[var(--foreground)] border-[var(--accent)] font-semibold'
                      : 'bg-transparent text-[var(--muted-foreground)] border-transparent hover:bg-[var(--background)]/60'
                  }`}
                >
                  <FileCode className={`w-3.5 h-3.5 ${isEditable ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'}`} />
                  <span>{tabPath.split('/').pop()}</span>
                  {tabPath === defaultFile && isModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                  )}
                  {openTabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(tabPath, e)}
                      className="hover:text-rose-500 rounded p-0.5 cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Monaco Code Editor Area */}
          <div className="flex-1 relative overflow-hidden bg-[var(--background)]">
            {!isCurrentFileEditable && (
              <div className="absolute top-2 right-4 z-10 bg-[var(--surface)]/90 backdrop-blur px-2.5 py-1 rounded text-[11px] font-mono text-[var(--muted-foreground)] border border-[var(--border)] flex items-center gap-1.5 shadow-xs">
                <Eye className="w-3.5 h-3.5" />
                <span>Read-only reference file</span>
              </div>
            )}

            <Editor
              height="100%"
              path={activeFile}
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
          <div className="h-56 border-t border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0">
            {/* Terminal Tab Bar */}
            <div className="h-8 border-b border-[var(--border)] bg-[var(--surface)] px-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setBottomTab('diagnostics')}
                  className={`flex items-center gap-1.5 py-1 font-semibold transition-colors border-b-2 cursor-pointer ${
                    bottomTab === 'diagnostics'
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Diagnostics</span>
                  {testResults && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--background)] text-[var(--foreground)]">
                      {testResults.filter(r => r.passed).length}/{testResults.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setBottomTab('terminal')}
                  className={`flex items-center gap-1.5 py-1 font-semibold transition-colors border-b-2 cursor-pointer ${
                    bottomTab === 'terminal'
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Terminal Logs</span>
                </button>
              </div>

              <span className="text-[11px] text-[var(--muted-foreground)] font-mono hidden sm:inline">
                Run Tests to verify your fix
              </span>
            </div>

            {/* Terminal Body Content */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-[var(--foreground)] bg-[var(--background)]">
              {bottomTab === 'diagnostics' ? (
                <div className="space-y-2">
                  {!testResults && !isRunningTests && (
                    <p className="text-[var(--muted-foreground)] italic">
                      Click "Run Tests" in the top bar to evaluate your implementation against regression cases.
                    </p>
                  )}
                  {isRunningTests && (
                    <div className="flex items-center gap-2 text-[var(--accent)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Executing regression test suite in sandbox...</span>
                    </div>
                  )}
                  {testResults && (
                    <div className="space-y-1.5">
                      {testResults.map((tr: any, i: number) => (
                        <div
                          key={i}
                          className={`p-2 rounded border flex items-center justify-between ${
                            tr.passed
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                              : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {tr.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            <span className="font-bold">{tr.label}</span>
                          </div>
                          <span className="text-[11px]">
                            {tr.passed ? 'PASSED' : `Expected: ${tr.expected} | Got: ${tr.actual}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap leading-relaxed text-[var(--foreground)]">{terminalLogs.join('\n')}</pre>
              )}
            </div>
          </div>
        </main>

        {/* ─── RIGHT COLUMN: INCIDENT CONTEXT DRAWER ─── */}
        {isDrawerOpen && (
          <aside className="w-80 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0">
            {/* Drawer Header Tabs */}
            <div className="h-9 border-b border-[var(--border)] px-2 flex items-center justify-between text-xs font-semibold">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setContextTab('jira')}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                    contextTab === 'jira'
                      ? 'bg-[var(--background)] text-[var(--accent)] font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Jira Ticket
                </button>
                <button
                  onClick={() => setContextTab('slack')}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                    contextTab === 'slack'
                      ? 'bg-[var(--background)] text-[var(--accent)] font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Slack War Room
                </button>
                <button
                  onClick={() => setContextTab('email')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
                    contextTab === 'email'
                      ? 'bg-[var(--background)] text-[var(--accent)] font-bold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <span>Email</span>
                  {inboxMessages.length > 0 && !emailSentSuccess && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {contextTab === 'jira' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30">
                        {scenario.jiraTicket?.ticketId || 'INCIDENT-101'}
                      </span>
                      <span className="text-[10px] font-bold text-amber-500 uppercase">High Priority</span>
                    </div>
                    <h3 className="font-bold text-sm text-[var(--foreground)]">{scenario.title}</h3>
                    <p className="text-[var(--muted-foreground)] leading-relaxed">{scenario.description}</p>
                  </div>

                  {incidentSayText && (
                    <div className="p-3 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 space-y-1.5">
                      <div className="text-[11px] font-bold text-[var(--accent)] uppercase font-mono">Your Initial Plan</div>
                      <p className="text-[var(--foreground)] font-mono text-[11px] leading-relaxed">{incidentSayText}</p>
                    </div>
                  )}
                </div>
              )}

              {contextTab === 'slack' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2">
                    <div className="flex items-center gap-2 font-bold text-[var(--foreground)]">
                      <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
                      <span>#war-room-incident-response</span>
                    </div>
                    <div className="space-y-2 text-[11px] pt-1 text-[var(--muted-foreground)]">
                      <div><strong className="text-[var(--foreground)]">Sarah Jenkins (QA):</strong> "Regression failure: username with leading space ' user' was accepted by validator."</div>
                      <div><strong className="text-[var(--foreground)]">Alex Rivera (Lead):</strong> "Please check <code className="font-mono text-[var(--accent)]">{defaultFile}</code> and verify boundary validation."</div>
                    </div>
                  </div>
                </div>
              )}

              {contextTab === 'email' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2.5">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                      <div>
                        <div className="font-bold text-[var(--foreground)]">{scenario.managerEmail?.fromName || 'Rahul Sharma'}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">{scenario.managerEmail?.fromRole || 'Engineering Manager'}</div>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)]">High Priority</span>
                    </div>
                    <div className="text-xs font-bold text-[var(--foreground)]">{scenario.managerEmail?.subject || 'Status update needed for stakeholders'}</div>
                    <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                      {scenario.managerEmail?.body || 'Could you provide a deployment status update and estimated time of resolution?'}
                    </p>
                  </div>

                  {/* Reply Form */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[var(--foreground)]">Reply to Engineering Manager</label>
                    <textarea
                      rows={4}
                      value={emailReplyText}
                      onChange={(e) => setEmailReplyText(e.target.value)}
                      placeholder="e.g. Root cause identified in validation logic. Fix implemented and passed regression test suite. Ready for deployment."
                      disabled={emailSentSuccess || isSendingEmail}
                      className="w-full p-2.5 rounded-xl bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] outline-none resize-y"
                    />
                    <button
                      onClick={handleSendEmailReply}
                      disabled={!emailReplyText.trim() || isSendingEmail || emailSentSuccess}
                      className="w-full py-2 bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>{emailSentSuccess ? '✓ Reply Sent' : 'Send Email Reply'}</span>
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
        <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-[var(--surface)] border border-[var(--accent)]/50 rounded-xl p-3.5 shadow-2xl animate-in slide-in-from-bottom-5 duration-300 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[var(--foreground)]">
                {scenario.managerEmail?.fromName || 'Rahul Sharma'} (EM)
              </span>
              <button
                onClick={() => setShowEmailToast(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm cursor-pointer"
              >
                ×
              </button>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2">
              {scenario.managerEmail?.subject || 'Status update needed for stakeholders'}
            </p>
            <button
              onClick={() => {
                setIsDrawerOpen(true);
                setContextTab('email');
                setShowEmailToast(false);
              }}
              className="text-[11px] font-bold text-[var(--accent)] hover:underline pt-1 inline-block cursor-pointer"
            >
              Open Email &amp; Reply →
            </button>
          </div>
        </div>
      )}

      {/* ────────────────── HOTFIX SIGNOFF & RELEASE STRATEGY MODAL ────────────────── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-[var(--foreground)]">
            {/* Modal Header */}
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--foreground)]">Hotfix Sign-Off &amp; Release Strategy</h3>
                <p className="text-xs text-[var(--muted-foreground)]">Confirm automated verifications and select deployment strategy</p>
              </div>
            </div>

            {/* Verification Status Card */}
            <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted-foreground)]">Target Patch File:</span>
                <span className="font-mono font-bold text-[var(--accent)]">{defaultFile}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted-foreground)]">Automated Diagnostic Tests:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {testResults ? `${testResults.filter(r => r.passed).length}/${testResults.length} Passed` : 'Passed'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted-foreground)]">Strategy (SAY) Response:</span>
                <span className={incidentSayText.trim() ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-500'}>
                  {incidentSayText.trim() ? `${incidentSayText.length} characters` : 'Optional'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted-foreground)]">Manager Email Reply:</span>
                <span className={emailReplyText.trim() ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-500'}>
                  {emailReplyText.trim() ? 'Provided' : 'Optional (skipped)'}
                </span>
              </div>
            </div>

            {/* Candidate Deployment Decision */}
            <div className="space-y-2">
              <label className="block font-bold text-xs text-[var(--foreground)]">
                Deployment Strategy &amp; Confidence Sign-Off
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeploymentDecision('PEER_REVIEW')}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 cursor-pointer ${
                    deploymentDecision === 'PEER_REVIEW'
                      ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--foreground)] ring-1 ring-[var(--accent)]'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Users className="w-4 h-4 text-[var(--accent)]" />
                    <span>Peer Review &amp; Staging</span>
                  </div>
                  <p className="text-[10px] text-[var(--muted-foreground)] leading-snug">
                    Request Tech Lead review before production rollout. (Prudent)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDeploymentDecision('DIRECT_PROD')}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 cursor-pointer ${
                    deploymentDecision === 'DIRECT_PROD'
                      ? 'bg-emerald-500/15 border-emerald-500 text-[var(--foreground)] ring-1 ring-emerald-500'
                      : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Rocket className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Direct Hotfix to Prod</span>
                  </div>
                  <p className="text-[10px] text-[var(--muted-foreground)] leading-snug">
                    Deploy patch directly to production immediately. (High Confidence)
                  </p>
                </button>
              </div>
            </div>

            {/* Remediation Summary */}
            <div className="space-y-1.5">
              <label className="block font-bold text-xs text-[var(--foreground)]">
                Handoff &amp; Remediation Notes
              </label>
              <textarea
                rows={3}
                value={remediationSummary}
                onChange={(e) => setRemediationSummary(e.target.value)}
                placeholder="Briefly state root cause, why the patch resolves it, and monitoring steps..."
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[var(--accent)] resize-none shadow-xs"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors cursor-pointer"
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
  );
}
