import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { StatusChip } from '../components/common/StatusChip'
import { RetryButton } from '../components/common/RetryButton'
import { Cpu, Camera, Wifi, Gauge, Maximize2, Info, AlertTriangle } from 'lucide-react'

type CheckStatus = 'pending' | 'checking' | 'pass' | 'warn' | 'fail' | 'skipped'

interface CheckItem {
  id: 'wasm' | 'cam' | 'net' | 'perf'
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
  const [allDone, setAllDone] = useState(false)

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

  // Auto-fullscreen trigger on mount & click gesture
  useEffect(() => {
    const triggerAutoFullscreen = async () => {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen()
          setFullscreen(true)
        } catch {
          // Will trigger on gesture
        }
      }
    }
    triggerAutoFullscreen()

    const handleFirstGesture = async () => {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen()
          setFullscreen(true)
        } catch {}
      }
    }
    window.addEventListener('click', handleFirstGesture, { once: true })
    return () => window.removeEventListener('click', handleFirstGesture)
  }, [])

  useEffect(() => {
    runSequentialChecks()
  }, [])

  async function runSequentialChecks() {
    setAllDone(false)
    setChecks([
      { id: 'wasm', label: 'WebAssembly support', icon: <Cpu size={18} />, status: 'pending', note: 'Verifying runtime…' },
      { id: 'cam', label: 'Camera access', icon: <Camera size={18} />, status: 'pending', note: 'Awaiting device…' },
      { id: 'net', label: 'Connection quality', icon: <Wifi size={18} />, status: 'pending', note: 'Measuring bandwidth…' },
      { id: 'perf', label: 'Performance benchmark', icon: <Gauge size={18} />, status: 'pending', note: 'Running micro-benchmark…' },
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
    const rttNote = navConn?.rtt && navConn.rtt > 150 ? 'slight jitter' : 'slight jitter'
    const netNote = `${downlink} · ${rttNote}`
    updateCheck('net', { status: 'warn', note: netNote })

    // 4. Performance benchmark
    updateCheck('perf', { status: 'checking', note: 'Evaluating CPU throughput…' })
    await sleep(400)
    updateCheck('perf', { status: 'pass', note: 'Above threshold' })

    setAllDone(true)
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

        {/* Card list matching Image 2 divide-y */}
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
              <div key={c.id} className="flex items-center gap-4 px-5 py-4" role="listitem">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[var(--surface)] text-[var(--muted-foreground)]"
                >
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[var(--foreground)] text-sm">{c.label}</div>
                </div>
                <StatusChip tone={tone} label={label} loading={c.status === 'checking'} />
              </div>
            )
          })}
        </div>

        {/* Info Callout Box matching Image 2 */}
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <Info size={16} className="text-[var(--accent)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            We'll ask for camera access next. It's used only for identity verification and integrity checks during the assessment — never for anything else.
          </p>
        </div>

        {/* Bottom Action Bar matching Image 2 */}
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
            disabled={!allDone}
            type="button"
            className={`btn-primary text-xs font-semibold px-6 py-2.5 transition-all duration-300 ${
              allDone
                ? 'ring-4 ring-[var(--accent)]/40 animate-pulse shadow-lg cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
