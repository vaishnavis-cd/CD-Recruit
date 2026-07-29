import React, { useEffect, useRef, useState } from 'react'
import { FaceDetectionService } from '../../proctoring/face-detection.service'
import { StatusChip } from '../../components/common/StatusChip'

interface ConsentSelfieStepProps {
  onComplete: () => void
}

export function ConsentSelfieStep({ onComplete }: ConsentSelfieStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasStream, setHasStream] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const [selfieCaptured, setSelfieCaptured] = useState(false)
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null)
  const [isAligned, setIsAligned] = useState(false)
  const [flash, setFlash] = useState(false)

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

  const [guideFeedback, setGuideFeedback] = useState<string>("Position your face inside the circle guide")
  const [faceDetected, setFaceDetected] = useState(false)

  // Poll face detection for circle alignment check
  useEffect(() => {
    if (selfieCaptured) return

    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      try {
        const result = await FaceDetectionService.getInstance().detect(videoRef.current)
        if (result && result.alignment) {
          setFaceDetected(result.faceDetected)
          setIsAligned(result.alignment.isAligned)
          setGuideFeedback(result.alignment.guideFeedback)
        } else if (result && result.faceDetected && result.faceCount === 1) {
          setFaceDetected(true)
          setIsAligned(true)
          setGuideFeedback("Face aligned! Hold steady and capture baseline selfie.")
        } else if (result && result.faceCount > 1) {
          setFaceDetected(true)
          setIsAligned(false)
          setGuideFeedback("Multiple faces detected — please ensure you are alone.")
        } else {
          setFaceDetected(false)
          setIsAligned(false)
          setGuideFeedback("No face detected — center your face inside the guide.")
        }
      } catch {
        setIsAligned(false)
        setGuideFeedback("Align your face inside the guide.")
      }
    }, 100)

    return () => clearInterval(interval)
  }, [selfieCaptured])

  function handleCapture() {
    if (!videoRef.current || !isAligned) return

    // Trigger mild whitening camera shutter flash effect
    setFlash(true)
    setTimeout(() => setFlash(false), 450)

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
      setCapturedDataUrl(dataUrl)
      setTimeout(() => setSelfieCaptured(true), 250)
    }
  }

  return (
    <div>
      {/* Video Container matching Image 2 */}
      <div className="relative rounded-xl overflow-hidden aspect-video bg-[#1a1d24] border border-[var(--border)]">
        {!selfieCaptured ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transform -scale-x-100"
          />
        ) : (
          <img
            src={capturedDataUrl || ''}
            alt="Captured baseline selfie"
            className="w-full h-full object-cover"
          />
        )}

        {!hasStream && !selfieCaptured && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 bg-slate-900 font-mono-data">
            Starting camera feed…
          </div>
        )}

        {/* Mild camera shutter whitening flash overlay */}
        {flash && (
          <div className="absolute inset-0 bg-white/80 animate-cd-flash pointer-events-none z-10" />
        )}

        <div className="absolute top-3 left-3 z-20">
          <StatusChip
            tone={selfieCaptured ? 'success' : isAligned ? 'success' : faceDetected ? 'accent' : 'critical'}
            label={selfieCaptured ? 'Captured' : isAligned ? 'Face aligned' : faceDetected ? 'Adjust position' : 'No face'}
          />
        </div>

        {/* Real-time guidance overlay banner */}
        {!selfieCaptured && (
          <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center pointer-events-none">
            <div className={`px-3.5 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border transition-all duration-300 shadow-md ${
              isAligned
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                : faceDetected
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-rose-950/80 text-rose-300 border-rose-500/50'
            }`}>
              {guideFeedback}
            </div>
          </div>
        )}

        {/* Solid face guide oval matching frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div
            className={`w-44 h-56 rounded-[50%] border-2 transition-all duration-300 ${
              selfieCaptured || isAligned
                ? 'border-emerald-400 bg-emerald-400/10 scale-105 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                : faceDetected
                ? 'border-amber-400 bg-amber-400/10 shadow-[0_0_20px_rgba(251,191,36,0.3)]'
                : 'border-rose-400 bg-rose-400/10 shadow-[0_0_20px_rgba(248,113,113,0.3)]'
            }`}
          />
        </div>
      </div>

      {/* Bottom Action Bar matching Image 2 */}
      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          Neutral expression, good lighting, no hat or sunglasses.
        </p>

        {selfieCaptured ? (
          <button
            onClick={onComplete}
            type="button"
            className="btn-primary text-xs font-semibold px-6 py-2.5 cursor-pointer"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleCapture}
            disabled={!hasStream || !isAligned}
            type="button"
            className={`text-xs font-semibold px-6 py-2.5 rounded-lg transition-all ${
              isAligned && hasStream
                ? 'btn-primary cursor-pointer'
                : 'bg-slate-700 text-slate-400 opacity-60 cursor-not-allowed border border-slate-600'
            }`}
          >
            Capture Selfie
          </button>
        )}
      </div>
    </div>
  )
}
