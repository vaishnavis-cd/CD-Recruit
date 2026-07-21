import React, { useState, useRef, useEffect } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { FaceDetectionService } from '../proctoring/face-detection.service'
import { services } from '../services'

// Default: consent is required to continue.
// EXPLICITLY UNDECIDED PRODUCT QUESTION — flip this constant to false to allow opt-out path.
const CONSENT_MANDATORY = true

const SUPPORT_LINK = 'mailto:support@cd-recruit.example.com'
const SELFIE_MAX_RETRIES = 3

// Consent record version — bump when consent language materially changes
const CONSENT_VERSION = '1.0.0'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

type ConsentType = 'TERMS' | 'BIOMETRIC' | 'SELFIE' | 'AUDIO'

/**
 * Persist a consent record server-side before advancing the candidate.
 * The server resolves the candidateId from the sessionId.
 * Fires-and-forgets on network error (will log) but does NOT block progress —
 * the compliance obligation is best-effort from the client side; the server
 * gate is the SessionOwnerGuard on the /begin endpoint.
 */
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

export function ConsentScreen({ step, inviteToken }: ConsentScreenProps) {
  const { transitionTo, cvMode } = useSessionStore()
  const session = useSessionStore((s) => s.session)
  const sessionId = session?.id ?? null

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

  // Audio consent states
  const [audioAccepted, setAudioAccepted] = useState(false)
  const [micTesting, setMicTesting] = useState(false)
  const [micTestPassed, setMicTestPassed] = useState(false)
  const [micTestError, setMicTestError] = useState<string | null>(null)

  // Liveness Challenge states
  const [livenessBlink, setLivenessBlink] = useState(false)
  const [livenessLeft, setLivenessLeft] = useState(false)
  const [livenessRight, setLivenessRight] = useState(false)
  const [livenessError, setLivenessError] = useState<string | null>(null)
  const [complianceHalt, setComplianceHalt] = useState(false)

  function advanceStep(nextStep: 'terms' | 'biometric' | 'liveness' | 'selfie' | 'audio') {
    transitionTo({ type: 'consent', step: nextStep, inviteToken })
  }

  async function handleCaptureSelfie() {
    setCapturing(true)
    setCaptureError(null)
    try {
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
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setSelfieDataUrl(dataUrl)
      
      // Cache selfie in localStorage temporarily (as transient bridge)
      // Flagged: Cleared immediately upon successful upload to /selfie
      localStorage.setItem('cd-recruit-selfie-data', dataUrl)
      setFlaggedForReview(false)
      setCaptureAttempts(0)

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setStreamActive(false)
    } catch (err: any) {
      console.error('[ConsentScreen] Selfie capture failed:', err)
      const attempts = captureAttempts + 1
      setCaptureAttempts(attempts)
      if (attempts >= SELFIE_MAX_RETRIES) {
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
      return
    }
    console.warn('[ConsentScreen] Non-mandatory consent path — not yet fully implemented')
  }

  async function handleProceedToTutorial() {
    try {
      const session = useSessionStore.getState().session
      if (session?.id) {
        await services.sessionApi.recordConsent(session.id, '1.0')
      }
      transitionTo({
        type: 'tutorial',
        mode: cvMode === 'reduced' ? 'condensed' : 'full',
        inviteToken,
      })
    } catch (err) {
      console.error('[ConsentScreen] Failed to persist consent record:', err)
      setComplianceHalt(true)
    }
  }

  async function handleProceedFromSelfie() {
    if (sessionId) await persistConsent(sessionId, 'SELFIE')
    advanceStep('audio')
  }

  async function handleProceedFromAudio() {
    if (sessionId) await persistConsent(sessionId, 'AUDIO')
    handleProceedToTutorial()
  }

  async function handleTestMic() {
    setMicTesting(true)
    setMicTestError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      setMicTestPassed(true)
      localStorage.setItem('cd-recruit-mic-consent', 'true')
    } catch (err) {
      setMicTestError('Microphone access denied or unavailable. Please check system permissions.')
    } finally {
      setMicTesting(false)
    }
  }

  // Start live video preview when on liveness or selfie step
  useEffect(() => {
    if ((step !== 'selfie' && step !== 'liveness') || (step === 'selfie' && selfieDataUrl)) return

    let cancelled = false

    async function startPreview() {
      try {
        console.log('[ConsentScreen] Requesting getUserMedia stream...')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        })
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            await videoRef.current.play()
            console.log('[ConsentScreen] Video playing successfully, videoWidth:', videoRef.current.videoWidth)
          } catch (playErr) {
            console.warn('[ConsentScreen] Video play error:', playErr)
          }
        }
        setStreamActive(true)
      } catch (err) {
        console.error('Failed to start video preview for consent/liveness:', err)
        setLivenessError('Could not access webcam. Please check permissions.')
      }
    }

    startPreview()

    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      setStreamActive(false)
    }
  }, [step, selfieDataUrl])

  // Attach stream to videoRef whenever streamRef.current & videoRef.current are ready
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch((err) => {
        console.warn('[ConsentScreen] Video play catch:', err)
      })
    }
  }, [streamActive, step])

  // Liveness check detection loop
  useEffect(() => {
    if (step !== 'liveness' || !streamActive || !videoRef.current) return

    let active = true
    const faceService = FaceDetectionService.getInstance()

    if (!faceService.isModelLoaded()) {
      faceService.loadModel().catch(err => {
        console.error('[ConsentScreen] Failed to load face detection model:', err)
        setLivenessError('Failed to initialize face detection model.')
      })
    }

    const detectLoop = () => {
      if (!active || !videoRef.current) return
      
      const video = videoRef.current
      if (video.readyState >= 2 && !video.paused) {
        try {
          const result = faceService.detect(video)
          if (result.faceDetected) {
            if (result.blinkDetected) {
              setLivenessBlink(true)
            }
            if (result.headDirection === 'LEFT') {
              setLivenessLeft(true)
            }
            if (result.headDirection === 'RIGHT') {
              setLivenessRight(true)
            }
          }
        } catch (err) {
          console.error('[ConsentScreen] Error in liveness detection:', err)
        }
      }

      if (active) {
        setTimeout(detectLoop, 100)
      }
    }

    const timer = setTimeout(detectLoop, 500)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [step, streamActive])

  // Automatically advance to selfie once all liveness checks are completed
  useEffect(() => {
    if (step === 'liveness' && livenessBlink && livenessLeft && livenessRight) {
      const timer = setTimeout(() => {
        advanceStep('selfie')
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [step, livenessBlink, livenessLeft, livenessRight])

  // Liveness skip helper (failsafe)
  function handleSkipLiveness() {
    setLivenessBlink(true)
    setLivenessLeft(true)
    setLivenessRight(true)
    advanceStep('selfie')
  }

  // ─── Compliance Halt Render ───────────────────────────────────────────────
  if (complianceHalt) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main">
        <div className="max-w-lg w-full text-center">
          <div className="text-6xl mb-6 text-amber-500" aria-hidden>⚠️</div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
            Compliance Halt: Consent Persistence Missing
          </h1>
          <p className="text-[var(--text-secondary)] mb-6 text-sm leading-relaxed">
            The assessment cannot proceed because the required <strong>ConsentRecord</strong> persistence endpoint is missing on the backend API.
            Biometric processing under the DPDP Act (2023) requires candidate consent records to be persisted securely.
          </p>
          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 text-left text-xs font-mono text-[var(--text-secondary)] mb-6 leading-relaxed">
            <span className="font-semibold text-[var(--text-primary)]">Developer Resolution Path:</span>
            <br />
            - Missing Table: ConsentRecord (Prisma Schema)
            <br />
            - Missing Route: POST /api/v1/sessions/:sessionId/consent
            <br />
            - Status: Needs explicit human sign-off / implementation of backend consent persistence.
          </div>
          <button
            disabled
            className="w-full py-3 rounded-lg text-sm font-semibold bg-gray-400 text-white cursor-not-allowed opacity-50 focus:outline-none"
          >
            Assessment Blocked (Persistence Missing)
          </button>
        </div>
      </div>
    )
  }

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
              onClick={async () => {
                if (sessionId) await persistConsent(sessionId, 'TERMS')
                advanceStep('biometric')
              }}
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

  // ─── Step 2: Biometric Consent ─────────────────────────────────────────────
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
              onClick={async () => {
                if (sessionId) await persistConsent(sessionId, 'BIOMETRIC')
                advanceStep('liveness')
              }}
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

  // ─── Step 3: Liveness Challenge ────────────────────────────────────────────
  if (step === 'liveness') {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="liveness-heading">
        <div className="max-w-lg w-full">
          <h1 id="liveness-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            Identity Liveness Check
          </h1>
          <p className="text-[var(--text-secondary)] mb-6 text-sm">
            To prevent automated verification fraud, please perform the following actions in front of your camera.
          </p>

          <div className="relative mb-6 rounded-xl overflow-hidden border border-[var(--border)] bg-black aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${streamActive ? 'block' : 'hidden'}`}
              aria-label="Liveness camera preview"
            />
            {!streamActive && (
              <span className="text-sm text-gray-400">Loading webcam preview…</span>
            )}
          </div>

          {livenessError && (
            <p role="alert" className="mb-4 text-sm text-amber-500 font-medium">{livenessError}</p>
          )}

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-primary)]">1. Blink your eyes</span>
              <span className={livenessBlink ? 'text-green-500 font-bold' : 'text-gray-400 font-mono text-xs animate-pulse'}>
                {livenessBlink ? '✓ Detected' : 'Pending…'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-primary)]">2. Turn your head to the Left</span>
              <span className={livenessLeft ? 'text-green-500 font-bold' : 'text-gray-400 font-mono text-xs animate-pulse'}>
                {livenessLeft ? '✓ Detected' : 'Pending…'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-primary)]">3. Turn your head to the Right</span>
              <span className={livenessRight ? 'text-green-500 font-bold' : 'text-gray-400 font-mono text-xs animate-pulse'}>
                {livenessRight ? '✓ Detected' : 'Pending…'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleSkipLiveness}
              className="w-full py-2.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none"
            >
              Skip Liveness Check (failsafe)
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 4: Baseline Selfie ───────────────────────────────────────────────
  if (step === 'selfie') {
    return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="selfie-heading">
      <div className="max-w-lg w-full">
        <h1 id="selfie-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
          Baseline Identity Photo
        </h1>
        <p className="text-[var(--text-secondary)] mb-6 text-sm">
          We'll take a single photo for identity verification. Make sure your face is clearly visible and your surroundings are reasonably lit.
        </p>

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
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${streamActive ? 'block' : 'hidden'}`}
                  aria-label="Live camera preview"
                />
                {!streamActive && (
                  <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)]">
                    {captureAttempts > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-32 h-40 rounded-full border-2 border-dashed border-[var(--accent)] opacity-40" aria-hidden />
                      </div>
                    )}
                    <span className="text-5xl opacity-40" aria-hidden>👤</span>
                    <span className="text-sm">Starting camera...</span>
                  </div>
                )}
              </>
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

        {livenessError && !captureError && (
          <div role="alert" className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-700">
            {livenessError}
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
              disabled={capturing || !streamActive}
              className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
              aria-label="Take baseline selfie"
            >
              {capturing ? 'Capturing…' : !streamActive ? 'Waiting for camera…' : captureAttempts > 0 ? 'Try again' : 'Take photo'}
            </button>
          )}

          {/* Camera failed — let candidate continue without a selfie (flagged for manual review) */}
          {!selfieDataUrl && !flaggedForReview && livenessError && (
            <button
              onClick={() => setFlaggedForReview(true)}
              className="w-full py-2.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none"
            >
              Continue without photo (flagged for review)
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
                    localStorage.removeItem('cd-recruit-selfie-data')
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  Retake photo
                </button>
              )}
              <button
                onClick={handleProceedFromSelfie}
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

  // ─── Step 5: Microphone Consent ────────────────────────────────────────────
  if (step === 'audio') {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12" role="main" aria-labelledby="audio-heading">
        <div className="max-w-lg w-full">
          <h1 id="audio-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            Microphone Data Processing Consent
          </h1>
          <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-6">
            Separate consent for audio/voice activity detection
          </p>

          <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6">
            <div className="space-y-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              <div className="flex gap-3">
                <span className="text-2xl flex-shrink-0">🎙️</span>
                <div>
                  <div className="font-medium text-[var(--text-primary)] mb-1">What we process</div>
                  Voice activity detection (VAD) signals during the assessment to verify integrity. Raw audio is only stored temporarily in local memory as part of the 6-second evidence buffer and is uploaded to MinIO only when anomalies are triggered.
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl flex-shrink-0">🔒</span>
                <div>
                  <div className="font-medium text-[var(--text-primary)] mb-1">DPIA and Privacy Compliance</div>
                  Audio data is processed solely to detect presence of speech/third-parties. Audio is never used for automated voice profiling or speaker identification.
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 mb-6 cursor-pointer group">
            <input
              type="checkbox"
              checked={audioAccepted}
              onChange={e => setAudioAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-[var(--accent)] border-[var(--border)] rounded focus:ring-[var(--accent)] flex-shrink-0"
              aria-label="I consent to microphone monitoring as described above"
            />
            <span className="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
              I consent to the collection and processing of microphone data for integrity verification
            </span>
          </label>

          {audioAccepted && !micTestPassed && (
            <div className="mb-6 p-4 border border-[var(--border)] bg-[var(--surface)] rounded-xl text-center">
              <p className="text-xs text-[var(--text-secondary)] mb-3">Please test your microphone before proceeding.</p>
              <button
                onClick={handleTestMic}
                disabled={micTesting}
                className="px-4 py-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-active)]"
              >
                {micTesting ? 'Testing…' : 'Test Microphone'}
              </button>
              {micTestError && <p className="text-xs text-red-500 mt-2">{micTestError}</p>}
            </div>
          )}

          {micTestPassed && (
            <div role="alert" className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300">
              ✓ Microphone test passed! Consent successfully saved.
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleProceedFromAudio}
              disabled={!audioAccepted || !micTestPassed}
              className="flex-1 py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              Continue to assessment →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Fallback — should never be reached if step is always a valid value
  return null
}
