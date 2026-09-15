import React, { useState } from 'react';
import { useSessionStore } from '../store/sessionMachine';
import { ConsentSimpleAgreementStep } from './consent/ConsentSimpleAgreementStep';
import { ConsentBiometricStep } from './consent/ConsentBiometricStep';
import { ConsentIdProofStep } from './consent/ConsentIdProofStep';
import { ConsentLivenessStep } from './consent/ConsentLivenessStep';
import { ConsentSelfieStep } from './consent/ConsentSelfieStep';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { FaceDetectionService } from '../proctoring/face-detection.service';

const CONSENT_VERSION = '1.0.0';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

type ConsentType = 'TERMS' | 'BIOMETRIC' | 'SELFIE' | 'AUDIO';

async function persistConsent(sessionId: string, consentType: ConsentType): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentType, version: CONSENT_VERSION }),
    });
    if (!res.ok) {
      console.error(`[ConsentScreen] persistConsent failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('[ConsentScreen] persistConsent network error:', err);
  }
}

interface ConsentScreenProps {
  step: 'terms' | 'biometric' | 'id-proof' | 'liveness' | 'selfie' | 'audio';
  inviteToken: string;
}

const STEPS: Array<{ key: ConsentScreenProps['step']; label: string; title: string; subtitle?: string }> = [
  { key: 'terms', label: 'Terms', title: 'Terms of Use', subtitle: 'Please read carefully before continuing.' },
  { key: 'biometric', label: 'Biometric', title: 'Biometric consent', subtitle: 'A quick, transparent summary of what we collect and why.' },
  { key: 'id-proof', label: 'ID Proof', title: 'Identity verification document', subtitle: 'Upload or capture your government-issued ID proof.' },
  { key: 'liveness', label: 'Liveness', title: 'Liveness challenge', subtitle: 'Follow the prompts. Each step confirms automatically.' },
  { key: 'selfie', label: 'Selfie', title: 'Baseline selfie', subtitle: 'Position your face inside the guide, then capture.' },
  { key: 'audio', label: 'Audio', title: 'Audio check', subtitle: 'Confirm your microphone is working.' },
];

export function ConsentScreen({ step, inviteToken }: ConsentScreenProps) {
  const { transitionTo } = useSessionStore();
  const session = useSessionStore(s => s.session);
  const sessionId = session?.id ?? null;
  const [complianceHalt] = useState(false);

  React.useEffect(() => {
    // Preload FaceDetectionService model in background during consent flow
    FaceDetectionService.getInstance().loadModel().catch(() => {});
  }, []);

  const currentStepIndex = STEPS.findIndex(s => s.key === step);
  const currentStepMeta = STEPS[currentStepIndex] || STEPS[0];

  function advanceStep(nextStep: ConsentScreenProps['step']) {
    transitionTo({
      type: 'consent',
      step: nextStep,
      inviteToken,
    });
  }

  function handleBack() {
    if (currentStepIndex > 0) {
      advanceStep(STEPS[currentStepIndex - 1].key);
    } else {
      transitionTo({
        type: 'system-check',
        mode: 'full',
        inviteToken,
      });
    }
  }

  function handleTermsComplete() {
    if (sessionId) persistConsent(sessionId, 'TERMS');
    advanceStep('biometric');
  }

  function handleBiometricComplete() {
    if (sessionId) persistConsent(sessionId, 'BIOMETRIC');
    advanceStep('id-proof');
  }

  function handleIdProofComplete() {
    advanceStep('liveness');
  }

  function handleLivenessComplete() {
    advanceStep('selfie');
  }

  function handleSelfieComplete() {
    if (sessionId) persistConsent(sessionId, 'SELFIE');
    advanceStep('audio');
  }

  function handleAudioComplete() {
    if (sessionId) persistConsent(sessionId, 'AUDIO');
    const checkMode = localStorage.getItem('cd-recruit-check-mode');
    const tutorialMode: 'full' | 'condensed' = checkMode === 'expedited' ? 'condensed' : 'full';
    transitionTo({
      type: 'tutorial',
      mode: tutorialMode,
      inviteToken,
    });
  }

  if (complianceHalt) {
    return (
      <div className="figma-page-layout items-center">
        <div className="max-w-md w-full bg-white border border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Consent Gate Temporarily Unavailable</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your consent record could not be registered with the server at this time. Please refresh the page or contact your administrator to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="figma-page-layout"
      role="main"
      aria-labelledby="consent-heading"
    >
      <div className="figma-container-960">
        {/* Navigation & Step Indicator Top Bar (Figma header-top) */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="text-sm font-medium text-slate-600">
            Step {currentStepIndex + 1} of {STEPS.length}
          </div>
        </div>

        {/* 5/6-segment progress bar (Figma progress-bar gap:8px, height:6px, r:3px) */}
        <div
          className="figma-progress-bar"
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemax={STEPS.length}
        >
          {STEPS.map((s, idx) => (
            <div
              key={s.key}
              className={`figma-progress-segment ${
                idx <= currentStepIndex ? 'figma-progress-segment-active' : 'figma-progress-segment-inactive'
              }`}
            />
          ))}
        </div>

        {/* Title & Subtitle (Figma title-group gap:8px) */}
        <div>
          <h1 id="consent-heading" className="figma-h1">
            {currentStepMeta.title}
          </h1>
          {currentStepMeta.subtitle && (
            <p className="figma-subtitle">
              {currentStepMeta.subtitle}
            </p>
          )}
        </div>

        {/* Step Content */}
        <div>
          {step === 'terms' && <ConsentSimpleAgreementStep type="terms" onAgree={handleTermsComplete} />}
          {step === 'biometric' && <ConsentBiometricStep onConsent={handleBiometricComplete} />}
          {step === 'id-proof' && <ConsentIdProofStep onComplete={handleIdProofComplete} />}
          {step === 'liveness' && <ConsentLivenessStep onComplete={handleLivenessComplete} />}
          {step === 'selfie' && <ConsentSelfieStep onComplete={handleSelfieComplete} />}
          {step === 'audio' && <ConsentSimpleAgreementStep type="audio" onAgree={handleAudioComplete} />}
        </div>
      </div>
    </div>
  );
}
