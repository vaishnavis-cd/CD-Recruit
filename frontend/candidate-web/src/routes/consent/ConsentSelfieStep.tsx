import React, { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react'
import { StatusChip } from '../../components/common/StatusChip'

const SELFIE_MAX_RETRIES = 3

interface ConsentSelfieStepProps {
  onComplete: () => void
}

export function ConsentSelfieStep({ onComplete }: ConsentSelfieStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasStream, setHasStream] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const [selfieCaptured, setSelfieCaptured] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

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
  }, [retryCount])

  function handleCapture() {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      localStorage.setItem('cd-recruit-selfie-data', dataUrl)
      setSelfieCaptured(true)
    }
  }

  function handleRetake() {
    setSelfieCaptured(false)
    setRetryCount(c => c + 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent)]/20">
            <Camera size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Baseline Verification Photo</h2>
            <p className="text-xs text-[var(--text-secondary)]">Take a clear face photo to establish your baseline identity.</p>
          </div>
        </div>
        <StatusChip
          variant={selfieCaptured ? 'success' : 'accent'}
          label={selfieCaptured ? 'PHOTO CAPTURED' : 'READY TO CAPTURE'}
          size="sm"
        />
      </div>

      <div className="max-w-md mx-auto space-y-4 text-center">
        <div className={`relative rounded-2xl overflow-hidden bg-black aspect-video border-2 transition-all ${selfieCaptured ? 'border-[var(--success)] shadow-[var(--shadow-md)]' : 'border-[var(--border)] shadow-[var(--shadow-md)]'}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 ${selfieCaptured ? 'hidden' : 'block'}`}
          />

          {!selfieCaptured && retryCount > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-60 rounded-full border-2 border-dashed border-[var(--accent)]/60 bg-[var(--accent-subtle)]/10" />
            </div>
          )}

          {selfieCaptured && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-xs text-[var(--success)] gap-2">
              <CheckCircle2 size={40} />
              <span className="font-semibold text-sm">Baseline Photo Saved!</span>
            </div>
          )}
        </div>

        {!selfieCaptured ? (
          <button
            onClick={handleCapture}
            disabled={!hasStream}
            className="px-6 py-3 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] inline-flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
          >
            <Camera size={16} />
            <span>Take Baseline Photo</span>
          </button>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleRetake}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Retake Photo</span>
            </button>
            <button
              onClick={onComplete}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] inline-flex items-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
            >
              <span>Confirm &amp; Continue</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {retryCount >= SELFIE_MAX_RETRIES && (
          <p className="text-xs text-[var(--warning)] font-medium">
            Note: Standard baseline review flag will be attached if retries exceed threshold.
          </p>
        )}
      </div>
    </div>
  )
}
