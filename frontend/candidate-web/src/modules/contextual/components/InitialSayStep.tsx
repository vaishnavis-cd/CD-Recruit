import React, { useState } from 'react'
import {
  ShieldAlert,
  Send,
  AlertCircle,
  HelpCircle,
  FileCode,
  Terminal,
  CheckCircle2,
  GitBranch,
  Laptop,
  ArrowRight,
  ArrowLeft,
  Sun,
  Moon,
  Clock,
  Sparkles,
  Info
} from 'lucide-react'
import { useTheme } from '../../../theme/ThemeProvider'

interface InitialSayStepProps {
  scenario: any
  moduleIndex: number
  activeModules: string[]
  onNavigateModule: (idx: number) => void
  onSubmit: (initialSayText: string) => Promise<void>
}

export function InitialSayStep({
  scenario,
  moduleIndex,
  activeModules,
  onNavigateModule,
  onSubmit,
}: InitialSayStepProps) {
  const { theme, toggle: toggleTheme } = useTheme()
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sayPrompt = scenario.initialSayPrompt || 'What would you do to solve this issue?'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      await onSubmit(text.trim())
    } catch (err: any) {
      setError(err?.message || 'Failed to submit strategy')
      setIsSubmitting(false)
    }
  }

  const isPrevAvailable = moduleIndex > 0
  const isNextAvailable = moduleIndex < activeModules.length - 1

  return (
    <div className="min-h-screen w-screen bg-slate-50 dark:bg-[#0d1117] text-slate-800 dark:text-[#c9d1d9] flex flex-col font-sans transition-colors duration-200">
      
      {/* ────────────────── TOP NAVIGATION HEADER ────────────────── */}
      <header className="h-14 border-b border-slate-200 dark:border-[#21262d] bg-white dark:bg-[#161b22] px-6 flex items-center justify-between shrink-0 shadow-xs">
        
        {/* Left: Section Indicator & Nav Buttons */}
        <div className="flex items-center gap-3">
          {isPrevAvailable && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#30363d] bg-slate-50 dark:bg-[#21262d] text-xs font-semibold text-slate-700 dark:text-[#c9d1d9] hover:bg-slate-100 dark:hover:bg-[#30363d] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous Section</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-[#58a6ff] border border-blue-200 dark:border-blue-800/40 font-mono">
              Section {moduleIndex + 1} of {activeModules.length}
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-[#e6edf3]">
              Contextual Engineering Simulation
            </span>
          </div>
        </div>

        {/* Right: Theme Toggle & Next Section (if applicable) */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#30363d] bg-slate-100 dark:bg-[#21262d] text-slate-600 dark:text-[#e6edf3] hover:bg-slate-200 dark:hover:bg-[#30363d] transition-colors"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>

          {isNextAvailable && (
            <button
              onClick={() => onNavigateModule(moduleIndex + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#30363d] bg-slate-50 dark:bg-[#21262d] text-xs font-semibold text-slate-700 dark:text-[#c9d1d9] hover:bg-slate-100 dark:hover:bg-[#30363d] transition-colors"
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
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-[#21262d] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40 uppercase">
                      P1 INCIDENT BRIEFING
                    </span>
                    <span className="text-xs font-mono text-slate-400 dark:text-[#8b949e]">
                      {scenario.jiraTicket?.ticketId || 'INCIDENT-101'}
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-[#e6edf3] mt-1">
                    {scenario.title}
                  </h1>
                </div>
              </div>

              {/* Repo Tag */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#21262d] border border-slate-200 dark:border-[#30363d] text-xs font-mono text-blue-600 dark:text-[#58a6ff]">
                <GitBranch className="w-3.5 h-3.5" />
                <span>{scenario.terminalInfo?.repository || 'cdrecruit/service'}</span>
              </div>
            </div>

            {/* Scenario Description */}
            <p className="text-xs sm:text-sm text-slate-700 dark:text-[#c9d1d9] leading-relaxed">
              {scenario.description}
            </p>
          </div>

          {/* Card 2: How Context Simulation Works (3-Step Guide) */}
          <div className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-slate-900 dark:text-[#e6edf3] uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
              <span>How This Simulation Works</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#21262d] space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-[#58a6ff]">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-[#58a6ff] flex items-center justify-center text-[11px] font-mono">1</span>
                  <span>1. Formulate Strategy</span>
                </div>
                <p className="text-slate-600 dark:text-[#8b949e] text-[11px] leading-relaxed">
                  Read the scenario and answer the investigation question below (evaluated for your SAY score).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#21262d] space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-[#58a6ff]">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-[#58a6ff] flex items-center justify-center text-[11px] font-mono">2</span>
                  <span>2. Live Workstation</span>
                </div>
                <p className="text-slate-600 dark:text-[#8b949e] text-[11px] leading-relaxed">
                  Enter an interactive VS Code IDE. Inspect repository files, check Slack/Jira/Email, and edit code.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#21262d] space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[11px] font-mono">3</span>
                  <span>3. Test &amp; Sign Off</span>
                </div>
                <p className="text-slate-600 dark:text-[#8b949e] text-[11px] leading-relaxed">
                  Run automated diagnostics against your patch, select deployment strategy, and submit hotfix.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: The SAY Strategy Form */}
          <form onSubmit={handleSubmit} className="bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl p-6 shadow-sm space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-[#e6edf3]">
                <HelpCircle className="w-4 h-4 text-blue-600 dark:text-[#58a6ff]" />
                <span>Initial Investigation Strategy (SAY)</span>
              </div>
              
              <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 leading-relaxed">
                  "{sayPrompt}"
                </p>
                <p className="text-[11px] text-slate-600 dark:text-[#8b949e] mt-1">
                  Describe your initial thought process, likely root cause, and how you intend to verify the fix in the workstation.
                </p>
              </div>
            </div>

            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 1. I will inspect the validation logic in the target file to see how input characters are sanitized.&#10;2. Check for missing boundary validation for whitespace.&#10;3. Run the automated diagnostic test cases to ensure no regressions..."
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#0d1117] text-slate-900 dark:text-[#e6edf3] border border-slate-200 dark:border-[#30363d] focus:border-blue-500 focus:outline-none text-xs font-mono placeholder-slate-400 dark:placeholder-[#484f58] resize-y leading-relaxed shadow-xs"
              required
            />

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-slate-400 dark:text-[#8b949e]">
                {text.trim().length} characters entered
              </span>

              <button
                type="submit"
                disabled={!text.trim() || isSubmitting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                <span>Submit Strategy &amp; Launch Workstation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

        </div>
      </main>
    </div>
  )
}
