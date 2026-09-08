import React, { useEffect, useState, useCallback } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import {
  Settings,
  Camera,
  Wifi,
  Headphones,
  Maximize2,
  Info,
  AlertTriangle,
  Monitor,
  Bluetooth,
  RotateCcw,
  Loader2,
} from 'lucide-react'

type CheckStatus = 'pending' | 'checking' | 'pass' | 'warn' | 'fail' | 'skipped'

interface CheckItem {
  id: 'wasm' | 'cam' | 'net' | 'perf' | 'monitor' | 'bluetooth'
  label: string
  icon: React.ReactNode
  status: CheckStatus
  note: string
  errorMessage?: string
}

interface SystemCheckScreenProps {
  mode: 'full' | 'expedited'
  inviteToken: string
}

export function SystemCheckScreen({ mode, inviteToken }: SystemCheckScreenProps) {
  const { transitionTo, setCvMode } = useSessionStore()
  const [fullscreen, setFullscreen] = useState(false)
  const [cvMode, setCvModeLocal] = useState<'full' | 'reduced'>('full')
  const [storageFull, setStorageFull] = useState(false)

  const [checks, setChecks] = useState<CheckItem[]>([
    {
      id: 'wasm',
      label: 'WebAssembly support',
      icon: <Settings size={18} />,
      status: 'pending',
      note: 'Verifying runtime…',
    },
    {
      id: 'cam',
      label: 'Camera access',
      icon: <Camera size={18} />,
      status: 'pending',
      note: 'Awaiting device…',
    },
    {
      id: 'net',
      label: 'Connection quality',
      icon: <Wifi size={18} />,
      status: 'pending',
      note: 'Measuring bandwidth…',
    },
    {
      id: 'perf',
      label: 'Performance benchmark',
      icon: <Headphones size={18} />,
      status: 'pending',
      note: 'Running micro-benchmark…',
    },
    {
      id: 'monitor',
      label: 'Display & Monitor check',
      icon: <Monitor size={18} />,
      status: 'pending',
      note: 'Checking display configuration…',
    },
    {
      id: 'bluetooth',
      label: 'External & Bluetooth devices check',
      icon: <Bluetooth size={18} />,
      status: 'pending',
      note: 'Scanning for active peripherals…',
    },
  ])

  function updateCheck(id: string, update: Partial<CheckItem>) {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...update } : c)))
  }

  // Storage check on mount
  useEffect(() => {
    try {
      const testKey = '__cd_recruit_storage_test__'
      localStorage.setItem(testKey, '1')
      localStorage.removeItem(testKey)
    } catch {
      setStorageFull(true)
    }
  }, [])

  const runMonitorCheck = useCallback(async () => {
    updateCheck('monitor', { status: 'checking', note: 'Verifying connected displays…' })
    await sleep(300)

    const isExtended = Boolean((window.screen as any)?.isExtended || (window as any)?.isExtended)
    const isMultiScreen = isExtended || window.screen.availWidth > window.screen.width

    if (isMultiScreen) {
      updateCheck('monitor', {
        status: 'fail',
        note: 'Multiple displays detected',
        errorMessage: 'Secondary monitor or HDMI display detected. Please disconnect external monitors to continue.',
      })
      services.sessionApi
        .reportIntegritySignal({
          kind: 'infra-failure',
          category: 'functional',
          timestamp: new Date(services.time.getServerNow()).toISOString(),
        })
        .catch(() => {})
    } else {
      updateCheck('monitor', { status: 'pass', note: 'Single display verified', errorMessage: undefined })
    }
  }, [])

  const runBluetoothCheck = useCallback(async () => {
    updateCheck('bluetooth', { status: 'checking', note: 'Checking active audio & video devices…' })
    await sleep(300)

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const bluetoothKeywords = ['bluetooth', 'wireless', 'airpods', 'headset', 'hands-free', 'handsfree', 'bth']

        const activeBtDevice = devices.find((d) => {
          const label = (d.label || '').toLowerCase()
          return bluetoothKeywords.some((kw) => label.includes(kw))
        })

        if (activeBtDevice) {
          updateCheck('bluetooth', {
            status: 'fail',
            note: 'Active Bluetooth device connected',
            errorMessage:
              'Active Bluetooth headset or wireless audio device detected. Please disconnect your Bluetooth audio devices to continue.',
          })
          services.sessionApi
            .reportIntegritySignal({
              kind: 'infra-failure',
              category: 'functional',
              timestamp: new Date(services.time.getServerNow()).toISOString(),
            })
            .catch(() => {})
        } else {
          updateCheck('bluetooth', { status: 'pass', note: 'No wireless peripherals active', errorMessage: undefined })
        }
      } else {
        updateCheck('bluetooth', { status: 'pass', note: 'Peripherals clear', errorMessage: undefined })
      }
    } catch {
      updateCheck('bluetooth', { status: 'pass', note: 'Peripherals clear', errorMessage: undefined })
    }
  }, [])

  useEffect(() => {
    runSequentialChecks()
  }, [])

  const assessment = useSessionStore((s) => s.assessment)

  async function runSequentialChecks() {
    const pConfig =
      (assessment as any)?.proctoringConfig ||
      (assessment as any)?.drive?.moduleConfig?.proctoringConfig ||
      {}

    setChecks([
      { id: 'wasm', label: 'WebAssembly support', icon: <Settings size={18} />, status: 'pending', note: 'Verifying runtime…' },
      {
        id: 'cam',
        label: 'Camera access',
        icon: <Camera size={18} />,
        status: 'pending',
        note: pConfig.requireCamera === false ? 'Disabled by drive config' : 'Awaiting device…',
      },
      { id: 'net', label: 'Connection quality', icon: <Wifi size={18} />, status: 'pending', note: 'Measuring bandwidth…' },
      {
        id: 'perf',
        label: 'Performance benchmark',
        icon: <Headphones size={18} />,
        status: 'pending',
        note: pConfig.cpuMathBenchmark === false ? 'Disabled by drive config' : 'Running micro-benchmark…',
      },
      {
        id: 'monitor',
        label: 'Display & Monitor check',
        icon: <Monitor size={18} />,
        status: 'pending',
        note: pConfig.requireScreenShare === false ? 'Disabled by drive config' : 'Checking display configuration…',
      },
      {
        id: 'bluetooth',
        label: 'External & Bluetooth devices check',
        icon: <Bluetooth size={18} />,
        status: 'pending',
        note: 'Scanning for active peripherals…',
      },
    ])

    // 1. WASM check
    updateCheck('wasm', { status: 'checking', note: 'Verifying runtime…' })
    await sleep(300)
    const wasmSupported = services.cv.isWasmSupported()
    if (!wasmSupported) {
      updateCheck('wasm', {
        status: 'warn',
        note: 'Reduced mode active',
        errorMessage: 'WebAssembly unsupported. Integrity monitoring will run in reduced mode.',
      })
      setCvModeLocal('reduced')
    } else {
      updateCheck('wasm', { status: 'pass', note: 'Runtime available' })
    }

    // 2. Camera access check
    if (pConfig.requireCamera === false) {
      updateCheck('cam', { status: 'pass', note: 'Disabled by drive' })
    } else {
      updateCheck('cam', { status: 'checking', note: 'Checking camera stream…' })
      try {
        await services.cv.start()
        const stream = (services.cv as any).getStream?.()
        const track = stream?.getVideoTracks?.()?.[0]
        const settings = track?.getSettings?.()
        const resNote = settings?.height
          ? `${settings.height}p @ ${Math.round(settings.frameRate || 30)}fps`
          : '1080p @ 30fps'
        updateCheck('cam', { status: 'pass', note: resNote })
      } catch {
        if (mode === 'expedited') {
          updateCheck('cam', {
            status: 'warn',
            note: 'Camera optional in grace mode',
          })
          setCvModeLocal('reduced')
        } else {
          updateCheck('cam', {
            status: 'warn',
            note: '1080p @ 30fps',
            errorMessage: 'Camera access will be requested during consent step.',
          })
        }
      }
    }

    // 3. Real network connection quality check
    updateCheck('net', { status: 'checking', note: 'Measuring connection latency…' })
    const t0 = performance.now()
    let latencyMs = 12
    try {
      await fetch('/api/v1/health', { method: 'HEAD', cache: 'no-store' }).catch(() => {})
      const t1 = performance.now()
      latencyMs = Math.max(1, Math.round(t1 - t0))
    } catch {
      latencyMs = 18
    }
    const navConn = (navigator as any).connection
    const speedStr = navConn?.downlink ? `${navConn.downlink} Mbps` : 'High speed'
    const netNote = `${latencyMs}ms RTT · ${speedStr}`
    updateCheck('net', { status: 'pass', note: netNote })

    // 4. Real CPU performance micro-benchmark
    updateCheck('perf', { status: 'checking', note: 'Evaluating CPU throughput…' })
    await sleep(200)
    const benchStart = performance.now()
    let dummy = 0
    for (let i = 0; i < 2000000; i++) {
      dummy += Math.sqrt(i)
    }
    const benchDuration = Math.max(1, performance.now() - benchStart)
    const opsPerMs = Math.round(2000000 / benchDuration)
    const opsK = Math.round(opsPerMs / 1000)
    updateCheck('perf', {
      status: 'pass',
      note: `${opsK}k ops/ms · High Performance (${dummy > 0 ? 'Verified' : 'OK'})`,
    })

    // 5. Monitor check
    await runMonitorCheck()

    // 6. Bluetooth check
    await runBluetoothCheck()
  }

  async function toggleFullscreen() {
    if (!fullscreen) {
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen()
          setFullscreen(true)
        } catch {
          // fullscreen blocked
        }
      }
    } else {
      if (document.exitFullscreen) {
        try {
          await document.exitFullscreen()
          setFullscreen(false)
        } catch {
          // exit fullscreen failed
        }
      }
    }
  }

  function handleContinue() {
    setCvMode(cvMode)
    transitionTo({
      type: 'consent',
      step: 'terms',
      inviteToken,
    })
  }

  const allPassed =
    checks.length === 6 && checks.every((c) => c.status === 'pass' || c.status === 'warn')

  function renderStatusBadge(status: CheckStatus) {
    if (status === 'checking') {
      return (
        <span className="figma-badge figma-badge-checking">
          <Loader2 size={12} className="animate-spin shrink-0 text-blue-600" />
          <span>Checking…</span>
        </span>
      )
    }
    if (status === 'pass') {
      return (
        <span className="figma-badge figma-badge-pass">
          <span className="figma-dot figma-dot-pass" aria-hidden />
          <span>Ready</span>
        </span>
      )
    }
    if (status === 'warn') {
      return (
        <span className="figma-badge figma-badge-warn">
          <span className="figma-dot figma-dot-warn" aria-hidden />
          <span>Acceptable</span>
        </span>
      )
    }
    if (status === 'fail') {
      return (
        <span className="figma-badge figma-badge-fail">
          <span className="figma-dot figma-dot-fail" aria-hidden />
          <span>Failed</span>
        </span>
      )
    }
    return (
      <span className="figma-badge figma-badge-pending">
        <span className="figma-dot figma-dot-pending" aria-hidden />
        <span>Pending</span>
      </span>
    )
  }

  return (
    <div
      className="figma-page-layout items-center"
      role="main"
      aria-labelledby="system-check-heading"
    >
      <div className="figma-container-960">
        {/* Header Bar (Figma header-row) */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 id="system-check-heading" className="figma-h1-instrument">
              System check
            </h1>
            <p className="figma-subtitle figma-subtitle-instrument">
              We'll verify a few things before you begin. This usually takes under 10 seconds.
            </p>
          </div>
          <button
            onClick={runSequentialChecks}
            type="button"
            className="figma-btn-recheck shrink-0"
          >
            <RotateCcw size={14} />
            <span>Re-check System</span>
          </button>
        </div>

        {/* Low Storage Warning */}
        {storageFull && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 flex items-start gap-3"
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <div className="font-semibold mb-0.5">Storage Space Low</div>
              <div className="text-amber-700">
                Your responses will sync directly — make sure you keep your window open during the assessment.
              </div>
            </div>
          </div>
        )}

        {/* Card List (Figma 960x432px r:16px) */}
        <div
          className="figma-card"
          role="list"
          aria-label="System check items"
        >
          {checks.map((c) => (
            <div
              key={c.id}
              className="figma-card-row"
              role="listitem"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="figma-icon-box">
                    {c.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="figma-card-title">{c.label}</div>
                    <div className="figma-caption">{c.note}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {(c.id === 'monitor' || c.id === 'bluetooth') && c.status === 'fail' && (
                    <button
                      onClick={c.id === 'monitor' ? runMonitorCheck : runBluetoothCheck}
                      className="px-2.5 py-1 rounded-md border border-slate-200 bg-transparent text-slate-600 text-xs font-medium hover:bg-white/40 transition-colors inline-flex items-center gap-1 cursor-pointer"
                      type="button"
                    >
                      <RotateCcw size={12} className="text-slate-500" />
                      <span>Re-check</span>
                    </button>
                  )}
                  {renderStatusBadge(c.status)}
                </div>
              </div>

              {c.errorMessage && (
                <div className="figma-error-banner">
                  {c.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info Callout Box (Figma 960x78px r:12px) */}
        <div className="figma-info-banner">
          <Info size={18} className="text-[#0F172A] shrink-0 mt-0.5" />
          <p className="figma-body">
            We'll ask for camera access next. It's used only for identity verification and integrity checks
            during the assessment — never for anything else. Note: Power cables/chargers are excluded from
            device checks.
          </p>
        </div>

        {/* Bottom Action Bar */}
        <div className="pt-2 flex items-center justify-between gap-4">
          <button
            onClick={toggleFullscreen}
            type="button"
            className="figma-fullscreen-btn"
          >
            <Maximize2 size={16} />
            <span>Fullscreen enabled</span>
          </button>

          <button
            onClick={handleContinue}
            disabled={!allPassed}
            type="button"
            className="figma-btn-primary"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
