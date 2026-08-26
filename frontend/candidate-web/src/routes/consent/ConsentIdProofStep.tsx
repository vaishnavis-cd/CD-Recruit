import React, { useState, useRef } from 'react'
import { Upload, Camera, CheckCircle2, AlertCircle, Loader2, FileText, Image as ImageIcon } from 'lucide-react'
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

  React.useEffect(() => {
    if (isCameraActive && videoRef.current && mediaStreamRef.current) {
      const video = videoRef.current
      video.srcObject = mediaStreamRef.current
      video.onloadedmetadata = () => {
        video.play().catch((err) => console.warn('[ConsentIdProofStep] video.play() warning:', err))
      }
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
    }
  }, [isCameraActive])

  async function startCamera() {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      mediaStreamRef.current = stream
      setIsCameraActive(true)
      setErrorMsg(null)
    } catch (err: any) {
      setErrorMsg('Could not access camera for ID capture. Please select a file instead.')
    }
  }

  function stopCamera() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setIsCameraActive(false)
  }

  function captureCameraSnapshot() {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth || 640
    canvas.height = videoRef.current.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      setPreviewUrl(dataUrl)
      stopCamera()
    }
  }

  async function handleSubmit() {
    if (!previewUrl || !sessionId) {
      setErrorMsg('Please upload or capture your ID proof image.')
      return
    }

    setIsUploading(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/id-proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: previewUrl }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
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
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <FileText size={20} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[var(--foreground)]">Upload Government ID Proof</h2>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Please provide a clear photo of your official ID document (Driver's License, Passport, National ID, or Aadhaar Card). This will be encrypted and used strictly for identity verification.
            </p>
          </div>
        </div>

        {/* Camera Live View */}
        {isCameraActive ? (
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-[var(--border)]">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 z-10">
              <button
                type="button"
                onClick={stopCamera}
                className="px-4 py-2 text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
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
          <div className="relative rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--card-bg)] p-4 flex flex-col items-center gap-4">
            <div className="max-h-64 w-full flex items-center justify-center overflow-hidden rounded-lg bg-slate-950/60 p-2 border border-slate-800">
              <img src={previewUrl} alt="ID Proof Preview" className="max-h-56 object-contain rounded" />
            </div>
            <div className="flex items-center gap-3">
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
            className="border-2 border-dashed border-[var(--border)] hover:border-indigo-500/50 rounded-2xl p-8 text-center bg-[var(--card-bg)]/40 hover:bg-[var(--card-bg)] transition-all cursor-pointer space-y-4 group"
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
              <span className="text-[11px] text-[var(--muted-foreground)] uppercase tracking-wider font-mono">OR</span>
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
