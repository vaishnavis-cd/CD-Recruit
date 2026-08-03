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
    <div className="max-w-5xl mx-auto py-6 px-6 space-y-6 pb-20 text-[var(--text-primary)] font-sans">
      {/* Persistent Deployment Pressure Status Bar */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-500/15 via-amber-500/10 to-transparent border border-rose-500/30 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
          <span className="text-xs font-bold font-mono uppercase tracking-wider text-rose-600 dark:text-rose-400">
            DEPLOYMENT WINDOW ACTIVE — P1 INCIDENT IN PROGRESS
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-600 dark:text-amber-400 bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Deployment Window: {formatTimer(countdown)} Remaining</span>
        </div>
      </div>

      {/* Main Incident Briefing Header */}
      <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/15 text-rose-500 border border-rose-500/30 shadow-xs">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold font-mono uppercase bg-rose-500/20 text-rose-500 border border-rose-500/30">
                  P1 PRODUCTION INCIDENT
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  STATUS: DEPLOYMENT BLOCKED
                </span>
                <span className="text-xs font-mono text-[var(--text-secondary)]">ID: INC-2026-0891</span>
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] mt-1">
                {scenarioTitle}
              </h1>
            </div>
          </div>
        </div>

        {/* Technical Environment Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--background)] p-3.5 rounded-xl border border-[var(--border)] font-mono text-xs">
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
            <span className="font-bold text-emerald-500">Staging Sandbox</span>
          </div>
          <div>
            <span className="text-[10px] text-[var(--text-secondary)] uppercase block font-semibold">Deployment ETA</span>
            <span className="font-bold text-amber-500">1h 43m</span>
          </div>
        </div>

        <p className="text-xs text-[var(--text-primary)] leading-relaxed bg-[var(--background)] p-4 rounded-xl border border-[var(--border)] whitespace-pre-wrap font-sans">
          {scenarioDescription}
        </p>
      </div>

      {/* Incident Context Grid: Timeline, Team, Objectives */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Incident Timeline */}
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-[#2F5CFF] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#2F5CFF]" />
            <span>Incident Chronology</span>
          </h3>

          <div className="space-y-2 font-mono text-xs">
            {timelineEvents.map((evt, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                <span className="text-[10px] font-bold text-[var(--accent)]">{evt.time}</span>
                <span className="text-[11px] text-[var(--text-primary)] font-sans">{evt.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Assigned Team Members */}
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-purple-500 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" />
            <span>War Room Participants</span>
          </h3>

          <div className="space-y-2">
            {teamMembers.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-[var(--background)] border border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-[11px] border ${m.avatarBg}`}>
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block leading-tight">{m.name}</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{m.role}</span>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Incident Objectives */}
        <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-emerald-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Incident Objectives</span>
          </h3>

          <div className="space-y-2">
            {objectives.map((obj, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-primary)] font-sans">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{obj}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SAY Phase Strategy Form */}
      <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-5">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>Investigation &amp; Remediation Strategy</span>
          </label>
          <p className="text-xs text-[var(--text-secondary)]">
            Before accessing the repository, explain your investigation strategy, assumptions, risks, and validation plan.
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

        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-[var(--text-secondary)] font-mono">
            {text.trim().length} characters typed
          </span>
          <button
            type="submit"
            disabled={!text.trim() || isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Submit Strategy &amp; Enter Incident Workspace</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
