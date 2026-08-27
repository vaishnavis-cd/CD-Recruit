import React, { useState } from 'react'
import { ShieldCheck, Rocket, CheckCircle2, FileCode, CheckSquare, Send } from 'lucide-react'

export interface HotfixSignoffData {
  rootCause: string
  fixSummary: string
  deploymentDecision: 'DEPLOY_TODAY' | 'DELAY_DEPLOYMENT'
}

interface HotfixSignoffPanelProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
}

export function HotfixSignoffPanel({ onSubmit, onCancel }: HotfixSignoffPanelProps) {
  const [remediationSummary, setRemediationSummary] = useState('')
  const [deploymentDecision, setDeploymentDecision] = useState<'DEPLOY_TODAY' | 'DELAY_DEPLOYMENT'>('DEPLOY_TODAY')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!remediationSummary.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({
        rootCause: remediationSummary,
        fixSummary: remediationSummary,
        regressionRisk: 'LOW',
        testingStatus: {
          unitTestsPassed: true,
          boundaryCasesVerified: true,
          regressionSuiteClean: true,
        },
        confidenceScore: 95,
        affectedComponents: ['Authentication API', 'User Login Service'],
        deploymentDecision,
      })
    } catch (err) {
      console.error('Failed submitting hotfix signoff:', err)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--surface)] text-[var(--text-primary)] font-sans border-l border-[var(--border)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Hotfix Sign-Off &amp; Production Authorization</h2>
            <p className="text-xs text-[var(--text-secondary)]">Review automated test verifications and authorize hotfix release.</p>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
        {/* Automated System Verification Suite */}
        <div className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Automated Verification Suite</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-mono text-xs-plus font-bold">
              3/3 Tests Passed
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-xs-plus text-[var(--text-secondary)]">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
              <span>pytest test_auth.py :: PASS</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
              <FileCode className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Modified: services/auth_service.py</span>
            </div>
          </div>
        </div>

        {/* Concise Remediation Summary Input */}
        <div className="space-y-2">
          <label className="block font-bold text-[var(--text-primary)] text-xs">
            Remediation &amp; Fix Summary <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={remediationSummary}
            onChange={(e) => setRemediationSummary(e.target.value)}
            rows={3}
            required
            placeholder="e.g. Added explicit username.strip() validation to reject space-padded payload bypasses in validate_username()."
            className="w-full p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-xs text-[var(--text-primary)] transition-all resize-none"
          />
        </div>

        {/* Release Authorization Choice */}
        <div className="space-y-2">
          <label className="block font-bold text-[var(--text-primary)] text-xs">
            Deployment Release Authorization <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDeploymentDecision('DEPLOY_TODAY')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                deploymentDecision === 'DEPLOY_TODAY'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 font-bold shadow-xs'
                  : 'bg-[var(--background)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              <Rocket className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-xs font-bold">Authorize Hotfix Release</div>
                <div className="text-2xs opacity-80 leading-tight mt-0.5">Deploy patch immediately to staging &amp; production.</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDeploymentDecision('DELAY_DEPLOYMENT')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                deploymentDecision === 'DELAY_DEPLOYMENT'
                  ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold shadow-xs'
                  : 'bg-[var(--background)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-xs font-bold">Request Peer Review</div>
                <div className="text-2xs opacity-80 leading-tight mt-0.5">Hold release for secondary engineering review.</div>
              </div>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--background)] font-bold transition-all cursor-pointer"
          >
            Back to Code
          </button>
          <button
            type="submit"
            disabled={submitting || !remediationSummary.trim()}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'Authorizing...' : 'Submit Sign-Off & Complete Scenario'}</span>
          </button>
        </div>
      </form>
    </div>
  )
}
