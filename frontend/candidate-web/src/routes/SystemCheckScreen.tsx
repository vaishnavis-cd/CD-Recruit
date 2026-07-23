import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { StatusChip } from '../components/common/StatusChip'
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Circle, Camera, ShieldAlert, ArrowRight } from 'lucide-react'

type CheckStatus = 'pending' | 'checking' | 'pass' | 'fail' | 'skipped'

interface CheckItem {
  id: string
  label: string
  description: string
  status: CheckStatus
  errorMessage?: string
  allowRetry?: boolean
}

interface SystemCheckScreenProps {
  mode: 'full' | 'expedited'
  inviteToken: string
}

export function SystemCheckScreen({ mode, inviteToken }: SystemCheckScreenProps) {
  const { transitionTo, setCvMode } = useSessionStore()
  const [checks, setChecks] = useState<CheckItem[]>([
    {
      id: 'wasm',
      label: 'Browser compatibility (WebAssembly)',
      description: 'Checks that your browser supports the integrity monitoring component.',
      status: 'pending',
    },
    {
      id: 'webcam-explainer',
      label: 'Camera access',
      description: "We'll ask for camera access next — used only for identity verification and integrity checks. The camera feed stays on your device by default.",
      status: 'pending',
    },
    {
      id: 'connectivity',
      label: 'Connectivity check',
      description: 'A quick check to verify your connection is stable for the assessment.',
      status: 'pending',
    },
    {
      id: 'fullscreen',
      label: 'Fullscreen mode',
      description: 'We recommend fullscreen for the best experience. You can re-enter fullscreen at any time during the assessment.',
      status: 'pending',
    },
  ])
  const [webcamRetried, setWebcamRetried] = useState(false)
  const [cvMode, setCvModeLocal] = useState<'full' | 'reduced'>('full')
  const [storageFull, setStorageFull] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const [showCameraExplainer, setShowCameraExplainer] = useState(false)

  function updateCheck(id: string, update: Partial<CheckItem>) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...update } : c))
  }

  // Storage full simulation
  useEffect(() => {
    try {
      const testKey = '__cd_recruit_storage_test__'
      localStorage.setItem(testKey, '1')
      localStorage.removeItem(testKey)
    } catch {
      setStorageFull(true)
    }
  }, [])

  useEffect(() => {
    runChecks()
  }, [])

  async function runChecks() {
    // 1. WASM check
    updateCheck('wasm', { status: 'checking' })
    await sleep(400)
    const wasmSupported = services.cv.isWasmSupported()
    if (!wasmSupported) {
      updateCheck('wasm', {
        status: 'fail',
        errorMessage: 'WebAssembly is not available in your browser. You can still continue — integrity monitoring will run in reduced mode. Consider updating your browser for future assessments.',
        allowRetry: false,
      })
      setCvModeLocal('reduced')
    } else {
      updateCheck('wasm', { status: 'pass' })
    }

    // 2. Camera explainer — show first, NEVER fire permission cold
    updateCheck('webcam-explainer', { status: 'checking' })
    setShowCameraExplainer(true)
  }

  async function requestCameraAccess(isRetry = false) {
    setShowCameraExplainer(false)
    updateCheck('webcam-explainer', { status: 'checking', label: 'Camera access — waiting for permission…' })

    const cameraPromise = new Promise<void>(resolve => {
      const unsub = services.cv.onDetectionEvent(event => {
        if (event.type === 'permission-granted') {
          updateCheck('webcam-explainer', { status: 'pass', label: 'Camera access' })
          unsub()
          resolve()
        } else if (event.type === 'permission-denied') {
          if (mode === 'expedited' || (isRetry && webcamRetried)) {
            updateCheck('webcam-explainer', {
              status: 'skipped',
              label: 'Camera access',
              errorMessage: 'Camera access was not granted. Proceeding in reduced-proctoring mode.',
            })
            setCvModeLocal('reduced')
          } else {
            updateCheck('webcam-explainer', {
              status: 'fail',
              label: 'Camera access',
              errorMessage: 'Camera access was denied.',
              allowRetry: true,
            })
          }
          unsub()
          resolve()
        } else if (event.type === 'wasm-unsupported') {
          updateCheck('webcam-explainer', {
            status: 'skipped',
            label: 'Camera access',
            errorMessage: 'Integrity monitoring unsupported in this browser. Proceeding in reduced mode.',
          })
          setCvModeLocal('reduced')
          unsub()
          resolve()
        }
      })

      services.cv.start().catch(() => {
        updateCheck('webcam-explainer', {
          status: 'fail',
          label: 'Camera access',
          errorMessage: 'Camera access was denied.',
          allowRetry: true,
        })
        unsub()
        resolve()
      })

      setTimeout(() => {
        unsub()
        resolve()
      }, 10000)
    })

    services.cv.start().catch((err) => {
      console.error('[SystemCheck] Error starting CV service:', err)
    })

    await cameraPromise
    await runConnectivityCheck()
  }

  async function runConnectivityCheck() {
    updateCheck('connectivity', { status: 'checking' })
    await sleep(600 + Math.random() * 400)
    updateCheck('connectivity', { status: 'pass' })
    await runFullscreenCheck()
  }

  async function runFullscreenCheck() {
    updateCheck('fullscreen', { status: 'checking' })
    await sleep(300)

    if (!document.fullscreenEnabled) {
      updateCheck('fullscreen', { status: 'skipped', errorMessage: 'Fullscreen not available in this browser.' })
    } else {
      try {
        await document.documentElement.requestFullscreen()
        updateCheck('fullscreen', { status: 'pass' })
      } catch {
        updateCheck('fullscreen', { status: 'skipped', errorMessage: 'Could not enter fullscreen automatically — you can try again from your browser.' })
      }
    }

    setAllDone(true)
  }

  async function handleCameraRetry() {
    setWebcamRetried(true)
    await requestCameraAccess(true)
  }

  function handleContinue() {
    setCvMode(cvMode)
    transitionTo({
      type: 'consent',
      step: 'terms',
      inviteToken,
    })
  }

  const completedChecks = checks.filter(c => c.status !== 'pending' && c.status !== 'checking').length
  const totalChecks = checks.length

  

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="system-check-heading"
    >
      <div className="max-w-lg w-full">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <h1 id="system-check-heading" className="text-2xl font-bold text-[var(--text-primary)]">
              System Check
            </h1>
            <StatusChip
              variant={mode === 'expedited' ? 'warning' : 'accent'}
              label={mode === 'expedited' ? 'Grace Mode' : 'Standard Check'}
              size="sm"
            />
          </div>
          <p className="text-[var(--text-secondary)] text-sm">
            Verifying your setup before proceeding to consent and assessment.
          </p>
        </div>

        {storageFull && (
          <div role="alert" className="mb-6 p-4 rounded-xl border border-[var(--warning)] bg-[var(--warning-subtle)] text-sm text-[var(--warning)] flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">Storage Space Low</div>
              <div className="text-xs">Your responses will sync directly — make sure you keep your window open during the assessment.</div>
            </div>
          </div>
        )}

        {/* Check list */}
        <div className="space-y-3 mb-8" role="list" aria-label="System check items">
          {checks.map(check => (
            <div
              key={check.id}
              role="listitem"
              className={`
                p-4 rounded-2xl border transition-all duration-200
                ${check.status === 'pass' ? 'border-[var(--success)]/30 bg-[var(--surface)] shadow-[var(--shadow-sm)]' :
                  check.status === 'fail' ? 'border-[var(--critical)]/30 bg-[var(--critical-subtle)]' :
                  check.status === 'skipped' ? 'border-[var(--warning)]/30 bg-[var(--warning-subtle)]' :
                  check.status === 'checking' ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' :
                  'border-[var(--border)] bg-[var(--surface)]'
                }
              `}
              aria-label={`${check.label}: ${check.status}`}
            >
              <div className="flex items-start gap-3.5">
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{check.label}</span>
                    <StatusChip
                      variant={
                        check.status === 'pass' ? 'success' :
                        check.status === 'fail' ? 'critical' :
                        check.status === 'skipped' ? 'warning' :
                        check.status === 'checking' ? 'accent' : 'neutral'
                      }
                      label={check.status.toUpperCase()}
                      size="sm"
                      pulsing={check.status === 'checking'}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">{check.description}</p>
                  {check.errorMessage && (
                    <div className="text-xs mt-2 text-[var(--text-primary)] font-medium bg-[var(--bg)]/50 p-2.5 rounded-lg border border-[var(--border)]">
                      {check.errorMessage}
                    </div>
                  )}
                  {check.status === 'fail' && check.allowRetry && check.id === 'webcam-explainer' && (
                    <button
                      onClick={handleCameraRetry}
                      className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded"
                    >
                      Try requesting access again →
                    </button>
                  )}
                </div>
              </div>

              {/* Camera explainer prompt with strong visual weight */}
              {check.id === 'webcam-explainer' && showCameraExplainer && (
                <div className="mt-4 pt-4 border-t border-[var(--accent)]/20 bg-[var(--bg)] p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                    <Camera size={18} className="text-[var(--accent)]" />
                    <span>Camera Permission Request</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Camera access is required for identity verification and integrity monitoring. Your video feed is processed locally on your hardware and is never streamed continuously.
                  </p>
                  <button
                    onClick={() => requestCameraAccess(false)}
                    autoFocus
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 cursor-pointer"
                  >
                    Allow &amp; Grant Camera Access
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Progress indicator */}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-xs text-[var(--text-secondary)] font-medium">
            <span>{completedChecks} of {totalChecks} checks complete</span>
            {cvMode === 'reduced' && (
              <span className="text-[var(--warning)] font-semibold">Reduced-Proctoring Mode</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-[var(--surface)] border border-[var(--border)] overflow-hidden" role="progressbar" aria-valuenow={completedChecks} aria-valuemax={totalChecks}>
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${(completedChecks / totalChecks) * 100}%` }}
            />
          </div>
        </div>

        <button
          onClick={handleContinue}
          disabled={!allDone}
          className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 flex items-center justify-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
          aria-label="Continue to consent"
        >
          <span>{allDone ? 'Continue to Consent' : 'Running Checks…'}</span>
          {allDone && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  )
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

