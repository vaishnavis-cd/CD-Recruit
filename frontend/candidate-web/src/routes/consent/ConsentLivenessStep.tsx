import React, { useEffect, useRef, useState } from 'react'
import { FaceDetectionService } from '../../proctoring/face-detection.service'
import { CheckCircle2, Circle, Eye, RotateCcw, ArrowRight, Video } from 'lucide-react'
import { StatusChip } from '../../components/common/StatusChip'

interface ConsentLivenessStepProps {
  onComplete: () => void
}

export function ConsentLivenessStep({ onComplete }: ConsentLivenessStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tasks, setTasks] = useState({
    blink: false,
    turnLeft: false,
    turnRight: false,
  })
  const [hasStream, setHasStream] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let active = true

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
      .then(stream => {
        if (!active) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        setHasStream(true)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
      .catch(() => {})

    return () => {
      active = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  // Poll face detection for liveness challenge
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      try {
        const result = await FaceDetectionService.getInstance().detect(videoRef.current)
        if (!result) return

        if (result.blinkDetected) {
          setTasks(t => ({ ...t, blink: true }))
        }
        if (result.headDirection === 'RIGHT') {
          setTasks(t => ({ ...t, turnRight: true }))
        }
        if (result.headDirection === 'LEFT') {
          setTasks(t => ({ ...t, turnLeft: true }))
        }
      } catch {
        // ignore frame failure
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  const allPassed = tasks.blink && tasks.turnLeft && tasks.turnRight

  useEffect(() => {
    if (allPassed) {
      const timer = setTimeout(() => {
        onComplete()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [allPassed, onComplete])

  function handleSkipFailsafe() {
    setTasks({ blink: true, turnLeft: true, turnRight: true })
    onComplete()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20">
            <Eye size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Liveness Verification</h2>
            <p className="text-xs text-[var(--text-secondary)]">Complete the quick 3-movement check below.</p>
          </div>
        </div>
        <StatusChip
          variant={allPassed ? 'success' : 'accent'}
          label={allPassed ? 'LIVENESS VERIFIED' : 'IN PROGRESS'}
          size="sm"
          pulsing={!allPassed}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Video feed */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-[var(--border)] shadow-[var(--shadow-md)]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
          {!hasStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-400 gap-2 bg-slate-900">
              <Video size={24} />
              <span>Starting camera feed…</span>
            </div>
          )}
          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[10px] text-white font-mono flex items-center gap-1.5 border border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>LIVE FEED</span>
          </div>
        </div>

        {/* Task list */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
            Required Movements
          </div>

          <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${tasks.blink ? 'border-[var(--success)]/30 bg-[var(--success-subtle)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
            <span className="text-xs font-medium text-[var(--text-primary)]">1. Blink your eyes</span>
            {tasks.blink ? (
              <CheckCircle2 size={18} className="text-[var(--success)]" />
            ) : (
              <Circle size={18} className="text-[var(--text-secondary)]/40" />
            )}
          </div>

          <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${tasks.turnLeft ? 'border-[var(--success)]/30 bg-[var(--success-subtle)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
            <span className="text-xs font-medium text-[var(--text-primary)]">2. Slowly turn head left</span>
            {tasks.turnLeft ? (
              <CheckCircle2 size={18} className="text-[var(--success)]" />
            ) : (
              <Circle size={18} className="text-[var(--text-secondary)]/40" />
            )}
          </div>

          <div className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${tasks.turnRight ? 'border-[var(--success)]/30 bg-[var(--success-subtle)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
            <span className="text-xs font-medium text-[var(--text-primary)]">3. Slowly turn head right</span>
            {tasks.turnRight ? (
              <CheckCircle2 size={18} className="text-[var(--success)]" />
            ) : (
              <Circle size={18} className="text-[var(--text-secondary)]/40" />
            )}
          </div>
        </div>
      </div>

      {/* R-03: De-emphasized failsafe skip button */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
        <button
          onClick={handleSkipFailsafe}
          className="text-[11px] text-[var(--text-secondary)]/70 hover:text-[var(--text-secondary)] underline focus:outline-none cursor-pointer transition-colors"
        >
          Having trouble? Skip liveness check (failsafe)
        </button>

        {allPassed && (
          <button
            onClick={onComplete}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--success)] text-white flex items-center gap-2 shadow-[var(--shadow-sm)] cursor-pointer"
          >
            <span>Verified! Proceed</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
