import React, { useState } from 'react'
import { Camera, Eye, Lock, ShieldCheck, Check } from 'lucide-react'

interface ConsentBiometricStepProps {
  onConsent: () => void
}

export function ConsentBiometricStep({ onConsent }: ConsentBiometricStepProps) {
  const [agreed, setAgreed] = useState(false)

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            icon: <Camera size={18} />,
            title: "What we collect",
            body: "Periodic still frames from your camera and a short liveness sequence.",
          },
          {
            icon: <Eye size={18} />,
            title: "How it's used",
            body: "To match your identity to your baseline selfie and detect obvious impersonation.",
          },
          {
            icon: <Lock size={18} />,
            title: "Where it lives",
            body: "Raw video stays on-device. Only signed integrity summaries leave your browser.",
          },
        ].map((c) => (
          <div key={c.title} className="card-surface p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-[var(--background)] text-[var(--accent)] border border-[var(--border)]"
            >
              {c.icon}
            </div>
            <div className="font-semibold text-sm text-[var(--foreground)] mb-1">{c.title}</div>
            <div className="text-sm text-[var(--muted-foreground)] leading-normal">
              {c.body}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <ShieldCheck size={16} className="text-[var(--success)] mt-0.5 shrink-0" />
        <p className="text-sm text-[var(--muted-foreground)]">
          You may withdraw biometric consent at any time by ending the session. Doing so voids the attempt.
        </p>
      </div>

      {/* AgreeBar matching Image 1 */}
      <div className="mt-8 flex items-center justify-between">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-[var(--foreground)]">
          <span
            className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${
              agreed ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--surface)] border-[var(--border)]'
            }`}
            onClick={() => setAgreed(v => !v)}
          >
            {agreed && <Check size={14} strokeWidth={3} />}
          </span>
          <span onClick={() => setAgreed(v => !v)}>I consent to biometric processing as described</span>
        </label>
        <button
          className={`btn-primary text-xs font-semibold px-6 py-2.5 transition-all duration-300 ${
            agreed
              ? 'animate-border-ripple shadow-lg cursor-pointer'
              : 'opacity-50 cursor-not-allowed'
          }`}
          disabled={!agreed}
          onClick={onConsent}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
