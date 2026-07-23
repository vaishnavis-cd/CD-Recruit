import React from 'react'
import { ShieldCheck, Camera, Lock, Trash2, ArrowRight, LifeBuoy } from 'lucide-react'

const SUPPORT_EMAIL = 'mailto:support@cd-recruit.com'

interface ConsentBiometricStepProps {
  onConsent: () => void
}

export function ConsentBiometricStep({ onConsent }: ConsentBiometricStepProps) {
  const [agreed, setAgreed] = React.useState(false)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Biometric Data &amp; Proctoring Notice</h2>
            <p className="text-xs text-[var(--text-secondary)]">We prioritize candidate privacy and transparent data handling.</p>
          </div>
        </div>
      </div>

      {/* 3 Key Trust Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
            <Camera size={16} />
          </div>
          <div className="text-xs font-bold text-[var(--text-primary)]">Local Processing</div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Face and pose analysis runs directly in your browser. Video feeds are not continuously streamed.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
            <Lock size={16} />
          </div>
          <div className="text-xs font-bold text-[var(--text-primary)]">Encrypted Signals</div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Integrity events and verification clips are encrypted before transmission to secure storage.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
            <Trash2 size={16} />
          </div>
          <div className="text-xs font-bold text-[var(--text-primary)]">Data Retention</div>
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Session artifacts and evidence files are purged automatically in accordance with hiring policies.
          </p>
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
          I consent to the collection and processing of biometric signals for automated evaluation and proctoring.
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
          onClick={onConsent}
          disabled={!agreed}
          className="px-6 py-3 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
        >
          <span>I Consent, Continue</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
