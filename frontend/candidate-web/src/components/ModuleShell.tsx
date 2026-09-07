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
import { Moon, Sun } from 'lucide-react';

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
  const transitionTo = useSessionStore(s => s.transitionTo);
  const { theme, toggle } = useTheme();
  const { fullscreenExited, setFullscreenExited } = useFunctionalNudge();
  const [networkDisconnected, setNetworkDisconnected] = React.useState(false);

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
      {fullscreenExited && (
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

      {/* Top Navbar (80px) */}
      <header className="h-20 px-6 border-b border-[#E2E8F0] dark:border-[var(--border)] bg-white dark:bg-[#0f1115] flex items-center justify-between flex-shrink-0 z-20 select-none">
        {/* Left Side: Brand Logo, Module Title, Question Badge */}
        <div className="flex items-center">
          <div className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[#0F172A] dark:text-white">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2F65F6] to-[#7F30FF] flex items-center justify-center text-white text-xs font-black shadow-2xs">
              P
            </div>
            <span>Proctora</span>
          </div>

          <div className="h-6 w-px bg-[#E2E8F0] dark:bg-[var(--border)] mx-4" />

          <div className="font-bold text-sm text-[#2F65F6] tracking-tight">
            {currentModule?.name ?? `Module ${moduleIndex + 1}`}
          </div>

          <div className="h-6 w-px bg-[#E2E8F0] dark:bg-[var(--border)] mx-4" />

          {currentModule && (
            <div className="bg-[#F8FAFC] dark:bg-[var(--surface)] border border-[#E2E8F0] dark:border-[var(--border)] rounded-[4px] px-3 py-1 text-xs font-mono font-medium text-[#475569] dark:text-slate-400">
              Q{currentQuestionIndex + 1} of {questions.length}
            </div>
          )}
        </div>

        {/* Right Side: Proctoring Preview, Timer, Theme Toggle, Review & Submit */}
        <div className="flex items-center gap-3">
          <ProctoringIndicator cvMode={cvMode} />
          <Timer />

          <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="p-2 rounded-lg bg-[#F8FAFC] dark:bg-[var(--surface)] border border-[#E2E8F0] dark:border-[var(--border)] text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white transition-colors cursor-pointer"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>

          <button
            onClick={handleSubmitAssessment}
            className="bg-[#2F65F6] hover:bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            aria-label="Review and submit assessment"
          >
            Review &amp; Submit
          </button>
        </div>
      </header>

      {/* Dedicated Tabs Bar (45px) */}
      <nav aria-label="Assessment Module Tabs" className="h-[45px] bg-white dark:bg-[#0f1115] border-b border-[#E2E8F0] dark:border-[var(--border)] px-6 flex items-center gap-2 overflow-x-auto flex-shrink-0 select-none z-10">
        {activeModules.map((mod, i) => {
          const isActive = i === moduleIndex;
          return (
            <button
              key={i}
              onClick={() => transitionTo({ type: 'assessment', moduleIndex: i, sessionId: assessment?.sessionId ?? '' })}
              aria-label={`Go to ${mod.name}`}
              aria-current={isActive ? 'page' : undefined}
              className={`
                px-4 py-1.5 text-xs transition-all cursor-pointer whitespace-nowrap
                ${isActive
                  ? 'border-2 border-[#2F65F6] text-[#2F65F6] bg-white dark:bg-[var(--surface)] font-semibold rounded-full shadow-2xs'
                  : 'text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-[var(--surface)] font-medium rounded-md'
                }
              `}
            >
              {mod.name}
            </button>
          );
        })}
      </nav>

      {/* Workspace Split (Question Navigator + Problem + Editor/Console) */}
      <div className="flex flex-1 overflow-hidden bg-[#F8FAFC] dark:bg-[var(--bg)]">
        {/* Left Column: Question Palette (~320px) */}
        <aside
          className="w-80 flex-shrink-0 border-r border-[#E2E8F0] dark:border-[var(--border)] bg-white dark:bg-[var(--surface)] overflow-y-auto hidden lg:block"
          aria-label="Question navigation sidebar"
        >
          <QuestionPalette
            questions={questions}
            moduleIndex={moduleIndex}
            currentQuestionIndex={currentQuestionIndex}
            onNavigate={onNavigate}
          />
        </aside>

        {/* Main Workspace Column */}
        <main className="flex-1 h-full flex flex-col min-h-0 overflow-hidden" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
