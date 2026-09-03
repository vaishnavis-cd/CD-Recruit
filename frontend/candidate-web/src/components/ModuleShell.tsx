import React, { useEffect, useCallback } from 'react';
import { Timer, TimerWarningBanner } from './Timer';
import { QuestionPalette } from './QuestionPalette';
import { ProctoringIndicator } from './ProctoringIndicator';
import { useSessionStore } from '../store/sessionMachine';
import { services } from '../services';
import { MODULES } from '../fixtures/questions';
import { getEffectiveModuleType } from '../utils/moduleType';
import { useTheme } from '../theme/ThemeProvider';
import { ProctoringModule } from '../proctoring/proctoring.module';
import { Moon, Sun, RotateCcw } from 'lucide-react';

import { WatermarkOverlay } from './common/WatermarkOverlay';
import { IntegrityAlertBanner } from './common/IntegrityAlertBanner';
import { ProctoringEventModal } from './common/ProctoringEventModal';
import { useIntegrityEvents } from '../hooks/useIntegrityEvents';

interface ModuleShellProps {
  moduleIndex: number;
  questions: Array<{ id: string; label: string }>;
  currentQuestionIndex: number;
  onNavigate: (index: number) => void;
  children: React.ReactNode;
}

// Two distinct named functions for silent vs visible integrity signaling (spec rule)
function reportSilentSignal(kind: 'tab-switch' | 'window-blur' | 'paste-anomaly') {
  services.sessionApi.reportIntegritySignal({
    kind,
    category: 'silent',
    timestamp: new Date(services.time.getServerNow()).toISOString(),
  }).catch(() => {}); // fire-and-forget, never show to candidate
}

// Moved to its own file to satisfy React Fast Refresh (no mixed hook+component exports)
function useFunctionalNudge() {
  const [fullscreenExited, setFullscreenExited] = React.useState(false);

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        setFullscreenExited(true);
        services.sessionApi.reportIntegritySignal({
          kind: 'fullscreen-exit',
          category: 'functional',
          timestamp: new Date(services.time.getServerNow()).toISOString(),
        }).catch(() => {});
      } else {
        setFullscreenExited(false);
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  return { fullscreenExited, setFullscreenExited };
}

export function ModuleShell({ moduleIndex, questions, currentQuestionIndex, onNavigate, children }: ModuleShellProps) {
  const { alerts, dismissAlert } = useIntegrityEvents();
  const cvMode = useSessionStore(s => s.cvMode);
  const setQuestionStatus = useSessionStore(s => s.setQuestionStatus);
  const assessment = useSessionStore(s => s.assessment);
  const inviteToken = useSessionStore(s => s.inviteToken);
  const session = useSessionStore(s => s.session);
  const transitionTo = useSessionStore(s => s.transitionTo);
  const { theme, toggle } = useTheme();
  const { fullscreenExited, setFullscreenExited } = useFunctionalNudge();
  const [networkDisconnected, setNetworkDisconnected] = React.useState(false);

  // [DEMO-UNLIMITED-SESSION: TEMPORARY DEV HOOK]
  const isUnlimitedDemo =
    (assessment && assessment.totalSeconds >= 86400 * 30) ||
    inviteToken === 'demo' ||
    inviteToken?.startsWith('demo') ||
    inviteToken?.startsWith('unlimited-') ||
    (session as any)?.durationMinutes >= 999999;

  const handleResetDemoState = () => {
    if (confirm('Reset demo state? This will clear local responses and reload fresh questions for UI development.')) {
      localStorage.removeItem('cd-recruit-assessment-state');
      localStorage.removeItem('cd-recruit-session');
      localStorage.removeItem('cd-recruit-autosave');
      window.location.reload();
    }
  };

  const activeModules = React.useMemo(() => {
    if (!assessment?.questions || assessment.questions.length === 0) {
      return MODULES;
    }
    const MODULE_NAME_MAP: Record<string, { id: string; name: string }> = {
      MCQ: { id: 'mcq', name: 'MCQ' },
      SQL: { id: 'sql', name: 'SQL' },
      NOSQL: { id: 'nosql', name: 'NoSQL' },
      CODING: { id: 'coding', name: 'Coding' },
      DEBUGGING: { id: 'debugging', name: 'Debugging' },
      AI_PROMPTING: { id: 'prompting', name: 'AI Prompting' },
      SIMULATION: { id: 'simulation', name: 'Contextual Simulation' },
      CONTEXTUAL: { id: 'simulation', name: 'Contextual Simulation' },
      TEST_SCENARIOS: { id: 'test_scenarios', name: 'Test Scenarios' },
    };
    const types: string[] = [];
    for (const q of assessment.questions) {
      const type = getEffectiveModuleType(q);
      if (type && !types.includes(type)) {
        types.push(type);
      }
    }
    if (types.length === 0) return MODULES;
    return types.map((t) => MODULE_NAME_MAP[t] || { id: t.toLowerCase(), name: t });
  }, [assessment?.questions]);

  const currentModule = activeModules[moduleIndex] || activeModules[0];
  const currentQuestion = questions[currentQuestionIndex];

  // STEP 1: Start ProctoringModule when assessment session is active
  useEffect(() => {
    const sessionId = assessment?.sessionId;
    if (!sessionId) {
      console.warn('[ModuleShell] STEP 1: sessionId is undefined, skipping ProctoringModule.start()');
      return;
    }

    console.log(`[ModuleShell] STEP 1: Active assessment session detected: ${sessionId}. Starting ProctoringModule...`);
    ProctoringModule.getInstance()
      .start(sessionId)
      .then((started) => {
        console.log(`[ModuleShell] STEP 1: ProctoringModule.start() returned: ${started}`);
      })
      .catch((err) => {
        console.error('[ModuleShell] STEP 1: Exception thrown in ProctoringModule.start():', err);
      });

    // ProctoringModule is a global singleton for the assessment session.
    // Switching question tabs within the same session must NOT tear down the camera/proctoring pipeline.
  }, [assessment?.sessionId]);

  // Silent integrity signals — no UI reaction per spec
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) reportSilentSignal('tab-switch');
    }
    function onBlur() {
      reportSilentSignal('window-blur');
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Keyboard: F to flag/unflag
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'f' || e.key === 'F') {
        if (!currentQuestion) return;
        const activeEl = document.activeElement;
        // Don't fire when typing in a textarea/input/monaco
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || (activeEl as HTMLElement).contentEditable === 'true')) return;

        const current = assessment?.questionStatus[currentQuestion.id] ?? 'unvisited';
        setQuestionStatus(currentQuestion.id, current === 'flagged' ? 'answered' : 'flagged');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentQuestion, assessment, setQuestionStatus]);

  const handleSubmitAssessment = useCallback(() => {
    if (!assessment) return;
    transitionTo({ type: 'pre-submit-review', sessionId: assessment.sessionId });
  }, [assessment, transitionTo]);

  return (
    <div className="flex flex-col h-screen bg-[var(--bg)] overflow-hidden relative">
      <WatermarkOverlay />
      <ProctoringEventModal />
      <IntegrityAlertBanner alerts={alerts} onDismiss={dismissAlert} />

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
      {fullscreenExited && !isUnlimitedDemo && (
        <div
          role="status"
          aria-live="polite"
          className="w-full bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-3"
        >
          <span>Please return to fullscreen to continue</span>
          <button
            onClick={() => {
              document.documentElement.requestFullscreen?.().then(() => setFullscreenExited(false)).catch(() => {});
            }}
            className="underline font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
          >
            Re-enter fullscreen
          </button>
        </div>
      )}

      {/* Top bar with 3-part layout: Left Branding, Center Camera & Timer, Right Actions */}
      <header className="relative flex items-center justify-between px-6 py-2.5 border-b border-line dark:border-slate-800 bg-white dark:bg-[#111827] flex-shrink-0">
        {/* Left Branding & Active Module Info */}
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-ink dark:text-white">
            Proctora
          </span>
          <div className="h-4 w-px bg-line dark:bg-slate-700" />
          <span className="text-sm font-bold text-brand">
            {currentModule?.name ?? `Module ${moduleIndex + 1}`}
          </span>
          {currentModule && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
              Q{currentQuestionIndex + 1} of {questions.length}
            </span>
          )}
        </div>

        {/* Center Live Camera & Countdown Timer */}
        <div className="flex items-center gap-3">
          <ProctoringIndicator cvMode={cvMode} />
          <Timer />
        </div>

        {/* Right Actions: Theme toggle & Review & Submit */}
        <div className="flex items-center gap-3">
          {isUnlimitedDemo && (
            <button
              onClick={handleResetDemoState}
              title="Reset / Demolish Demo Answers and Reload Fresh Questions"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            >
              <RotateCcw size={13} />
              <span>Reset State</span>
            </button>
          )}

          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="w-9 h-9 rounded-full border border-line dark:border-slate-700 flex items-center justify-center text-ink-secondary dark:text-slate-300 hover:text-ink dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          <button
            onClick={handleSubmitAssessment}
            className="bg-brand hover:bg-brand-hover text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
            aria-label="Review and submit assessment"
          >
            Review &amp; Submit
          </button>
        </div>
      </header>

      {/* Module sub-navigation tabs bar */}
      <div className="px-6 py-2.5 bg-white dark:bg-[#111827] border-b border-line dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
        {activeModules.map((mod, i) => {
          const isActive = i === moduleIndex;
          return (
            <button
              key={i}
              onClick={() => transitionTo({ type: 'assessment', moduleIndex: i, sessionId: assessment?.sessionId ?? '' })}
              aria-label={`Go to ${mod.name}`}
              aria-current={isActive ? 'page' : undefined}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-white dark:bg-[#1e293b] border-2 border-brand text-brand shadow-xs font-bold'
                  : 'text-ink-secondary dark:text-slate-400 hover:text-ink dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-850 border border-transparent'
              }`}
            >
              {mod.name}
            </button>
          );
        })}
      </div>

      {/* Main content + sidebar */}
      <div className="flex flex-1 overflow-hidden bg-canvas dark:bg-[#0B0F19]">
        {/* Sidebar: Question palette */}
        <aside
          className="w-60 flex-shrink-0 border-r border-line dark:border-slate-800 bg-white dark:bg-[#111827] overflow-y-auto hidden lg:block"
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
        <main className="flex-1 h-full flex flex-col min-h-0 overflow-hidden bg-canvas dark:bg-[#0B0F19]" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
