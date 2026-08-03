import React, { useState, useEffect } from 'react'
import {
  Bug,
  Send,
  AlertCircle,
  Sparkles,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Users,
  GitBranch,
  Server,
  Database,
  Check,
  AlertTriangle,
} from 'lucide-react'

interface InitialSayStepProps {
  scenarioTitle: string
  scenarioDescription: string
  prompt?: string
  onSubmit: (initialSayText: string) => Promise<void>
}

export function InitialSayStep({
  scenarioTitle,
  scenarioDescription,
  onSubmit,
}: InitialSayStepProps) {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Deployment Countdown Timer (starts at 1h 43m 12s = 6192 seconds)
  const [countdown, setCountdown] = useState(6192)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTimer = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    setIsSubmitting(true)
    setError(null)
    try {
      await onSubmit(text.trim())
    } catch (err: any) {
      setError(err?.message || 'Failed to submit initial plan')
      setIsSubmitting(false)
    }
  }

  const teamMembers = [
    { name: 'Sarah Jenkins', role: 'QA Lead', status: 'Active in War Room', avatarBg: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' },
    { name: 'Alex Rivera', role: 'Senior Tech Lead', status: 'Reviewing Diff', avatarBg: 'bg-purple-500/20 text-purple-500 border-purple-500/30' },
    { name: 'Michael Chen', role: 'Product Manager', status: 'Awaiting ETA', avatarBg: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
    { name: 'Priya Patel', role: 'Engineering Manager', status: 'Escalation Watch', avatarBg: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
  ]

  const timelineEvents = [
    { time: '09:14', text: 'QA reported issue' },
    { time: '09:32', text: 'Developer assigned' },
    { time: '09:48', text: 'Regression confirmed' },
    { time: '10:05', text: 'Product requested ETA' },
    { time: '10:11', text: 'Simulation started' },
  ]

  const objectives = [
    'Investigate issue',
    'Verify reproduction',
    'Implement fix',
    'Validate solution',
    'Communicate deployment readiness',
  ]

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6 pb-20 text-[var(--text-primary)] font-sans">
      {/* Persistent Deployment Pressure Status Bar */}
      <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-primary)]">
            Incident Briefing &amp; Strategy Phase
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--text-secondary)] bg-[var(--background)] px-3 py-1 rounded-lg border border-[var(--border)]">
          <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>Window Remaining: {formatTimer(countdown)}</span>
        </div>
      </div>

      {/* Main Incident Briefing Header */}
      <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/20">
                  P1 INCIDENT
                </span>
                <span className="text-xs font-mono text-[var(--text-secondary)]">ID: INC-2026-0891</span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)] mt-1">
                {scenarioTitle}
              </h1>
            </div>
          </div>
        </div>

        {/* Environment Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--background)] p-3 rounded-xl border border-[var(--border)] font-mono text-xs">
          <div>
            <span className="text-[10px] text-[var(--text-secondary)] uppercase block font-semibold">Repository</span>
            <span className="font-bold text-[var(--accent)]">cdrecruit/login-service</span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-secondary)] uppercase block font-semibold">Service</span>
            <span className="font-bold text-[var(--text-primary)]">Authentication API</span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-secondary)] uppercase block font-semibold">Environment</span>
            <span className="font-bold text-[var(--text-primary)]">Staging Sandbox</span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-secondary)] uppercase block font-semibold">Deployment ETA</span>
            <span className="font-bold text-[var(--text-primary)]">1h 43m</span>
          </div>
        </div>

        <p className="text-xs text-[var(--text-primary)] leading-relaxed bg-[var(--background)] p-4 rounded-xl border border-[var(--border)] whitespace-pre-wrap font-sans">
          {scenarioDescription}
        </p>
      </div>

      {/* SAY Phase Strategy Form */}
      <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-5">
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>Investigation &amp; Remediation Strategy</span>
          </label>
          <p className="text-xs text-[var(--text-secondary)]">
            Explain your initial investigation approach, potential risk areas, and plan of action before accessing the workspace repository.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I will inspect login_validation.py, check for missing leading/trailing space checks, verify regex boundary rules against reproduction cases, and run regression diagnostics before deployment."
          rows={5}
          disabled={isSubmitting}
          className="w-full p-4 rounded-xl bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-xs font-sans placeholder-[var(--text-secondary)]/50 resize-y leading-relaxed"
        />

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[var(--text-secondary)] font-mono">
            {text.trim().length} characters typed
          </span>
          <button
            type="submit"
            disabled={!text.trim() || isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:opacity-90 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Submit Strategy &amp; Enter Workspace</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
