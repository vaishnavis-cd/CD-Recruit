import React, { useState, useRef, useEffect } from 'react'
import { useSessionStore } from '../store/sessionMachine'

// Default: consent is required to continue.
// EXPLICITLY UNDECIDED PRODUCT QUESTION — flip this constant to false to allow opt-out path.
const CONSENT_MANDATORY = true

const SUPPORT_LINK = 'mailto:support@cd-recruit.example.com'
const SELFIE_MAX_RETRIES = 3

interface ConsentScreenProps {
  step: 'terms' | 'biometric' | 'selfie'
  inviteToken: string
}

export function ConsentScreen({ step, inviteToken }: ConsentScreenProps) {
  const { transitionTo } = useSessionStore()
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [biometricAccepted, setBiometricAccepted] = useState(false)
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureAttempts, setCaptureAttempts] = useState(0)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [flaggedForReview, setFlaggedForReview] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  function advanceStep(nextStep: 'terms' | 'biometric' | 'selfie') {
    transitionTo({ type: 'consent', step: nextStep, inviteToken })
  }

  async function handleCaptureSelfie() {
    setCapturing(true)
    setCaptureError(null)
    try {
      // Capture from the live video preview
      if (!videoRef.current || !streamRef.current) {
        throw new Error('Camera not ready')
      }

      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      // Flip the image horizontally to match the preview (mirror effect)
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      setSelfieDataUrl(dataUrl)
      setCaptureAttempts(0)

      // Stop the stream after successful capture
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setStreamActive(false)
    } catch (err: any) {
      const attempts = captureAttempts + 1
      setCaptureAttempts(attempts)
      if (attempts >= SELFIE_MAX_RETRIES) {
        // After N failures, flag for manual review and allow continuation
        setFlaggedForReview(true)
        setCaptureError(null)
      } else {
        setCaptureError(`Capture failed. Please ensure your face is visible and well-lit. (${SELFIE_MAX_RETRIES - attempts} attempt${SELFIE_MAX_RETRIES - attempts !== 1 ? 's' : ''} remaining)`)
      }
    } finally {
      setCapturing(false)
    }
  }

  function handleConsentDeclined() {
    if (CONSENT_MANDATORY) {
      // Block — this is the required default per spec
      // The UI already makes this clear, so no extra action needed
      return
    }
    // Non-mandatory path (future): allow continuation in reduced mode
    // This code path exists for the eventual product decision
    console.warn('[ConsentScreen] Non-mandatory consent path — not yet fully implemented')
  }

  function handleProceedToTutorial() {
    const storedMode = localStorage.getItem('cd-recruit-check-mode') as 'full' | 'expedited' | null
    const mode = storedMode === 'expedited' ? 'condensed' : 'full'
    transitionTo({ type: 'tutorial', mode, inviteToken })
  }

  // Start live video preview when on selfie step
  useEffect(() => {
    if (step !== 'selfie' || selfieDataUrl) return

    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setStreamActive(true)
        }
      } catch (err) {
        console.error('Failed to start video preview:', err)
      }
    }

    startPreview()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setStreamActive(false)
    }
  }, [step, selfieDataUrl])

  // ─── Step 1: Terms of Use ──────────────────────────────────────────────────
  if (step === 'terms') {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="terms-heading">
        <div className="max-w-lg w-full">
          <h1 id="terms-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            Assessment Terms of Use
          </h1>
          <p className="text-[var(--text-secondary)] mb-6 text-sm">
            Please read and accept the following before continuing.
          </p>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6 h-64 overflow-y-auto text-sm text-[var(--text-secondary)] leading-relaxed">
            <h2 className="font-semibold text-[var(--text-primary)] mb-3">Assessment Terms and Conditions</h2>
            <p className="mb-3">By proceeding, you agree that this assessment is to be completed independently, without external assistance, and that your responses represent your own work.</p>
            <p className="mb-3">You acknowledge that the assessment is time-limited and that your session may be monitored for integrity purposes in accordance with the privacy policy provided to you when you were invited.</p>
            <p className="mb-3">Results of this assessment will be reviewed by the recruiting team at the organisation you applied to. They will not be shared with third parties without your consent.</p>
            <p className="mb-3">If you experience a technical issue during the assessment, contact support immediately. Do not close the browser tab — your progress is saved automatically.</p>
            <p>By clicking "I agree and continue", you confirm you have read and understood these terms.</p>
          </div>

          <label className="flex items-start gap-3 mb-6 cursor-pointer group">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[var(--accent)] border-[var(--border)] rounded focus:ring-[var(--accent)] flex-shrink-0"
              aria-label="I have read and agree to the assessment terms of use"
            />
            <span className="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
              I have read and agree to the assessment terms of use
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={() => advanceStep('biometric')}
              disabled={!termsAccepted}
              className="flex-1 py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
            >
              I agree and continue →
            </button>
          </div>

          <div className="mt-4 text-center">
            <a href={SUPPORT_LINK} className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded">
              Contact support
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 2: Biometric Consent (visually and textually separate) ──────────
  if (step === 'biometric') {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="biometric-heading">
        <div className="max-w-lg w-full">
          <h1 id="biometric-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            Biometric Data Processing Consent
          </h1>
          <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-6">
            This is a separate consent from the general assessment terms above
          </p>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
            <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <div className="flex gap-3">
                <span className="text-2xl flex-shrink-0">📷</span>
                <div>
                  <div className="font-medium text-[var(--text-primary)] mb-1">What we collect</div>
                  A baseline selfie image and periodic face-detection signals during the assessment. No audio is captured.
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl flex-shrink-0">🔒</span>
                <div>
                  <div className="font-medium text-[var(--text-primary)] mb-1">How it's used</div>
                  Solely for identity verification and assessment integrity checks. Detection runs on your device — raw video is never uploaded.
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl flex-shrink-0">🗑</span>
                <div>
                  <div className="font-medium text-[var(--text-primary)] mb-1">Retention</div>
                  Biometric data is deleted 90 days after the assessment, or earlier upon request.
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 mb-6 cursor-pointer group">
            <input
              type="checkbox"
              checked={biometricAccepted}
              onChange={e => setBiometricAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[var(--accent)] border-[var(--border)] rounded focus:ring-[var(--accent)] flex-shrink-0"
              aria-label="I consent to biometric data processing as described above"
            />
            <span className="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
              I consent to the collection and processing of my biometric data as described above
            </span>
          </label>

          {CONSENT_MANDATORY && !biometricAccepted && (
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Consent is required to continue this assessment. If you have concerns, please{' '}
              <a href={SUPPORT_LINK} className="text-[var(--accent)] underline">contact support</a>.
            </p>
          )}

          <div className="flex gap-3">
            {!CONSENT_MANDATORY && (
              <button
                onClick={handleConsentDeclined}
                className="flex-1 py-3 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                Decline
              </button>
            )}
            <button
              onClick={() => advanceStep('selfie')}
              disabled={!biometricAccepted}
              className="flex-1 py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
            >
              I consent, continue →
            </button>
          </div>

          <div className="mt-4 text-center">
            <a href={SUPPORT_LINK} className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded">
              Contact support
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 3: Baseline Selfie ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="selfie-heading">
      <div className="max-w-lg w-full">
        <h1 id="selfie-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
          Baseline Identity Photo
        </h1>
        <p className="text-[var(--text-secondary)] mb-6 text-sm">
          We'll take a single photo for identity verification. Make sure your face is clearly visible and your surroundings are reasonably lit.
        </p>

        {/* Camera preview / captured frame */}
        <div className="relative mb-6">
          <div
            className={`
              w-full aspect-video rounded-xl border-2 flex items-center justify-center overflow-hidden
              ${selfieDataUrl
                ? 'border-[var(--success)]'
                : 'border-dashed border-[var(--border)] bg-[var(--surface)]'
              }
            `}
            role="img"
            aria-label={selfieDataUrl ? 'Captured selfie preview' : 'Camera preview area'}
          >
            {selfieDataUrl ? (
              <img
                src={selfieDataUrl}
                alt="Your baseline selfie"
                className="w-full h-full object-cover"
              />
            ) : streamActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
                aria-label="Live camera preview"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)]">
                {/* Face outline framing guide (shown on retry) */}
                {captureAttempts > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-32 h-40 rounded-full border-2 border-dashed border-[var(--accent)] opacity-40" aria-hidden />
                  </div>
                )}
                <span className="text-5xl opacity-40" aria-hidden>👤</span>
                <span className="text-sm">Starting camera...</span>
              </div>
            )}
          </div>
          {selfieDataUrl && (
            <div className="absolute top-3 right-3 bg-[var(--success)] text-white text-xs px-2 py-1 rounded-full font-medium">
              ✓ Captured
            </div>
          )}
        </div>

        {captureError && (
          <div role="alert" className="mb-4 p-3 rounded-lg border border-[var(--border)] bg-amber-50 dark:bg-amber-900/20 text-sm text-[var(--warning)]">
            {captureError} — align your face within the oval guide.
          </div>
        )}

        {flaggedForReview && (
          <div role="alert" className="mb-4 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-secondary)]">
            We weren't able to capture a clear photo. This has been flagged for manual review — you can continue with the assessment.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {!selfieDataUrl && !flaggedForReview && (
            <button
              onClick={handleCaptureSelfie}
              disabled={capturing}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
              aria-label="Take baseline selfie"
            >
              {capturing ? 'Capturing…' : captureAttempts > 0 ? 'Try again' : 'Take photo'}
            </button>
          )}

          {(selfieDataUrl || flaggedForReview) && (
            <>
              {selfieDataUrl && (
                <button
                  onClick={() => { 
                    setSelfieDataUrl(null)
                    setCaptureAttempts(0)
                    setFlaggedForReview(false)
                    setCaptureError(null)
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  Retake photo
                </button>
              )}
              <button
                onClick={handleProceedToTutorial}
                className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
              >
                Continue to assessment →
              </button>
            </>
          )}
        </div>

        <div className="mt-4 text-center">
          <a href={SUPPORT_LINK} className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded">
            Contact support
          </a>
        </div>
      </div>
    </div>
  )
}
