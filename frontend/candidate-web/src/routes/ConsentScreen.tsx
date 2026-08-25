import React, { useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { ConsentSimpleAgreementStep } from './consent/ConsentSimpleAgreementStep'
import { ConsentBiometricStep } from './consent/ConsentBiometricStep'
import { ConsentIdProofStep } from './consent/ConsentIdProofStep'
import { ConsentLivenessStep } from './consent/ConsentLivenessStep'
import { ConsentSelfieStep } from './consent/ConsentSelfieStep'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

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
  step: 'terms' | 'biometric' | 'id-proof' | 'liveness' | 'selfie' | 'audio'
  inviteToken: string
}

const STEPS: Array<{ key: ConsentScreenProps['step']; label: string; title: string; subtitle?: string }> = [
  { key: 'terms', label: 'Terms', title: 'Terms of Use', subtitle: 'Please read carefully before continuing.' },
  { key: 'biometric', label: 'Biometric', title: 'Biometric consent', subtitle: 'A quick, transparent summary of what we collect and why.' },
  { key: 'id-proof', label: 'ID Proof', title: 'Identity verification document', subtitle: 'Upload or capture your government-issued ID proof.' },
  { key: 'liveness', label: 'Liveness', title: 'Liveness challenge', subtitle: 'Follow the prompts. Each step confirms automatically.' },
  { key: 'selfie', label: 'Selfie', title: 'Baseline selfie', subtitle: 'Position your face inside the guide, then capture.' },
  { key: 'audio', label: 'Audio', title: 'Audio check', subtitle: 'Confirm your microphone is working.' },
]

export function ConsentScreen({ step, inviteToken }: ConsentScreenProps) {
  const { transitionTo } = useSessionStore()
  const session = useSessionStore(s => s.session)
  const sessionId = session?.id ?? null
  const [complianceHalt] = useState(false)

  const currentStepIndex = STEPS.findIndex(s => s.key === step)
  const currentStepMeta = STEPS[currentStepIndex] || STEPS[0]

  function advanceStep(nextStep: ConsentScreenProps['step']) {
    transitionTo({
      type: 'consent',
      step: nextStep,
      inviteToken,
    })
  }

  function handleBack() {
    if (currentStepIndex > 0) {
      advanceStep(STEPS[currentStepIndex - 1].key)
    } else {
      transitionTo({
        type: 'system-check',
        mode: 'full',
        inviteToken,
      })
    }
  }

  function handleTermsComplete() {
    if (sessionId) persistConsent(sessionId, 'TERMS')
    advanceStep('biometric')
  }

  function handleBiometricComplete() {
    if (sessionId) persistConsent(sessionId, 'BIOMETRIC')
    advanceStep('id-proof')
  }

  function handleIdProofComplete() {
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

  return (
    <div
      className="min-h-screen px-6 py-10 flex justify-center"
      role="main"
      aria-labelledby="consent-heading"
    >
      <div className="w-full max-w-2xl animate-cd-fade-in">
        {/* Navigation & Step Indicator Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div className="text-xs font-medium text-[var(--muted-foreground)] font-mono-data">
            Step {currentStepIndex + 1} of {STEPS.length}
          </div>
        </div>

        {/* 6-segment thin progress bar */}
        <div className="flex gap-1.5 mb-8" role="progressbar" aria-valuenow={currentStepIndex + 1} aria-valuemax={STEPS.length}>
          {STEPS.map((s, idx) => (
            <div
              key={s.key}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                background: idx <= currentStepIndex ? "var(--accent)" : "var(--border)",
                opacity: idx <= currentStepIndex ? 1 : 0.6,
              }}
            />
          ))}
        </div>

        {/* Title & Subtitle */}
        <h1 id="consent-heading" className="text-[28px] font-semibold tracking-tight text-[var(--foreground)]">
          {currentStepMeta.title}
        </h1>
        {currentStepMeta.subtitle && (
          <p className="text-sm mt-2 mb-6 text-[var(--muted-foreground)]">
            {currentStepMeta.subtitle}
          </p>
        )}

        {/* Step Content */}
        <div className="mt-6">
          {step === 'terms' && <ConsentSimpleAgreementStep type="terms" onAgree={handleTermsComplete} />}
          {step === 'biometric' && <ConsentBiometricStep onConsent={handleBiometricComplete} />}
          {step === 'id-proof' && <ConsentIdProofStep onComplete={handleIdProofComplete} />}
          {step === 'liveness' && <ConsentLivenessStep onComplete={handleLivenessComplete} />}
          {step === 'selfie' && <ConsentSelfieStep onComplete={handleSelfieComplete} />}
          {step === 'audio' && <ConsentSimpleAgreementStep type="audio" onAgree={handleAudioComplete} />}
        </div>
      </div>
    </div>
  )
}
