import React, { useState } from 'react'
import { Bug, Send, AlertCircle, Sparkles } from 'lucide-react'

interface InitialSayStepProps {
  scenarioTitle: string
  scenarioDescription: string
  prompt: string
  onSubmit: (initialSayText: string) => Promise<void>
}

export function InitialSayStep({
  scenarioTitle,
  scenarioDescription,
  prompt,
  onSubmit,
}: InitialSayStepProps) {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-6 pb-20">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Bug className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-wider font-mono">
              CONTEXT SIMULATION — PHASE 1 MVP
            </span>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              {scenarioTitle}
            </h1>
          </div>
        </div>

        <p className="text-sm text-[var(--text-primary)] leading-relaxed font-sans bg-[var(--background)] p-4 rounded-xl border border-[var(--border)] whitespace-pre-wrap">
          {scenarioDescription}
        </p>
      </div>

      {/* SAY Phase Form */}
      <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-5">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>{prompt}</span>
          </label>
          <p className="text-xs text-[var(--text-secondary)]">
            Before entering the codebase, outline your initial debugging strategy, key files to inspect, and plan to solve this issue.
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. I will inspect the login validation function, check for whitespace trimming issues, and run diagnostic tests."
          rows={6}
          disabled={isSubmitting}
          className="w-full p-4 rounded-xl bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-sm font-sans placeholder-[var(--text-secondary)]/50 resize-y leading-relaxed"
        />

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
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
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span>Submit Plan & Launch Workspace</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
