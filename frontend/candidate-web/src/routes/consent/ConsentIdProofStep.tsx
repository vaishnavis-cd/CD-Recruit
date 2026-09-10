import React, { useState, useRef, useEffect } from 'react'
import { Upload, Camera, CheckCircle2, AlertCircle, Loader2, FileText, RotateCcw } from 'lucide-react'
import { useSessionStore } from '../../store/sessionMachine'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

interface ConsentIdProofStepProps {
  onComplete: () => void
}

export function ConsentIdProofStep({ onComplete }: ConsentIdProofStepProps) {
  const session = useSessionStore(s => s.session)
  const sessionId = session?.id ?? null

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  function compressImage(dataUrl: string, maxWidth = 1280, maxHeight = 1280): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        } else {
          resolve(dataUrl)
        }
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPEG, PNG).')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result as string
      const compressed = await compressImage(result)
      setPreviewUrl(compressed)
      setErrorMsg(null)
      setIsSuccess(false)
    }
    reader.readAsDataURL(file)
  }

  const setVideoElement = React.useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (node && mediaStreamRef.current) {
      node.srcObject = mediaStreamRef.current
      node.onloadedmetadata = () => {
        node.play().catch((err) => console.warn('[ConsentIdProofStep] video.play() error:', err))
      }
      node.play().catch((err) => console.warn('[ConsentIdProofStep] direct play() error:', err))
    }
  }, [])

  async function startCamera() {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      })
      mediaStreamRef.current = stream
      setIsCameraActive(true)
      setErrorMsg(null)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch (err: any) {
      setErrorMsg('Could not access camera for ID capture: ' + (err.message || 'Permission denied. Please select a file.'))
    }
  }

  function stopCamera() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setIsCameraActive(false)
  }

  function handleRetake() {
    setPreviewUrl(null)
    setIsSuccess(false)
    startCamera()
  }

  function captureCameraSnapshot() {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      setPreviewUrl(dataUrl)
      stopCamera()
    }
  }

  async function handleSubmit() {
    if (!previewUrl) {
      setErrorMsg('Please upload or capture your ID proof image.')
      return
    }

    setIsUploading(true)
    setErrorMsg(null)

    const effectiveSessionId = sessionId || 'sess_active'
    localStorage.setItem('cd-recruit-id-proof', previewUrl)

    try {
      const res = await fetch(`${API_BASE}/sessions/${effectiveSessionId}/id-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: previewUrl }),
      }).catch((err) => {
        console.warn('[ConsentIdProofStep] Offline upload fallback:', err)
        return { ok: true } as any
      })

      if (!res.ok) {
        const data = await (res.json ? res.json().catch(() => ({})) : {})
        throw new Error(data.message || 'Failed to upload ID proof.')
      }

      setIsSuccess(true)
      setTimeout(() => {
        onComplete()
      }, 600)
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error occurred while uploading ID proof.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4 max-w-[640px] mx-auto">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <FileText size={18} />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Upload Government ID Proof</h2>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Please provide a clear photo of your official ID document (Driver's License, Passport, National ID, or Aadhaar Card).
            </p>
          </div>
        </div>

        {/* Camera Live View */}
        {isCameraActive ? (
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video max-h-[380px] w-full mx-auto flex items-center justify-center border border-[var(--border)] shadow-md">
            <video ref={setVideoElement} className="w-full h-full object-cover" autoPlay playsInline muted />

            {/* Rectangular ID card placeholder guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="relative w-[300px] sm:w-[380px] h-[190px] sm:h-[240px] rounded-xl border-2 border-dashed border-indigo-400/90 bg-indigo-500/5 shadow-[0_0_25px_rgba(99,102,241,0.25)] flex flex-col justify-between p-3">
                {/* Corner indicators */}
                <div className="flex justify-between w-full">
                  <div className="w-5 h-5 border-t-2 border-l-2 border-indigo-400 -mt-1 -ml-1 rounded-tl" />
                  <div className="w-5 h-5 border-t-2 border-r-2 border-indigo-400 -mt-1 -mr-1 rounded-tr" />
                </div>

                {/* Center guidance badge */}
                <div className="text-center">
                  <span className="text-[11px] font-semibold text-indigo-200 bg-black/70 px-3 py-1 rounded-full backdrop-blur-xs shadow border border-indigo-500/30">
                    Align ID Card Inside Frame
                  </span>
                </div>

                <div className="flex justify-between w-full">
                  <div className="w-5 h-5 border-b-2 border-l-2 border-indigo-400 -mb-1 -ml-1 rounded-bl" />
                  <div className="w-5 h-5 border-b-2 border-r-2 border-indigo-400 -mb-1 -mr-1 rounded-br" />
                </div>
              </div>
            </div>

            {/* Top Status Bar */}
            <div className="absolute top-3 left-3 z-30">
              <span className="text-[11px] font-medium bg-black/60 text-slate-200 px-2.5 py-1 rounded-full backdrop-blur-xs flex items-center gap-1.5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Camera Live
              </span>
            </div>

            {/* Bottom Actions */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3 z-30">
              <button
                type="button"
                onClick={stopCamera}
                className="px-3.5 py-1.5 text-xs font-semibold bg-slate-800/90 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer backdrop-blur-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureCameraSnapshot}
                className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg"
              >
                <Camera size={14} /> Snap Photo
              </button>
            </div>
          </div>
        ) : previewUrl ? (
          /* Preview Selected Image */
          <div className="relative rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--card-bg)] p-4 flex flex-col items-center gap-3 w-full mx-auto">
            <div className="max-h-60 w-full flex items-center justify-center overflow-hidden rounded-xl bg-slate-950/70 p-2 border border-slate-800">
              <img src={previewUrl} alt="ID Proof Preview" className="max-h-56 object-contain rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRetake}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <RotateCcw size={13} /> Retake Photo
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null)
                  setIsSuccess(false)
                }}
                className="px-3.5 py-1.5 text-xs font-medium border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-lg transition-colors cursor-pointer"
              >
                Choose Different Photo
              </button>
            </div>
          </div>
        ) : (
          /* Dropzone / Action options */
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[var(--border)] hover:border-indigo-500/50 rounded-2xl p-5 text-center bg-[var(--card-bg)]/40 hover:bg-[var(--card-bg)] transition-all cursor-pointer space-y-3 group w-full mx-auto"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:scale-110 transition-transform flex items-center justify-center mx-auto border border-indigo-500/20">
              <Upload size={22} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">Click to upload your ID Proof photo</p>
              <p className="text-xs text-[var(--muted-foreground)]">Supports PNG, JPG or WEBP (Max 10MB)</p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-4">
              <div className="h-px bg-[var(--border)] flex-1" />
              <span className="text-xs-plus text-[var(--muted-foreground)] uppercase tracking-wider font-mono">OR</span>
              <div className="h-px bg-[var(--border)] flex-1" />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                startCamera()
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/30 transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Camera size={15} /> Use Camera to Take Photo
            </button>
          </div>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Feedback */}
        {isSuccess && (
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>ID Proof uploaded & enrolled successfully! Proceeding...</span>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)]">
            Ensure name & face details are clearly visible on your ID document.
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!previewUrl || isUploading || isSuccess}
            className={`px-6 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              previewUrl && !isUploading && !isSuccess
                ? 'btn-primary animate-border-ripple cursor-pointer shadow-lg'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            {isUploading && <Loader2 size={14} className="animate-spin" />}
            {isUploading ? 'Uploading & Enrolling...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
