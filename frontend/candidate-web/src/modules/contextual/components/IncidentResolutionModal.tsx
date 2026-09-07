import React, { useState } from 'react'
import { AlertTriangle, ShieldAlert, Rocket, Clock, Send, ShieldCheck, X } from 'lucide-react'

export interface ResolutionData {
  rootCause: string
  fixSummary: string
  regressionRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  testingStatus: {
    unitTestsPassed: boolean
    boundaryCasesVerified: boolean
    regressionSuiteClean: boolean
  }
  confidenceScore: number
  affectedComponents: string[]
  deploymentDecision: 'DEPLOY_TODAY' | 'DELAY_DEPLOYMENT' | 'REQUEST_ADDITIONAL_QA' | 'ESCALATE'
}

interface IncidentResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: ResolutionData) => Promise<void>
}

export function IncidentResolutionModal({ isOpen, onClose, onSubmit }: IncidentResolutionModalProps) {
  const [rootCause, setRootCause] = useState('')
  const [fixSummary, setFixSummary] = useState('')
  const [regressionRisk, setRegressionRisk] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('LOW')
  const [unitTestsPassed, setUnitTestsPassed] = useState(true)
  const [boundaryCasesVerified, setBoundaryCasesVerified] = useState(true)
  const [regressionSuiteClean, setRegressionSuiteClean] = useState(true)
  const [confidenceScore, setConfidenceScore] = useState(90)
  const [affectedComponents, setAffectedComponents] = useState<string[]>(['Authentication API', 'User Login Service'])
  const [deploymentDecision, setDeploymentDecision] = useState<'DEPLOY_TODAY' | 'DELAY_DEPLOYMENT' | 'REQUEST_ADDITIONAL_QA' | 'ESCALATE'>('DEPLOY_TODAY')
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rootCause.trim() || !fixSummary.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({
        rootCause,
        fixSummary,
        regressionRisk,
        testingStatus: {
          unitTestsPassed,
          boundaryCasesVerified,
          regressionSuiteClean,
        },
        confidenceScore,
        affectedComponents,
        deploymentDecision,
      })
    } catch (err) {
      console.error('Failed submitting resolution workflow:', err)
      setSubmitting(false)
    }
  }

  const toggleComponent = (comp: string) => {
    if (affectedComponents.includes(comp)) {
      setAffectedComponents(affectedComponents.filter((c) => c !== comp))
    } else {
      setAffectedComponents([...affectedComponents, comp])
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Incident Resolution &amp; Deployment Authorization</h2>
              <p className="text-xs text-[var(--text-secondary)]">Complete mandatory engineering sign-off prior to production deployment.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Root Cause & Fix Summary */}
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">
                Root Cause Analysis <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                placeholder="e.g. Missing leading and trailing whitespace validation in validate_username() allowed space-padded strings to bypass security checks."
                rows={2}
                required
                className="w-full p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--text-primary)] mb-1">
                Fix Summary &amp; Code Remediation <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={fixSummary}
                onChange={(e) => setFixSummary(e.target.value)}
                placeholder="e.g. Added explicit check for username != username.strip() before string length and character verification."
                rows={2}
                required
                className="w-full p-3 rounded-xl bg-[var(--background)] border border-[var(--border)] text-[var(--text-primary)] text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              />
            </div>
          </div>

          {/* Risk Assessment Grid */}
          <div className="p-4 rounded-xl bg-[var(--background)] border border-[var(--border)] space-y-4">
            <h3 className="font-bold text-[var(--text-primary)] uppercase tracking-wider font-mono text-xs-plus flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>Engineering Risk Assessment &amp; Validation</span>
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Regression Risk Selection */}
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1.5">Regression Risk</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((risk) => (
                    <button
                      key={risk}
                      type="button"
                      onClick={() => setRegressionRisk(risk)}
                      className={`py-1.5 px-2 rounded-lg font-mono font-bold text-2xs border transition-all cursor-pointer ${
                        regressionRisk === risk
                          ? risk === 'LOW'
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                            : risk === 'MEDIUM'
                            ? 'bg-amber-500/20 border-amber-500 text-amber-500'
                            : 'bg-rose-500/20 border-rose-500 text-rose-500'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {risk}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deployment Confidence */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="font-semibold text-[var(--text-secondary)]">Deployment Confidence</label>
                  <span className="font-mono font-bold text-[var(--accent)] text-xs-plus">{confidenceScore}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={confidenceScore}
                  onChange={(e) => setConfidenceScore(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
              </div>
            </div>

            {/* Testing Checklist */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
              <span className="font-semibold text-[var(--text-secondary)] block mb-1">Testing Verification Checklist</span>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unitTestsPassed}
                    onChange={(e) => setUnitTestsPassed(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Unit Tests Passed</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boundaryCasesVerified}
                    onChange={(e) => setBoundaryCasesVerified(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Boundary Cases</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regressionSuiteClean}
                    onChange={(e) => setRegressionSuiteClean(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>Regression Suite</span>
                </label>
              </div>
            </div>

            {/* Affected Components */}
            <div className="pt-2 border-t border-[var(--border)]">
              <span className="font-semibold text-[var(--text-secondary)] block mb-1.5">Affected Components</span>
              <div className="flex flex-wrap gap-1.5">
                {['Authentication API', 'User Login Service', 'Session Manager', 'SSO Gateway'].map((comp) => {
                  const isSelected = affectedComponents.includes(comp)
                  return (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => toggleComponent(comp)}
                      className={`px-2.5 py-1 rounded-md font-mono text-2xs border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] font-bold'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {comp}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Deployment Strategy Selection */}
          <div className="space-y-2">
            <label className="block font-bold text-[var(--text-primary)]">
              Final Deployment Authorization Choice <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  id: 'DEPLOY_TODAY',
                  label: 'Deploy Today',
                  desc: 'Authorize immediate production release within window.',
                  icon: Rocket,
                  color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
                },
                {
                  id: 'DELAY_DEPLOYMENT',
                  label: 'Delay Deployment',
                  desc: 'Hold release for scheduled off-peak patch window.',
                  icon: Clock,
                  color: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
                },
                {
                  id: 'REQUEST_ADDITIONAL_QA',
                  label: 'Request Additional QA',
                  desc: 'Send fix back to QA team for full regression suite.',
                  icon: ShieldAlert,
                  color: 'border-blue-500/40 bg-blue-500/10 text-blue-500',
                },
                {
                  id: 'ESCALATE',
                  label: 'Escalate to Principal',
                  desc: 'Escalate to Engineering Management for sign-off.',
                  icon: AlertTriangle,
                  color: 'border-purple-500/40 bg-purple-500/10 text-purple-500',
                },
              ].map((strategy) => {
                const Icon = strategy.icon
                const isSelected = deploymentDecision === strategy.id
                return (
                  <button
                    key={strategy.id}
                    type="button"
                    onClick={() => setDeploymentDecision(strategy.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? `${strategy.color} ring-2 ring-[var(--accent)] font-semibold shadow-xs`
                        : 'bg-[var(--background)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{strategy.label}</span>
                    </div>
                    <p className="text-2xs text-[var(--text-secondary)] mt-1 leading-normal">{strategy.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Footer Submit Action */}
          <div className="pt-3 border-t border-[var(--border)] flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!rootCause.trim() || !fixSummary.trim() || submitting}
              className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-40"
            >
              <span>{submitting ? 'Submitting Authorization...' : 'Submit Resolution & Complete Debrief'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
