import React, { useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { ConsentSimpleAgreementStep } from './consent/ConsentSimpleAgreementStep'
import { ConsentBiometricStep } from './consent/ConsentBiometricStep'
import { ConsentLivenessStep } from './consent/ConsentLivenessStep'
import { ConsentSelfieStep } from './consent/ConsentSelfieStep'
import { StatusChip } from '../components/common/StatusChip'
import { ShieldCheck, AlertTriangle } from 'lucide-react'

const CONSENT_VERSION = '1.0.0'
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

type ConsentType = 'TERMS' | 'BIOMETRIC' | 'SELFIE' | 'AUDIO'

async function persistConsent(sessionId: string, consentType: ConsentType): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentType, version: CONSENT_VERSION }),
    })
    if (!res.ok) {
      console.error(`[ConsentScreen] persistConsent failed: ${res.status} ${res.statusText}`)
    }
  } catch (err) {
    console.error('[ConsentScreen] persistConsent network error:', err)
  }
}

interface ConsentScreenProps {
  step: 'terms' | 'biometric' | 'liveness' | 'selfie' | 'audio'
  inviteToken: string
}

const STEPS: Array<{ key: ConsentScreenProps['step']; label: string }> = [
  { key: 'terms', label: 'Terms' },
  { key: 'biometric', label: 'Biometric' },
  { key: 'liveness', label: 'Liveness' },
  { key: 'selfie', label: 'Selfie' },
  { key: 'audio', label: 'Audio' },
]

export function ConsentScreen({ step, inviteToken }: ConsentScreenProps) {
  const { transitionTo } = useSessionStore()
  const session = useSessionStore(s => s.session)
  const sessionId = session?.id ?? null
  const [complianceHalt] = useState(false)

  function advanceStep(nextStep: ConsentScreenProps['step']) {
    transitionTo({
      type: 'consent',
      step: nextStep,
      inviteToken,
    })
  }

  function handleTermsComplete() {
    if (sessionId) persistConsent(sessionId, 'TERMS')
    advanceStep('biometric')
  }

  function handleBiometricComplete() {
    if (sessionId) persistConsent(sessionId, 'BIOMETRIC')
    advanceStep('liveness')
  }

  function handleLivenessComplete() {
    advanceStep('selfie')
  }

  function handleSelfieComplete() {
    if (sessionId) persistConsent(sessionId, 'SELFIE')
    advanceStep('audio')
  }

  function handleAudioComplete() {
    if (sessionId) persistConsent(sessionId, 'AUDIO')
    const checkMode = localStorage.getItem('cd-recruit-check-mode')
    const tutorialMode: 'full' | 'condensed' = checkMode === 'expedited' ? 'condensed' : 'full'
    transitionTo({
      type: 'tutorial',
      mode: tutorialMode,
      inviteToken,
    })
  }

  // R-13: Sanitized compliance halt screen (no developer API route exposure)
  if (complianceHalt) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[var(--surface)] border border-[var(--warning)]/30 rounded-2xl p-8 text-center space-y-4 shadow-[var(--shadow-lg)]">
          <div className="w-12 h-12 rounded-2xl bg-[var(--warning-subtle)] text-[var(--warning)] flex items-center justify-center mx-auto border border-[var(--warning)]/20">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Consent Gate Temporarily Unavailable</h1>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Your consent record could not be registered with the server at this time. Please refresh the page or contact your administrator to continue.
          </p>
        </div>
      </div>
    )
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === step)

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="consent-heading"
    >
      <div className="max-w-2xl w-full">
        {/* Outer Shell Header with Step Indicator */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-[var(--accent)]" />
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Candidate Verification</span>
            </div>
            <StatusChip
              variant="accent"
              label={`STEP ${currentStepIndex + 1} OF ${STEPS.length}`}
              size="sm"
            />
          </div>

          {/* Segmented Step Progress Bar */}
          <div className="grid grid-cols-5 gap-2" role="progressbar" aria-valuenow={currentStepIndex + 1} aria-valuemax={STEPS.length}>
            {STEPS.map((s, idx) => {
              const isPast = idx < currentStepIndex
              const isCurrent = idx === currentStepIndex

              return (
                <div key={s.key} className="space-y-1">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isPast ? 'bg-[var(--success)]' :
                      isCurrent ? 'bg-[var(--accent)]' :
                      'bg-[var(--border)]'
                    }`}
                  />
                  <div className={`text-[10px] text-center font-medium ${isCurrent ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
                    {s.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Step Card Container */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-[var(--shadow-md)]">
          {step === 'terms' && <ConsentSimpleAgreementStep type="terms" onAgree={handleTermsComplete} />}
          {step === 'biometric' && <ConsentBiometricStep onConsent={handleBiometricComplete} />}
          {step === 'liveness' && <ConsentLivenessStep onComplete={handleLivenessComplete} />}
          {step === 'selfie' && <ConsentSelfieStep onComplete={handleSelfieComplete} />}
          {step === 'audio' && <ConsentSimpleAgreementStep type="audio" onAgree={handleAudioComplete} />}
        </div>
      </div>
    </div>
  )
}
