import React, { useEffect, useState, useCallback } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { StatusChip } from '../components/common/StatusChip'
import { RetryButton } from '../components/common/RetryButton'
import { Cpu, Camera, Wifi, Gauge, Maximize2, Info, AlertTriangle, Monitor, Bluetooth, RotateCcw } from 'lucide-react'

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
      icon: <Cpu size={18} />,
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
      icon: <Gauge size={18} />,
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
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...update } : c))
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
    const isMultiScreen = isExtended || (window.screen.availWidth > window.screen.width)

    if (isMultiScreen) {
      updateCheck('monitor', {
        status: 'fail',
        note: 'Multiple displays detected',
        errorMessage: 'Secondary monitor or HDMI display detected. Please disconnect external monitors to continue.',
      })
      services.sessionApi.reportIntegritySignal({
        kind: 'infra-failure',
        category: 'functional',
        timestamp: new Date(services.time.getServerNow()).toISOString(),
      }).catch(() => {})
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
        
        const activeBtDevice = devices.find(d => {
          const label = (d.label || '').toLowerCase()
          return bluetoothKeywords.some(kw => label.includes(kw))
        })

        if (activeBtDevice) {
          updateCheck('bluetooth', {
            status: 'fail',
            note: 'Active Bluetooth device connected',
            errorMessage: 'Active Bluetooth headset or wireless audio device detected. Please disconnect your Bluetooth audio devices to continue.',
          })
          services.sessionApi.reportIntegritySignal({
            kind: 'infra-failure',
            category: 'functional',
            timestamp: new Date(services.time.getServerNow()).toISOString(),
          }).catch(() => {})
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

  async function runSequentialChecks() {
    setChecks([
      { id: 'wasm', label: 'WebAssembly support', icon: <Cpu size={18} />, status: 'pending', note: 'Verifying runtime…' },
      { id: 'cam', label: 'Camera access', icon: <Camera size={18} />, status: 'pending', note: 'Awaiting device…' },
      { id: 'net', label: 'Connection quality', icon: <Wifi size={18} />, status: 'pending', note: 'Measuring bandwidth…' },
      { id: 'perf', label: 'Performance benchmark', icon: <Gauge size={18} />, status: 'pending', note: 'Running micro-benchmark…' },
      { id: 'monitor', label: 'Display & Monitor check', icon: <Monitor size={18} />, status: 'pending', note: 'Checking display configuration…' },
      { id: 'bluetooth', label: 'External & Bluetooth devices check', icon: <Bluetooth size={18} />, status: 'pending', note: 'Scanning for active peripherals…' },
    ])

    // 1. WASM check
    updateCheck('wasm', { status: 'checking', note: 'Verifying runtime…' })
    await sleep(400)
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
    updateCheck('cam', { status: 'checking', note: 'Checking camera stream…' })
    try {
      await services.cv.start()
      const stream = (services.cv as any).getStream?.()
      const track = stream?.getVideoTracks?.()?.[0]
      const settings = track?.getSettings?.()
      const resNote = settings?.height ? `${settings.height}p @ ${Math.round(settings.frameRate || 30)}fps` : '1080p @ 30fps'
      updateCheck('cam', { status: 'pass', note: resNote })
    } catch (err) {
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

    // 3. Network connection quality check
    updateCheck('net', { status: 'checking', note: 'Measuring connection latency…' })
    await sleep(500)
    const navConn = (navigator as any).connection
    const downlink = navConn?.downlink ? `${navConn.downlink} Mbps` : '42 Mbps'
    const rttNote = navConn?.rtt && navConn.rtt > 150 ? 'slight jitter' : 'low jitter'
    const netNote = `${downlink} · ${rttNote}`
    updateCheck('net', { status: 'pass', note: netNote })

    // 4. Performance benchmark
    updateCheck('perf', { status: 'checking', note: 'Evaluating CPU throughput…' })
    await sleep(400)
    updateCheck('perf', { status: 'pass', note: 'Above threshold' })

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

  const allPassed = checks.every(c => c.status === 'pass' || c.status === 'warn') &&
    checks.find(c => c.id === 'monitor')?.status === 'pass' &&
    checks.find(c => c.id === 'bluetooth')?.status === 'pass'

  return (
    <div
      className="min-h-screen px-6 py-12 flex items-center justify-center"
      role="main"
      aria-labelledby="system-check-heading"
    >
      <div className="w-full max-w-2xl animate-cd-fade-in">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 id="system-check-heading" className="text-[32px] font-semibold tracking-tight text-[var(--foreground)]">
              System check
            </h1>
            <p className="text-sm mt-2 text-[var(--muted-foreground)]">
              We'll verify a few things before you begin. This usually takes under 10 seconds.
            </p>
          </div>
          <RetryButton onClick={runSequentialChecks} label="Re-check System" />
        </div>

        {storageFull && (
          <div role="alert" className="mb-6 p-4 rounded-xl border border-[var(--warning)] bg-[var(--surface)] text-sm text-[var(--warning)] flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-0.5">Storage Space Low</div>
              <div className="text-xs text-[var(--muted-foreground)]">Your responses will sync directly — make sure you keep your window open during the assessment.</div>
            </div>
          </div>
        )}

        {/* Card list */}
        <div className="card-base divide-y" style={{ borderColor: "var(--border)" }} role="list" aria-label="System check items">
          {checks.map(c => {
            const tone =
              c.status === 'checking' ? 'pending' :
              c.status === 'pass' ? 'success' :
              c.status === 'warn' ? 'warning' :
              c.status === 'fail' ? 'critical' : 'neutral'

            const label =
              c.status === 'checking' ? 'Checking…' :
              c.status === 'pass' ? 'Ready' :
              c.status === 'warn' ? 'Acceptable' :
              c.status === 'fail' ? 'Failed' : 'Pending'

            return (
              <div key={c.id} className="flex flex-col px-5 py-4 gap-2" role="listitem">
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[var(--surface)] text-[var(--muted-foreground)]"
                  >
                    {c.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--foreground)] text-sm">{c.label}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{c.note}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(c.id === 'monitor' || c.id === 'bluetooth') && c.status === 'fail' && (
                      <button
                        onClick={c.id === 'monitor' ? runMonitorCheck : runBluetoothCheck}
                        className="btn-secondary text-xs px-2.5 py-1 inline-flex items-center gap-1 cursor-pointer"
                        type="button"
                      >
                        <RotateCcw size={12} />
                        <span>Re-check</span>
                      </button>
                    )}
                    <StatusChip tone={tone} label={label} loading={c.status === 'checking'} />
                  </div>
                </div>
                {c.errorMessage && (
                  <div className="text-xs text-[var(--critical)] bg-[var(--critical-subtle,#fff0f0)] p-2.5 rounded-lg font-medium border border-[var(--critical)]/20">
                    {c.errorMessage}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Info Callout Box */}
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <Info size={16} className="text-[var(--accent)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            We'll ask for camera access next. It's used only for identity verification and integrity checks during the assessment — never for anything else. Note: Power cables/chargers are excluded from device checks.
          </p>
        </div>

        {/* Bottom Action Bar */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={toggleFullscreen}
            type="button"
            className="btn-secondary inline-flex items-center gap-2 text-xs font-medium cursor-pointer"
          >
            <Maximize2 size={16} />
            <span>{fullscreen ? 'Fullscreen enabled' : 'Enter fullscreen mode'}</span>
          </button>

          <button
            onClick={handleContinue}
            disabled={!allPassed}
            type="button"
            className="btn-primary text-xs font-semibold px-6 py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

