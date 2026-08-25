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
    <div className="min-h-screen w-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-200">
      
      {/* ────────────────── TOP NAVIGATION HEADER ────────────────── */}
      <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between shrink-0 shadow-xs">
        
        {/* Left: Section Indicator & Nav Buttons */}
        <div className="flex items-center gap-3">
          {isPrevAvailable && (
            <button
              onClick={() => onNavigateModule(moduleIndex - 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous Section</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-accent/10 text-accent border border-accent/20 font-mono">
              Section {moduleIndex + 1} of {activeModules.length}
            </span>
            <span className="text-xs font-bold text-foreground">
              Contextual Engineering Simulation
            </span>
          </div>
        </div>

        {/* Right: Theme Toggle & Next Section (if applicable) */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-border bg-background text-foreground hover:bg-surface transition-colors cursor-pointer"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-warning" />}
          </button>

          {isNextAvailable && (
            <button
              onClick={() => onNavigateModule(moduleIndex + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
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
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 uppercase">
                      P1 INCIDENT BRIEFING
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {scenario.jiraTicket?.ticketId || 'INCIDENT-101'}
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold text-foreground mt-1">
                    {scenario.title}
                  </h1>
                </div>
              </div>

              {/* Repo Tag */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-mono text-accent">
                <GitBranch className="w-3.5 h-3.5" />
                <span>{scenario.terminalInfo?.repository || 'cdrecruit/service'}</span>
              </div>
            </div>

            {/* Scenario Description */}
            <p className="text-xs sm:text-sm text-foreground leading-relaxed">
              {scenario.description}
            </p>
          </div>

          {/* Card 2: How Context Simulation Works (3-Step Guide) */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-accent" />
              <span>How This Simulation Works</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-background border border-border space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-accent">
                  <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[11px] font-mono">1</span>
                  <span>1. Formulate Strategy</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Read the scenario and answer the investigation question below (evaluated for your SAY score).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-background border border-border space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-accent">
                  <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[11px] font-mono">2</span>
                  <span>2. Live Workstation</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Enter an interactive VS Code IDE. Inspect repository files, check Slack/Jira/Email, and edit code.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-background border border-border space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[11px] font-mono">3</span>
                  <span>3. Test &amp; Sign Off</span>
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Run automated diagnostics against your patch, select deployment strategy, and submit hotfix.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: The SAY Strategy Form */}
          <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <HelpCircle className="w-4 h-4 text-accent" />
                <span>Initial Investigation Strategy (SAY)</span>
              </div>
              
              <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/20">
                <p className="text-xs font-semibold text-accent leading-relaxed">
                  "{sayPrompt}"
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Describe your initial thought process, likely root cause, and how you intend to verify the fix in the workstation.
                </p>
              </div>
            </div>

            <textarea
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 1. I will inspect the validation logic in the target file to see how input characters are sanitized.&#10;2. Check for missing boundary validation for whitespace.&#10;3. Run the automated diagnostic test cases to ensure no regressions..."
              className="w-full p-3.5 rounded-xl bg-background text-foreground border border-border focus:border-accent focus:outline-none text-xs font-mono placeholder-muted-foreground resize-y leading-relaxed shadow-xs"
              required
            />

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-muted-foreground">
                {text.trim().length} characters entered
              </span>

              <button
                type="submit"
                disabled={!text.trim() || isSubmitting}
                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
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
