import React from 'react'
import { FileText, Mic, Lock, ArrowRight, LifeBuoy, CheckCircle2 } from 'lucide-react'
import { StatusChip } from '../../components/common/StatusChip'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

interface ConsentSimpleAgreementStepProps {
  type: 'terms' | 'audio'
  onAgree: () => void
}

export function ConsentSimpleAgreementStep({ type, onAgree }: ConsentSimpleAgreementStepProps) {
  const [agreed, setAgreed] = React.useState(false)
  const [micTested, setMicTested] = React.useState(false)
  const [micTesting, setMicTesting] = React.useState(false)

  async function handleTestMic() {
    setMicTesting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setMicTested(true)
      localStorage.setItem('cd-recruit-mic-consent', 'true')
    } catch {
      alert('Microphone access denied. Please allow microphone access in your browser to proceed.')
    } finally {
      setMicTesting(false)
    }
  }

  if (type === 'terms') {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Terms of Use &amp; Evaluation Agreement</h2>
              <p className="text-xs text-[var(--text-secondary)]">Please review the terms governing this assessment session.</p>
            </div>
          </div>
        </div>

        {/* Scrollable Terms Content */}
        <div className="h-64 overflow-y-auto p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-secondary)] leading-relaxed space-y-3 font-sans shadow-[var(--shadow-sm)]">
          <h3 className="font-semibold text-[var(--text-primary)] text-sm">1. Assessment Integrity</h3>
          <p>
            By taking this assessment, you agree to complete all questions independently without unauthorized assistance, AI proxying, or external code submission on your behalf.
          </p>
          <h3 className="font-semibold text-[var(--text-primary)] text-sm">2. Data Privacy &amp; Handling</h3>
          <p>
            Your responses, code submissions, audio/video signals, and event logs are collected solely for the purpose of evaluation by the hiring organization in compliance with applicable DPDP Act rules.
          </p>
          <h3 className="font-semibold text-[var(--text-primary)] text-sm">3. Session Safeguards</h3>
          <p>
            Automated integrity indicators (tab switching, window focus changes, mouse presence) run client-side to ensure fairness across all candidates.
          </p>
        </div>

        <label className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] cursor-pointer transition-colors hover:border-[var(--text-secondary)] select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
          />
          <span className="text-xs text-[var(--text-primary)] leading-normal">
            I have read and agree to the Terms of Use and Assessment Integrity Guidelines.
          </span>
        </label>

        <div className="flex items-center justify-between pt-2">
          <a
            href={SUPPORT_EMAIL}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <LifeBuoy size={14} />
            <span>Need help?</span>
          </a>

          <button
            onClick={onAgree}
            disabled={!agreed}
            className="px-6 py-3 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
          >
            <span>Agree &amp; Continue</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  // Audio / Microphone Consent
  const isAudioReady = agreed && micTested

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20">
            <Mic size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Audio Verification &amp; Consent</h2>
            <p className="text-xs text-[var(--text-secondary)]">Verify microphone input for scenario and voice integrity checks.</p>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            <Lock size={14} className="text-[var(--accent)]" />
            <span>Microphone Security &amp; Usage</span>
          </div>
          <StatusChip
            variant={micTested ? 'success' : 'neutral'}
            label={micTested ? 'MIC PASSED' : 'NOT TESTED'}
            size="sm"
          />
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Audio levels are monitored locally to verify environment ambient noise. No continuous raw audio stream is stored unless an anomaly triggers a short verification clip.
        </p>

        <div className="pt-2">
          {!micTested ? (
            <button
              onClick={handleTestMic}
              disabled={micTesting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Mic size={14} className="text-[var(--accent)]" />
              <span>{micTesting ? 'Testing Microphone…' : 'Test Microphone Input'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--success)] bg-[var(--success-subtle)] p-3 rounded-xl border border-[var(--success)]/20">
              <CheckCircle2 size={16} />
              <span>Microphone input successfully verified!</span>
            </div>
          )}
        </div>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] cursor-pointer transition-colors hover:border-[var(--text-secondary)] select-none">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
        />
        <span className="text-xs text-[var(--text-primary)] leading-normal">
          I consent to local audio monitoring for environment integrity checking during the session.
        </span>
      </label>

      <div className="flex items-center justify-between pt-2">
        <a
          href={SUPPORT_EMAIL}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <LifeBuoy size={14} />
          <span>Support</span>
        </a>

        <button
          onClick={onAgree}
          disabled={!isAudioReady}
          className="px-6 py-3 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
        >
          <span>Continue to Tutorial</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
