import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Send,
  AlertCircle,
  HelpCircle,
  GitBranch,
  ArrowRight,
  ArrowLeft,
  Sun,
  Moon,
  Clock,
  Sparkles,
  Info,
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
  moduleIndex = 0,
  activeModules = ['SIMULATION'],
  onNavigateModule,
  onSubmit,
}: InitialSayStepProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = scenario?.title || scenarioTitle || 'QA Bug Report: Login Validation Error';
  const description = scenario?.description || scenarioDescription || 'Investigate the issue, implement a fix, and verify that existing functionality is not affected.';
  const sayPrompt = scenario?.initialSayPrompt || prompt || 'What would you do to solve this issue?';
  const repoName = scenario?.terminalInfo?.repository || 'cdrecruit/service';
  const ticketId = scenario?.jiraTicket?.ticketId || 'INCIDENT-101';

  // Countdown timer
  const [countdown, setCountdown] = useState(6192);

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
    <div className="h-full w-full bg-[var(--background)] text-[var(--foreground)] flex flex-col font-sans transition-colors duration-200 overflow-hidden">
      {/* ────────────────── TOP NAVIGATION HEADER ────────────────── */}
      <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] px-6 flex items-center justify-between shrink-0 shadow-xs">
        {/* Left: Section Indicator & Nav Buttons */}
        <div className="flex items-center gap-3">
          {isPrevAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous Section</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 font-mono">
              Section {moduleIndex + 1} of {activeModules.length}
            </span>
            <span className="text-xs font-bold text-[var(--foreground)]">
              Contextual Engineering Simulation
            </span>
          </div>
        </div>

        {/* Right: Theme Toggle, Countdown & Next Section */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
            <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>{formatTimer(countdown)}</span>
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-warning" />}
          </button>

          {isNextAvailable && onNavigateModule && (
            <button
              onClick={() => onNavigateModule(moduleIndex + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
            >
              <span>Next Section</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* ────────────────── MAIN BRIEFING & STRATEGY CONTAINER ────────────────── */}
      <main className="flex-1 overflow-y-auto py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Card 1: Incident Scenario Overview */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 uppercase">
                      P1 INCIDENT BRIEFING
                    </span>
                    <span className="text-xs font-mono text-[var(--muted-foreground)]">
                      {ticketId}
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold text-[var(--foreground)] mt-1">
                    {title}
                  </h1>
                </div>
              </div>

              {/* Repo Tag */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs font-mono text-[var(--accent)]">
                <GitBranch className="w-3.5 h-3.5" />
                <span>{repoName}</span>
              </div>
            </div>

            {/* Scenario Description */}
            <p className="text-xs sm:text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
              {description}
            </p>
          </div>

          {/* Card 2: How Context Simulation Works (3-Step Guide) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-[var(--accent)]" />
              <span>How This Simulation Works</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-[var(--accent)]">
                  <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-[11px] font-mono">1</span>
                  <span>1. Formulate Strategy</span>
                </div>
                <p className="text-[var(--muted-foreground)] text-[11px] leading-relaxed">
                  Read the scenario and answer the investigation question below (evaluated for your SAY score).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-[var(--accent)]">
                  <span className="w-5 h-5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center text-[11px] font-mono">2</span>
                  <span>2. Live Workstation</span>
                </div>
                <p className="text-[var(--muted-foreground)] text-[11px] leading-relaxed">
                  Enter an interactive IDE. Inspect repository files, check Slack/Jira/Email, and edit code.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[11px] font-mono">3</span>
                  <span>3. Test &amp; Sign Off</span>
                </div>
                <p className="text-[var(--muted-foreground)] text-[11px] leading-relaxed">
                  Run automated diagnostics against your patch, select deployment strategy, and submit hotfix.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: The SAY Strategy Form */}
          <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                <HelpCircle className="w-4 h-4 text-[var(--accent)]" />
                <span>Initial Investigation Strategy (SAY)</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                <p className="text-xs font-semibold text-[var(--accent)] leading-relaxed">
                  "{sayPrompt}"
                </p>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                  Describe your initial thought process, likely root cause, and how you intend to verify the fix in the workstation.
                </p>
              </div>
            </div>

            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 1. I will inspect the validation logic in the target file to see how input characters are sanitized.&#10;2. Check for missing boundary validation for whitespace.&#10;3. Run the automated diagnostic test cases to ensure no regressions..."
              className="w-full p-3.5 rounded-xl bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-xs font-mono placeholder:text-[var(--muted-foreground)] resize-y leading-relaxed shadow-xs"
              required
            />

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-[var(--muted-foreground)]">
                {text.trim().length} characters entered
              </span>

              <button
                type="submit"
                disabled={!text.trim() || isSubmitting}
                className="flex items-center gap-2 bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
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
