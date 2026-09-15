import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  FileCode,
  Terminal,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Check,
  Send,
  Loader2,
  GitFork,
  Sun,
  Moon,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Rocket,
  Users,
  ShieldCheck,
  Lock,
  Mail,
  X,
  ChevronRight,
} from 'lucide-react';
import apiClient from '../../../api/client';
import { useTheme } from '../../../theme/ThemeProvider';
import { useSessionStore } from '../../../store/sessionMachine';
import { getEffectiveModuleType } from '../../../utils/moduleType';
import { Timer } from '../../../components/Timer';

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
  const assessment = useSessionStore((s) => s.assessment);

  // Derive active assessment module tabs
  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS'];
    }
    const types: string[] = [];
    for (const q of assessment.questions) {
      const type = getEffectiveModuleType(q);
      if (type && !types.includes(type)) {
        types.push(type);
      }
    }
    return types.length > 0
      ? types
      : ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS'];
  }, [assessment?.questions]);

  // Languages & Target File Setup
  const [selectedLanguage, setSelectedLanguage] = useState<'python' | 'javascript'>('python');

  // Starter code per language matching UI reference or bulk import
  const customStarter =
    typeof scenario.starterCode === 'string' && scenario.starterCode.trim()
      ? scenario.starterCode
      : scenario.starterCode?.[selectedLanguage] || scenario.starterCode?.python;

  const defaultStarterFallback = `# login_validation.py

def validate_username(username: str) -> bool:
    """
    Validates a username for login.
    Requirements:
    - Must be between 3 and 20 characters long.
    - Must NOT contain leading or trailing spaces.
    - Must only contain alphanumeric characters or underscores.
    """
    if not username:
        return False

    # QA BUG: Missing leading/trailing space validation!
    # Fix needed: username should be checked or trimmed properly.
    if len(username) < 3 or len(username) > 20:
        return False

    return all(c.isalnum() or c == '_' for c in username)
`;

  const starterCode = customStarter || defaultStarterFallback;
  const defaultFile = scenario.targetFile || 'src/auth/validation.py';

  // Readonly repo files: uses scenario.supportingFiles if provided from CSV / API, or defaults
  const defaultReadonlyFiles: Record<string, string> = {
    'src/auth/auth_handler.py': `# auth_handler.py - Core Authentication Handler

from validation import validate_username

def authenticate_user(username: str, password_hash: str) -> dict:
    if not validate_username(username):
        raise ValueError("Invalid username format")
    # Proceed with password verification against PostgreSQL database...
    return {"status": "authenticated", "user": username}
`,
    'src/auth/middleware.py': `# middleware.py - Request Sanitation Middleware

class AuthenticationMiddleware:
    def process_request(self, req):
        # Pass username to validation service without modifying raw headers
        pass
`,
    'tests/test_validation.py': `# test_validation.py - QA Unit & Regression Test Suite

import pytest
from validation import validate_username

def test_valid_username():
    assert validate_username("valid_user") == True

def test_leading_space():
    # QA REGRESSION BUG: Should reject leading spaces!
    assert validate_username(" user_123") == False

def test_trailing_space():
    # QA REGRESSION BUG: Should reject trailing spaces!
    assert validate_username("user_123 ") == False
`,
    'config/settings.yaml': `# settings.yaml
environment: staging
service_name: auth-service
version: 2.4.1
auth_timeout_seconds: 300
`,
    'utils/string_helper.py': `# string_helper.py

def is_alphanumeric_or_underscore(s: str) -> bool:
    return all(c.isalnum() or c == '_' for c in s)
`,
  };

  const readonlyFiles: Record<string, string> =
    scenario.supportingFiles && Object.keys(scenario.supportingFiles).length > 0
      ? scenario.supportingFiles
      : defaultReadonlyFiles;

  // Active open tabs and selected file
  const [openTabs, setOpenTabs] = useState<string[]>([
    defaultFile,
    ...Object.keys(readonlyFiles).slice(0, 2),
  ]);
  const [activeFile, setActiveFile] = useState<string>(defaultFile);

  // Candidate code buffer
  const [code, setCode] = useState<string>(starterCode);
  const [fileContents, setFileContents] = useState<Record<string, string>>({
    [defaultFile]: starterCode,
    ...readonlyFiles,
  });

  const [isModified, setIsModified] = useState<boolean>(false);

  // Diagnostics & Pytest Terminal Logs
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [bottomTab, setBottomTab] = useState<'diagnostics' | 'terminal'>('diagnostics');

  const repoName = scenario?.terminalInfo?.repository || 'cdrecruit/auth-service';
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    `cdrecruit-workstation:~$ cd /workspace/${repoName}`,
    `cdrecruit-workstation:/workspace/${repoName}$ ls -la`,
    `total 24`,
    `drwxr-xr-x 4 dev dev 4096 tests`,
    `drwxr-xr-x 3 dev dev 4096 src`,
    `-rw-r--r-- 1 dev dev  520 package.json`,
    ``,
    `cdrecruit-workstation:/workspace/${repoName}$ # Test runner standby. Click 'Run Tests' above to execute regression suite.`,
  ]);

  // Right Incident Context Drawer State (Jira is default)
  const [contextTab, setContextTab] = useState<'jira' | 'slack' | 'email'>('jira');

  // Manager Email & Communication
  const [emailReplyText, setEmailReplyText] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState<boolean>(false);

  // Manager Email Arrival Notification & Toast State
  const [hasUnreadManagerEmail, setHasUnreadManagerEmail] = useState<boolean>(false);
  const [showEmailToast, setShowEmailToast] = useState<boolean>(false);
  const emailToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slack Messages state
  const [slackMessages, setSlackMessages] = useState<
    Array<{ id: number; author: string; role: string; time: string; text: string }>
  >([
    {
      id: 1,
      author: 'Sarah Jenkins',
      role: 'QA',
      time: '11:02 AM',
      text: "Regression failure: username with leading space ' user' was accepted by validator.",
    },
    {
      id: 2,
      author: 'Alex Rivera',
      role: 'Lead',
      time: '11:05 AM',
      text: 'Please check src/auth/validation.py and verify boundary validation.',
    },
  ]);
  const [slackInput, setSlackInput] = useState('');

  // Hotfix Signoff Modal
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [deploymentDecision, setDeploymentDecision] = useState<'PEER_REVIEW' | 'DIRECT_PROD'>('PEER_REVIEW');
  const [remediationSummary, setRemediationSummary] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Clean up email toast timer on unmount
  useEffect(() => {
    return () => {
      if (emailToastTimerRef.current) {
        clearTimeout(emailToastTimerRef.current);
      }
    };
  }, []);

  // Check on mount if manager email is already pending and unread
  useEffect(() => {
    if (scenario?.managerEmail && !emailReplyText.trim() && !emailSentSuccess) {
      if (scenario.emailTriggered || scenario.hasInitialSay) {
        setHasUnreadManagerEmail(true);
      }
    }
  }, [scenario, emailReplyText, emailSentSuccess]);

  // Telemetry Debounce Reference
  const telemetryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // File Switcher & Tab Management
  const handleOpenFile = (filepath: string) => {
    if (!openTabs.includes(filepath)) {
      setOpenTabs([...openTabs, filepath]);
    }
    setActiveFile(filepath);

    if (sessionId) {
      apiClient
        .post(`/sessions/${sessionId}/simulation/telemetry`, {
          type: 'FILE_OPEN',
          filepath,
        })
        .catch(() => {});
    }
  };

  const handleCloseTab = (filepath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter((t) => t !== filepath);
    if (newTabs.length === 0) {
      newTabs.push(defaultFile);
    }
    setOpenTabs(newTabs);
    if (activeFile === filepath) {
      setActiveFile(newTabs[newTabs.length - 1]);
    }
  };

  // Code Change Handler & Auto-Telemetry
  const handleCodeChange = (newCode: string | undefined) => {
    const updated = newCode || '';
    if (activeFile === defaultFile) {
      setCode(updated);
      setIsModified(true);
    }
    setFileContents((prev) => ({
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
        if (res?.data?.emailTriggered && !emailSentSuccess) {
          setHasUnreadManagerEmail(true);
          setShowEmailToast(true);
          if (emailToastTimerRef.current) clearTimeout(emailToastTimerRef.current);
          emailToastTimerRef.current = setTimeout(() => setShowEmailToast(false), 8000);
        }
      } catch (err) {
        console.warn('Telemetry error:', err);
      }
    }, 1200);
  };

  // Diagnostics Test Runner
  const handleRunDiagnostics = async () => {
    setIsRunningTests(true);
    setBottomTab('diagnostics');

    const activeCode = fileContents[defaultFile] || code;

    // Simulate diagnostic evaluation against test cases
    try {
      if (sessionId) {
        apiClient
          .post(`/sessions/${sessionId}/simulation/telemetry`, {
            type: 'TEST_EXECUTE',
            filepath: defaultFile,
          })
          .then((res) => {
            if (res?.data?.emailTriggered && !emailSentSuccess) {
              setHasUnreadManagerEmail(true);
              setShowEmailToast(true);
              if (emailToastTimerRef.current) clearTimeout(emailToastTimerRef.current);
              emailToastTimerRef.current = setTimeout(() => setShowEmailToast(false), 8000);
            }
          })
          .catch(() => {});
      }

      const res = await apiClient.post(`/sessions/${sessionId}/simulation/run-code`, {
        code: activeCode,
        language: selectedLanguage,
        testCases: scenario?.testCases || [
          { input: '"valid_user"', expectedOutput: 'true', label: 'Sample Valid Username' },
          { input: '" user_123"', expectedOutput: 'false', label: 'Leading Space Bug Check' },
          { input: '"user_123 "', expectedOutput: 'false', label: 'Trailing Space Bug Check' },
        ],
      });

      const results = Array.isArray(res.data) ? res.data : [];
      setTestResults(results);

      const passedCount = results.filter((r: any) => r.passed).length;
      const totalCount = results.length;

      const runnerCmd = selectedLanguage === 'python'
        ? `pytest tests/test_${scenario?.id || 'validation'}.py`
        : `npm test -- tests/test_${scenario?.id || 'validation'}.test.js`;

      setTerminalLogs([
        `cdrecruit-workstation:/workspace/${repoName}$ ${runnerCmd}`,
        `============================= test session starts ==============================`,
        `platform linux -- ${selectedLanguage === 'python' ? 'Python 3.11.8, pytest-7.4.4' : 'Node v20.11.1, jest-29.7.0'}`,
        `rootdir: /workspace/${repoName}`,
        `collected ${totalCount} items`,
        ``,
        ...results.map(
          (r: any, idx: number) =>
            `tests/test_${(r.label || `case_${idx + 1}`).toLowerCase().replace(/\s+/g, '_')} ${
              r.passed ? 'PASSED' : 'FAILED'
            } [ ${Math.round(((idx + 1) / totalCount) * 100)}% ]`
        ),
        `==================== ${passedCount}/${totalCount} Passed ====================`,
      ]);
    } catch (err: any) {
      // Realistic diagnostic output if error occurs or module missing
      const runnerCmd = selectedLanguage === 'python'
        ? `pytest tests/test_${scenario?.id || 'validation'}.py`
        : `npm test`;
      setTerminalLogs([
        `cdrecruit-workstation:/workspace/${repoName}$ ${runnerCmd}`,
        `============================= test session starts ==============================`,
        `platform linux -- ${selectedLanguage === 'python' ? 'Python 3.11.8, pytest-7.4.4' : 'Node v20.11.1'}`,
        `rootdir: /workspace/${repoName}`,
        `collected 3 items`,
        ``,
        `tests/test_${scenario?.id || 'validation'}.py::test_validation_rules FAILED [ 33% ]`,
        `E   AssertionError: Validation rules failed against inputs with leading/trailing whitespace`,
        `E   File "/workspace/${repoName}/${defaultFile}", line 16`,
        ``,
        `=========================== 3 failed in 0.41s ===========================`,
      ]);

      setTestResults([
        {
          label: 'Sample Valid Username',
          passed: false,
          actual: "SyntaxError: No module named 'validation'",
          expected: 'true',
        },
        {
          label: 'Leading Space Bug Check',
          passed: false,
          actual: "SyntaxError: No module named 'validation'",
          expected: 'false',
        },
        {
          label: 'Trailing Space Bug Check',
          passed: false,
          actual: "SyntaxError: No module named 'validation'",
          expected: 'false',
        },
      ]);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Manager Email Reply Submission
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
    } catch (err) {
      console.warn('Error sending email reply:', err);
      setEmailSentSuccess(true);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Slack Message Send
  const handleSendSlack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slackInput.trim()) return;
    const newMsg = {
      id: Date.now(),
      author: 'You (Candidate)',
      role: 'Engineer',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: slackInput.trim(),
    };
    setSlackMessages((prev) => [...prev, newMsg]);
    setSlackInput('');
  };

  // Final Hotfix & Immediate Advance
  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    const signoffData = {
      deploymentDecision,
      remediationSummary: remediationSummary.trim() || 'Hotfix verified and deployed.',
      fixedCode: fileContents[defaultFile] || code,
      emailReplyText,
      unitTestsPassed: testResults ? testResults.every((r) => r.passed) : false,
      passedTests: testResults ? testResults.filter((r) => r.passed).length : 0,
      totalTests: testResults ? testResults.length : 3,
    };

    try {
      setShowSubmitModal(false);
      await onSubmitSimulation(signoffData);
    } catch (err) {
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

  const repoFilesList = Object.keys(readonlyFiles).map((p) => ({
    path: p,
    label: p.length > 25 ? p.slice(0, 22) + '...' : p,
  }));

  return (
    <div className="flex flex-col h-screen w-screen bg-white dark:bg-[#0B0F17] text-[#0F172A] dark:text-[#F8FAFC] font-sans overflow-hidden select-none">
      {/* ────────────────── TOP NAVIGATION BAR ────────────────── */}
      <header className="h-[60px] border-b border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#111827] px-6 sm:px-8 flex items-center justify-between shrink-0 z-20 shadow-2xs">
        {/* Left Section: Briefing Button & Repo Branch Pill */}
        <div className="flex items-center gap-3">
          {onBackToBriefing && (
            <button
              onClick={onBackToBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-semibold text-[#0F172A] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer shadow-2xs"
              title="Review Incident Briefing & Instructions"
            >
              <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Briefing &amp; Plan</span>
            </button>
          )}

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
            <GitFork className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>cdrecruit/auth-service</span>
            <span className="text-[#64748B]">@</span>
            <span className="text-[#2563EB] dark:text-[#60A5FA]">fix/space-validation</span>
          </div>
        </div>

        {/* Center Section: Prev/Next and Timer */}
        <div className="flex items-center gap-2.5">
          {isPrevModuleAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev Section</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 text-[#2563EB] dark:text-[#60A5FA] border border-[#BFDBFE] dark:border-[#1E3A8A] text-xs font-bold font-mono">
            <span>
              Section {moduleIndex + 1} of {activeModules.length}
            </span>
          </div>

          {onAdvanceNext && (
            <button
              onClick={onAdvanceNext}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">{isNextModuleAvailable ? 'Next Section' : 'Review'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Synchronized Assessment Timer */}
          <Timer />
        </div>

        {/* Right Section: Language, Run Tests, Submit Hotfix, Theme */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value as 'python' | 'javascript')}
            className="bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-white text-xs font-semibold border border-[#CBD5E1] dark:border-[#334155] rounded-lg px-3 py-1.5 outline-none focus:border-[#2563EB] cursor-pointer shadow-2xs"
          >
            <option value="python">Python 3.11</option>
            <option value="javascript">Node.js 20</option>
          </select>

          <button
            onClick={handleRunDiagnostics}
            disabled={isRunningTests}
            className="flex items-center gap-1.5 border border-[#10B981] bg-white hover:bg-[#ECFDF5] dark:bg-[#064E3B]/20 dark:hover:bg-[#064E3B]/40 text-[#059669] dark:text-[#34D399] text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            title="Execute test suite"
          >
            {isRunningTests ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-[#059669] dark:fill-[#34D399]" />
            )}
            <span>Run Tests</span>
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Submit Hotfix</span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        </div>
      </header>

      {/* ────────────────── 3-COLUMN MAIN WORKSTATION ────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── LEFT COLUMN: FILE EXPLORER ─── */}
        <aside className="w-60 border-r border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111827] flex flex-col shrink-0 select-none">
          <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[#0F172A] dark:text-white border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between font-mono">
            <span>EXPLORER</span>
            <span className="text-[11px] font-bold text-[#2563EB] dark:text-[#60A5FA]">6 FILES</span>
          </div>

          <div className="flex-1 overflow-y-auto py-2 text-xs">
            {/* Target Fixable Workspace File */}
            <div className="mb-2">
              <div className="px-4 py-1.5 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                EDITABLE TARGET
              </div>
              <button
                onClick={() => handleOpenFile(defaultFile)}
                className={`w-[calc(100%-16px)] mx-2 flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                  activeFile === defaultFile
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 text-[#2563EB] dark:text-[#60A5FA] font-bold border border-[#2563EB]'
                    : 'text-[#0F172A] dark:text-white hover:bg-white dark:hover:bg-[#1E293B]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  <span className="truncate font-mono text-[11px]">{defaultFile}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ECFDF5] dark:bg-[#064E3B]/30 text-[#059669] dark:text-[#34D399] border border-[#A7F3D0] dark:border-[#064E3B] font-mono font-bold">
                  FIX
                </span>
              </button>
            </div>

            {/* Readonly Project Repository Files */}
            <div>
              <div className="px-4 py-1.5 text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] uppercase tracking-wider">
                REPOSITORY FILES
              </div>
              <div className="space-y-0.5 px-2">
                {repoFilesList.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => handleOpenFile(file.path)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      activeFile === file.path
                        ? 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-white font-semibold border border-[#CBD5E1] dark:border-[#334155]'
                        : 'text-[#64748B] dark:text-[#94A3B8] hover:bg-white/60 dark:hover:bg-[#1E293B]/60 hover:text-[#0F172A]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                      <span className="truncate font-mono text-[11px]">{file.label}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] border border-[#E2E8F0] dark:border-[#334155] font-mono font-semibold">
                      LOCK
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ─── CENTER COLUMN: MONACO EDITOR & INTEGRATED BOTTOM TERMINAL ─── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#0B0F17]">
          {/* File Tabs Bar */}
          <div className="h-10 border-b border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#111827] flex items-center overflow-x-auto shrink-0">
            {openTabs.map((tabPath) => {
              const isActive = activeFile === tabPath;
              return (
                <div
                  key={tabPath}
                  onClick={() => setActiveFile(tabPath)}
                  className={`flex items-center gap-2 px-4 h-full text-xs border-r border-[#E2E8F0] dark:border-[#1E293B] cursor-pointer transition-colors font-mono select-none ${
                    isActive
                      ? 'bg-white dark:bg-[#0B0F17] text-[#2563EB] dark:text-[#60A5FA] font-bold border-t-2 border-t-[#2563EB]'
                      : 'bg-[#F8FAFC] dark:bg-[#111827] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                  }`}
                >
                  <span>{tabPath.split('/').pop()}</span>
                  {openTabs.length > 1 && (
                    <button
                      onClick={(e) => handleCloseTab(tabPath, e)}
                      className="hover:text-rose-500 rounded p-0.5 ml-1 text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Monaco Code Editor Area */}
          <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#0B0F17]">
            {!isCurrentFileEditable && (
              <div className="absolute top-2 right-4 z-10 bg-[#F8FAFC]/90 dark:bg-[#111827]/90 backdrop-blur px-3 py-1 rounded-md text-[11px] font-mono text-[#64748B] border border-[#E2E8F0] dark:border-[#1E293B] flex items-center gap-1.5 shadow-2xs">
                <Lock className="w-3.5 h-3.5" />
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
          <div className="h-56 border-t border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#111827] flex flex-col shrink-0">
            {/* Terminal Tab Bar */}
            <div className="h-9 border-b border-[#E2E8F0] dark:border-[#1E293B] px-4 flex items-center justify-between text-xs bg-[#F8FAFC] dark:bg-[#111827]">
              <div className="flex items-center gap-5">
                <button
                  onClick={() => setBottomTab('diagnostics')}
                  className={`flex items-center gap-1.5 py-1.5 font-semibold transition-colors border-b-2 cursor-pointer ${
                    bottomTab === 'diagnostics'
                      ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                      : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Diagnostics</span>
                </button>

                <button
                  onClick={() => setBottomTab('terminal')}
                  className={`flex items-center gap-1.5 py-1.5 font-semibold transition-colors border-b-2 cursor-pointer ${
                    bottomTab === 'terminal'
                      ? 'border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA]'
                      : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Terminal Logs</span>
                </button>
              </div>

              <span className="text-[11px] text-[#64748B] font-mono font-medium hidden sm:inline">
                Run Tests to verify your fix
              </span>
            </div>

            {/* Terminal Body Content */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-white dark:bg-[#0B0F17]">
              {bottomTab === 'diagnostics' ? (
                <div className="space-y-2.5">
                  {!testResults && !isRunningTests && (
                    <p className="text-[#64748B] dark:text-[#94A3B8] text-[12px] font-sans">
                      Click "Run Tests" in the top bar to evaluate your implementation against regression cases.
                    </p>
                  )}
                  {isRunningTests && (
                    <div className="flex items-center gap-2 text-[#2563EB]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Executing regression test suite in sandbox...</span>
                    </div>
                  )}
                  {testResults && (
                    <div className="space-y-2">
                      {testResults.map((tr: any, i: number) => (
                        <div
                          key={i}
                          className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                            tr.passed
                              ? 'bg-[#ECFDF5] dark:bg-[#064E3B]/20 border-[#A7F3D0] dark:border-[#064E3B] text-[#059669]'
                              : 'bg-[#FEF2F2] dark:bg-[#7F1D1D]/20 border-[#FECACA] dark:border-[#991B1B]/40 text-[#DC2626]'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold">
                            {tr.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                            )}
                            <span>{tr.label}</span>
                          </div>
                          <span className="font-mono text-xs text-[#64748B] dark:text-[#94A3B8]">
                            {tr.passed ? (
                              'PASSED'
                            ) : (
                              <>
                                Expected: <span className="font-bold text-[#0F172A] dark:text-white">{tr.expected}</span> | Got:{' '}
                                <span className="font-bold text-[#DC2626]">{tr.actual}</span>
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap leading-relaxed text-[#0F172A] dark:text-[#F8FAFC]">
                  {terminalLogs.join('\n')}
                </pre>
              )}
            </div>
          </div>
        </main>

        {/* ─── RIGHT COLUMN: INCIDENT CONTEXT DRAWER ─── */}
        <aside className="w-80 border-l border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#111827] flex flex-col shrink-0">
          {/* Drawer Header Tabs */}
          <div className="h-12 border-b border-[#E2E8F0] dark:border-[#1E293B] px-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setContextTab('jira')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  contextTab === 'jira'
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA] font-bold shadow-2xs'
                    : 'bg-white dark:bg-[#1E293B] border-[#E2E8F0] dark:border-[#334155] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                Jira Ticket
              </button>
              <button
                onClick={() => setContextTab('slack')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  contextTab === 'slack'
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA] font-bold shadow-2xs'
                    : 'bg-white dark:bg-[#1E293B] border-[#E2E8F0] dark:border-[#334155] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                Slack War Room
              </button>
              <button
                onClick={() => {
                  setContextTab('email');
                  setHasUnreadManagerEmail(false);
                  setShowEmailToast(false);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer relative flex items-center gap-1.5 ${
                  contextTab === 'email'
                    ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#2563EB] text-[#2563EB] dark:text-[#60A5FA] font-bold shadow-2xs'
                    : 'bg-white dark:bg-[#1E293B] border-[#E2E8F0] dark:border-[#334155] text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                }`}
              >
                <span>Email</span>
                {hasUnreadManagerEmail && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold animate-pulse">
                    NEW
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {/* Tab 1: Jira Ticket */}
            {contextTab === 'jira' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 text-[#DC2626] border border-[#FECACA] dark:border-[#991B1B]/40">
                    BUG 3214
                  </span>
                  <span className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wide">
                    HIGH PRIORITY
                  </span>
                </div>

                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  QA Bug Report: Login Validation Error
                </h3>

                <div className="space-y-2 text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  <p>"Regression failure: username with leading space ' user' was accepted by validator."</p>
                  <p>"Regression failure: username with leading space ' user' was accepted by validator."</p>
                  <p>"Regression failure: username with leading space ' user' was accepted by validator."</p>
                </div>
              </div>
            )}

            {/* Tab 2: Slack War Room */}
            {contextTab === 'slack' && (
              <div className="flex flex-col h-full justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="text-xs font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5 border-b border-[#E2E8F0] dark:border-[#1E293B] pb-2">
                    <span className="text-[#64748B] font-mono text-sm">#</span>
                    <span>war-room-incident-response</span>
                  </div>

                  <div className="space-y-3">
                    {slackMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-3 rounded-lg bg-[#F8FAFC] dark:bg-[#1E293B]/40 border border-[#E2E8F0] dark:border-[#1E293B] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#0F172A] dark:text-white">{msg.author}</span>
                          <span className="text-[10px] text-[#94A3B8] font-mono">{msg.time}</span>
                        </div>
                        <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">{msg.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Slack Chat Input Box */}
                <form onSubmit={handleSendSlack} className="relative pt-2">
                  <input
                    value={slackInput}
                    onChange={(e) => setSlackInput(e.target.value)}
                    placeholder="Message #war-room..."
                    className="w-full h-10 pl-3.5 pr-10 border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#0B0F17] rounded-lg text-xs outline-none focus:border-[#2563EB]"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-4 p-1 text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* Tab 3: Manager Email Thread */}
            {contextTab === 'email' && (
              <div className="space-y-4">
                <div className="p-4 rounded-[12px] bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] dark:border-[#1E293B] pb-2">
                    <div>
                      <div className="font-bold text-xs text-[#0F172A] dark:text-white">Rahul Sharma</div>
                      <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Engineering Manager</div>
                    </div>
                    <span className="text-[10px] font-bold text-[#DC2626] bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 border border-[#FECACA] dark:border-[#991B1B]/40 px-2 py-0.5 rounded uppercase font-mono">
                      HIGH PRIORITY
                    </span>
                  </div>

                  <div className="text-xs font-bold text-[#0F172A] dark:text-white">
                    Login Validation Bug - Deployment Status
                  </div>

                  <div className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed space-y-2">
                    <p>
                      Hi, I noticed you're working on the login validation issue reported by QA. We're planning
                      today's deployment shortly, and Product is asking whether this fix can be included. Before I
                      respond to them, could you let me know:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-[#475569] dark:text-[#94A3B8]">
                      <li>Have you identified the root cause yet?</li>
                      <li>Do you think the fix will be ready for today's deployment?</li>
                      <li>Approximately how much more time do you need?</li>
                    </ul>
                    <p>
                      If you believe additional testing is required or that the fix should not be deployed today, let
                      me know so I can update the stakeholders accordingly.
                    </p>
                    <p className="pt-1 font-semibold text-[#0F172A] dark:text-white">
                      Thanks,
                      <br />
                      Rahul Sharma Engineering Manager
                    </p>
                  </div>
                </div>

                {/* Email Reply Form */}
                <div className="space-y-2 pt-1">
                  <label className="block text-xs font-bold text-[#0F172A] dark:text-white">
                    Reply to Engineering Manager
                  </label>
                  <textarea
                    rows={4}
                    value={emailReplyText}
                    onChange={(e) => setEmailReplyText(e.target.value)}
                    placeholder="e.g. Root cause identified in validation logic. Fix implemented and passed regression test suite. Ready for deployment."
                    disabled={emailSentSuccess || isSendingEmail}
                    className="w-full p-3 rounded-lg bg-white dark:bg-[#0B0F17] border border-[#CBD5E1] dark:border-[#334155] text-xs font-sans text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] focus:border-[#2563EB] outline-none resize-none shadow-2xs"
                  />
                  <button
                    onClick={handleSendEmailReply}
                    disabled={!emailReplyText.trim() || isSendingEmail || emailSentSuccess}
                    className="w-full h-10 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{emailSentSuccess ? '✓ Email Reply Sent' : 'Send Email Reply'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ────────────────── HOTFIX SIGNOFF & RELEASE STRATEGY MODAL ────────────────── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-[#0F172A] dark:text-[#F8FAFC]">
            {/* Modal Header */}
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#0F172A] dark:text-white">
                  Hotfix Sign-Off &amp; Release Strategy
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Confirm automated verifications and select deployment strategy
                </p>
              </div>
            </div>

            {/* Verification Status Card */}
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#1E293B]/40 border border-[#E2E8F0] dark:border-[#1E293B] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Target Patch File:</span>
                <span className="font-mono font-bold text-[#2563EB] dark:text-[#60A5FA]">{defaultFile}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Automated Diagnostic Tests:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {testResults ? `${testResults.filter((r) => r.passed).length}/${testResults.length} Passed` : 'Passed'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#64748B] dark:text-[#94A3B8]">Manager Email Status:</span>
                <span
                  className={
                    emailReplyText.trim()
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-[#64748B]'
                  }
                >
                  {emailReplyText.trim() ? 'Reply Sent' : 'Optional (skipped)'}
                </span>
              </div>
            </div>

            {/* Candidate Deployment Decision */}
            <div className="space-y-2">
              <label className="block font-bold text-xs text-[#0F172A] dark:text-white">
                Deployment Strategy &amp; Confidence Sign-Off
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeploymentDecision('PEER_REVIEW')}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 cursor-pointer ${
                    deploymentDecision === 'PEER_REVIEW'
                      ? 'bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border-[#2563EB] text-[#0F172A] dark:text-white ring-1 ring-[#2563EB]'
                      : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-[#2563EB] dark:text-[#60A5FA]">
                    <Users className="w-4 h-4" />
                    <span>Peer Review &amp; Staging</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-snug">
                    Request Tech Lead review before production rollout.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setDeploymentDecision('DIRECT_PROD')}
                  className={`p-3 rounded-xl border text-left transition-all space-y-1 cursor-pointer ${
                    deploymentDecision === 'DIRECT_PROD'
                      ? 'bg-[#ECFDF5] dark:bg-[#064E3B]/30 border-emerald-500 text-[#0F172A] dark:text-white ring-1 ring-emerald-500'
                      : 'bg-white dark:bg-[#111827] border-[#E2E8F0] dark:border-[#1E293B] text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    <Rocket className="w-4 h-4" />
                    <span>Direct Hotfix to Prod</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-snug">
                    Deploy patch directly to production immediately.
                  </p>
                </button>
              </div>
            </div>

            {/* Remediation Summary */}
            <div className="space-y-1.5">
              <label className="block font-bold text-xs text-[#0F172A] dark:text-white">
                Handoff &amp; Remediation Notes
              </label>
              <textarea
                rows={3}
                value={remediationSummary}
                onChange={(e) => setRemediationSummary(e.target.value)}
                placeholder="Briefly state root cause, why the patch resolves it, and monitoring steps..."
                className="w-full bg-white dark:bg-[#0B0F17] border border-[#CBD5E1] dark:border-[#334155] rounded-xl p-3 text-xs text-[#0F172A] dark:text-white placeholder:text-[#94A3B8] outline-none focus:border-[#2563EB] resize-none shadow-2xs"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
              >
                Back to Editor
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Authorize &amp; Finalize Hotfix</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Manager Email Arrival Toast Notification */}
      {showEmailToast && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 p-4 bg-white dark:bg-[#1E293B] border border-rose-500/50 rounded-2xl shadow-2xl flex items-start gap-3.5 max-w-sm font-sans animate-cd-fade-in"
        >
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-500 dark:text-rose-400 shrink-0 border border-rose-200 dark:border-rose-900">
            <Mail className="w-5 h-5" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-xs font-bold text-[#0F172A] dark:text-white flex items-center justify-between">
              <span>New Manager Email</span>
              <button
                onClick={() => setShowEmailToast(false)}
                className="text-[#64748B] hover:text-[#0F172A] dark:hover:text-white p-0.5 rounded cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
              {scenario?.managerEmail?.fromName || 'Engineering Manager'} sent an urgent status inquiry regarding your bug investigation and ETA.
            </p>
            <button
              onClick={() => {
                setContextTab('email');
                setHasUnreadManagerEmail(false);
                setShowEmailToast(false);
              }}
              className="text-[11px] font-bold text-[#2563EB] dark:text-[#60A5FA] hover:underline inline-flex items-center gap-1 pt-1 cursor-pointer"
            >
              <span>Open Email Tab</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

