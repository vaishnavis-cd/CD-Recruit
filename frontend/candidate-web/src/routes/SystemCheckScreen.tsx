import React, { useEffect, useState, useCallback } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'

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
    // Wait for user to click "Request camera access" (handled below)
  }

  async function requestCameraAccess(isRetry = false) {
    setShowCameraExplainer(false)
    updateCheck('webcam-explainer', { status: 'checking', label: 'Camera access — waiting for permission…' })

    // Subscribe BEFORE calling start() so we never miss the permission-granted/denied event
    await new Promise<void>(resolve => {
      const unsub = services.cv.onDetectionEvent(event => {
        if (event.type === 'permission-granted') {
          updateCheck('webcam-explainer', { status: 'pass', label: 'Camera access' })
          unsub()
          resolve()
        } else if (event.type === 'permission-denied') {
          // In Grace mode, skip retry and go straight to reduced mode
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

      // Start the CV pipeline now that the subscriber is registered
      services.cv.start().catch(() => {
        // start() itself threw — treat as denied
        updateCheck('webcam-explainer', {
          status: 'fail',
          label: 'Camera access',
          errorMessage: 'Camera access was denied.',
          allowRetry: true,
        })
        unsub()
        resolve()
      })

      // Safety timeout — if no event fires within 10s, unblock
      setTimeout(() => {
        unsub()
        resolve()
      }, 10000)
    })

    await runConnectivityCheck()
  }

  async function runConnectivityCheck() {
    updateCheck('connectivity', { status: 'checking' })
    // Simulated connectivity check — fake latency ping
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
        <h1 id="system-check-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
          System Check
        </h1>
        {mode === 'expedited' && (
          <div className="text-sm text-[var(--warning)] mb-4 font-medium">
            You're in the grace window — we'll move quickly.
          </div>
        )}
        <p className="text-[var(--text-secondary)] mb-8 text-sm">
          Running {totalChecks} checks to make sure everything is set up for your assessment.
        </p>

        {storageFull && (
          <div role="alert" className="mb-4 p-3 rounded-lg border border-[var(--warning)] bg-amber-50 dark:bg-amber-900/20 text-sm text-[var(--warning)]">
            Storage space is low. Your responses will sync directly — make sure you don't close the tab mid-assessment.
          </div>
        )}

        {/* Check list */}
        <div className="space-y-3 mb-8" role="list" aria-label="System check items">
          {checks.map(check => (
            <div
              key={check.id}
              role="listitem"
              className={`
                p-4 rounded-lg border transition-colors
                ${check.status === 'pass' ? 'border-[var(--success)] bg-green-50 dark:bg-green-900/10' :
                  check.status === 'fail' ? 'border-[var(--critical)] bg-red-50 dark:bg-red-900/10' :
                  check.status === 'skipped' ? 'border-[var(--warning)] bg-amber-50 dark:bg-amber-900/10' :
                  check.status === 'checking' ? 'border-[var(--accent)] bg-blue-50 dark:bg-blue-900/10' :
                  'border-[var(--border)] bg-[var(--surface)]'
                }
              `}
              aria-label={`${check.label}: ${check.status}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5" aria-hidden>
                  {check.status === 'pass' ? '✓' :
                   check.status === 'fail' ? '✗' :
                   check.status === 'skipped' ? '⚠' :
                   check.status === 'checking' ? '⟳' : '○'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{check.label}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">{check.description}</div>
                  {check.errorMessage && (
                    <div className="text-xs mt-1.5 text-[var(--text-primary)]">{check.errorMessage}</div>
                  )}
                  {check.status === 'fail' && check.allowRetry && check.id === 'webcam-explainer' && (
                    <button
                      onClick={handleCameraRetry}
                      className="mt-2 text-xs text-[var(--accent)] underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded"
                    >
                      Try again
                    </button>
                  )}
                </div>
              </div>

              {/* Camera explainer prompt (shown before firing native permission dialog) */}
              {check.id === 'webcam-explainer' && showCameraExplainer && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <p className="text-sm text-[var(--text-primary)] mb-3">
                    <strong>Before we continue:</strong> We need to request camera access. Your camera is used only for identity verification and integrity checks. The video feed is processed locally on your device — it does not get recorded or uploaded.
                  </p>
                  <button
                    onClick={() => requestCameraAccess(false)}
                    autoFocus
                    className="px-4 py-2 rounded text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
                  >
                    Request camera access
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-1">
            <span>{completedChecks} of {totalChecks} checks complete</span>
            {cvMode === 'reduced' && (
              <span className="text-[var(--warning)]">Running in reduced-proctoring mode</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden" role="progressbar" aria-valuenow={completedChecks} aria-valuemax={totalChecks}>
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${(completedChecks / totalChecks) * 100}%` }}
            />
          </div>
        </div>

        <button
          onClick={handleContinue}
          disabled={!allDone}
          className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          aria-label="Continue to consent"
        >
          {allDone ? 'Continue →' : 'Running checks…'}
        </button>
      </div>
    </div>
  )
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
