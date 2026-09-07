import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  HelpCircle,
  GitFork,
  ArrowRight,
  ArrowLeft,
  Sun,
  Moon,
  Clock,
  Info,
  AlertCircle,
} from 'lucide-react';
import { useTheme } from '../../../theme/ThemeProvider';

interface InitialSayStepProps {
  scenario?: any;
  scenarioTitle?: string;
  scenarioDescription?: string;
  prompt?: string;
  moduleIndex?: number;
  activeModules?: string[];
  onNavigateModule?: (idx: number) => void;
  onSubmit: (initialSayText: string) => Promise<void>;
}

export function InitialSayStep({
  scenario,
  scenarioTitle,
  scenarioDescription,
  prompt,
  moduleIndex = 5,
  activeModules = ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS'],
  onNavigateModule,
  onSubmit,
}: InitialSayStepProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = scenario?.title || scenarioTitle || 'QA Bug Report: Login Validation Error';
  const description =
    scenario?.description ||
    scenarioDescription ||
    'During regression testing, QA discovered that login validation incorrectly accepts usernames with leading or trailing spaces. The issue has been reproduced consistently and marked as High Priority. Investigate the issue, implement a fix and verify that existing functionality is not affected.';
  const sayPrompt = scenario?.initialSayPrompt || prompt || 'What would you do to solve this issue?';
  const repoName = scenario?.terminalInfo?.repository || 'cdrecruit/auth-service';
  const ticketId = scenario?.jiraTicket?.ticketId || 'BUG-3124';

  // Countdown timer
  const [countdown, setCountdown] = useState(6177);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(text.trim());
    } catch (err: any) {
      setError(err?.message || 'Failed to submit initial plan');
      setIsSubmitting(false);
    }
  };

  const isPrevAvailable = moduleIndex > 0;
  const isNextAvailable = moduleIndex < activeModules.length - 1;

  return (
    <div className="h-full w-full bg-[#F8FAFC] dark:bg-[#0B0F17] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col font-sans overflow-hidden">
      {/* ────────────────── TOP NAVIGATION HEADER ────────────────── */}
      <header className="h-[60px] border-b border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#111827] px-6 sm:px-8 flex items-center justify-between shrink-0 shadow-2xs">
        {/* Left: Section Indicator & Nav Buttons */}
        <div className="flex items-center gap-3.5">
          {isPrevAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous Section</span>
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold px-3 py-1 rounded-md bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 text-[#2563EB] dark:text-[#60A5FA] border border-[#BFDBFE] dark:border-[#1E3A8A] font-mono">
              Section {moduleIndex + 1} of {activeModules.length}
            </span>
            <span className="text-[13px] font-bold text-[#0F172A] dark:text-white">
              Contextual Engineering Simulation
            </span>
          </div>
        </div>

        {/* Right: Theme Toggle, Countdown & Next Section */}
        <div className="flex items-center gap-3">
          {/* Red/Pink Countdown Timer Pill */}
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#DC2626] bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 px-3 py-1 rounded-md border border-[#FCA5A5] dark:border-[#991B1B]/50 shadow-2xs">
            <span>{formatTimer(countdown)}</span>
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-[#475569] dark:text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {isNextAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex + 1)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E293B] text-xs font-semibold text-[#334155] dark:text-[#CBD5E1] hover:bg-[#F1F5F9] dark:hover:bg-[#334155] transition-colors cursor-pointer"
            >
              <span>Next Section</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ────────────────── MAIN BRIEFING & STRATEGY CONTAINER ────────────────── */}
      <main className="flex-1 overflow-y-auto py-8 px-4 sm:px-6">
        <div className="max-w-[960px] mx-auto space-y-6">
          {/* Card 1: Incident Scenario Overview */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-[16px] p-7 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-[#FEF2F2] dark:bg-[#7F1D1D]/30 text-[#DC2626] dark:text-[#F87171] border border-[#FECACA] dark:border-[#991B1B]/40 uppercase tracking-wide">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626]" />
                  <span>P1 INCIDENT BRIEFING</span>
                </span>
                <span className="text-xs font-mono font-bold text-[#64748B] dark:text-[#94A3B8] ml-1">
                  {ticketId}
                </span>
              </div>

              {/* Repo Tag */}
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A8A]/20 border border-[#BFDBFE] dark:border-[#1E3A8A]/40 text-xs font-mono font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                <GitFork className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>{repoName}</span>
              </div>
            </div>

            {/* Scenario Title */}
            <h1 className="text-[20px] font-bold text-[#0F172A] dark:text-white tracking-tight">
              {title}
            </h1>

            {/* Scenario Description */}
            <p className="text-[13px] text-[#475569] dark:text-[#94A3B8] leading-relaxed">
              {description}
            </p>
          </div>

          {/* Card 2: How Context Simulation Works (3-Step Guide) */}
          <div className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-[16px] p-7 shadow-xs space-y-4">
            <h2 className="text-[11px] font-bold text-[#0F172A] dark:text-white uppercase tracking-wider flex items-center gap-2 font-mono">
              <Info className="w-4 h-4 text-[#2563EB]" />
              <span>HOW THIS SIMULATION WORKS</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
              {/* Step 1: Active Formulate Strategy */}
              <div className="p-4 rounded-[12px] bg-[#F8FAFC] dark:bg-[#1E293B]/40 border-2 border-[#2563EB] space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#2563EB] dark:text-[#60A5FA]">
                  <span className="w-5 h-5 rounded-full bg-[#EFF6FF] dark:bg-[#1E3A8A] text-[#2563EB] dark:text-[#93C5FD] flex items-center justify-center text-xs font-mono font-bold">
                    1
                  </span>
                  <span className="text-[12px]">1. Formulate Strategy</span>
                </div>
                <p className="text-[#64748B] dark:text-[#94A3B8] text-[11px] leading-relaxed">
                  Read the scenario and answer the investigation question below (evaluated for your SAY score).
                </p>
              </div>

              {/* Step 2: Live Workstation */}
              <div className="p-4 rounded-[12px] bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#0F172A] dark:text-white">
                  <span className="w-5 h-5 rounded-full bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center text-xs font-mono font-bold">
                    2
                  </span>
                  <span className="text-[12px]">2. Live Workstation</span>
                </div>
                <p className="text-[#64748B] dark:text-[#94A3B8] text-[11px] leading-relaxed">
                  Enter an interactive IDE. Inspect repository files, check Slack/Jira/Email, and edit code.
                </p>
              </div>

              {/* Step 3: Test & Sign Off */}
              <div className="p-4 rounded-[12px] bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#0F172A] dark:text-white">
                  <span className="w-5 h-5 rounded-full bg-[#F1F5F9] dark:bg-[#1E293B] text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center text-xs font-mono font-bold">
                    3
                  </span>
                  <span className="text-[12px]">3. Test &amp; Sign Off</span>
                </div>
                <p className="text-[#64748B] dark:text-[#94A3B8] text-[11px] leading-relaxed">
                  Run automated diagnostics against your patch, select deployment strategy, and submit hotfix.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: The SAY Strategy Form */}
          <form onSubmit={handleSubmit} className="bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#1E293B] rounded-[16px] p-7 shadow-xs space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#0F172A] dark:text-white">
                <HelpCircle className="w-4 h-4 text-[#2563EB]" />
                <span>Initial Investigation Strategy (SAY)</span>
              </div>

              <div className="p-4 rounded-[12px] bg-[#EFF6FF] dark:bg-[#1E3A8A]/20 border border-[#BFDBFE] dark:border-[#1E3A8A]/40 space-y-1">
                <p className="text-[13px] font-bold text-[#2563EB] dark:text-[#60A5FA] leading-snug">
                  "{sayPrompt}"
                </p>
                <p className="text-[12px] text-[#475569] dark:text-[#94A3B8]">
                  Describe your initial thought process, likely root cause, and how you intend to verify the fix in the workstation.
                </p>
              </div>
            </div>

            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 1. I will inspect the validation logic in the target file to see how input characters are sanitized.&#10;2. Check for missing boundary validation for whitespace.&#10;3. Run the automated diagnostic test cases to ensure no regressions..."
              className="w-full p-4 rounded-[10px] bg-white dark:bg-[#0B0F17] text-[#0F172A] dark:text-[#F8FAFC] border border-[#CBD5E1] dark:border-[#334155] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 outline-none text-[12px] font-mono placeholder:text-[#94A3B8] resize-y leading-relaxed shadow-2xs"
              required
            />

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] font-sans text-[#64748B] dark:text-[#94A3B8]">
                {text.length} characters entered
              </span>

              <button
                type="submit"
                disabled={!text.trim() || isSubmitting}
                className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-semibold px-6 h-[40px] rounded-lg shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>Submit Strategy &amp; Launch Workstation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

